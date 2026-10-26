import { Chess } from 'chess.js';
import { parseUci } from '../board/Board';
import { engine, type EngineLine } from '../engine/stockfish';
import { loadBook } from '../openings/book';

export const BOT_LEVELS = [400, 600, 800, 1000, 1200, 1400, 1600, 1800, 2000, 2200, 2500, 2800];

const ELO_KEY = 'ct-bot-elo';

export function playUrl(ucis: string[], side: 'white' | 'black', elo: number, back = 'learn'): string {
  return `play?moves=${ucis.join(',')}&side=${side}&elo=${elo}&back=${encodeURIComponent(back)}&t=${Date.now()}`;
}

export function lastBotElo(): number {
  return +(localStorage.getItem(ELO_KEY) || 0) || 1200;
}

export function saveBotElo(elo: number): void {
  localStorage.setItem(ELO_KEY, String(elo));
}

export function botLabel(elo: number): string {
  if (elo < 800) return 'Beginner';
  if (elo < 1200) return 'Casual';
  if (elo < 1600) return 'Intermediate';
  if (elo < 2000) return 'Advanced';
  if (elo < 2400) return 'Expert';
  return 'Master';
}

// Strength knobs interpolated from Elo: search depth, how loosely it picks among the top moves
// (softmax temperature in centipawns), and how often it plays a random legal move.
function strength(elo: number) {
  const t = (Math.min(2800, Math.max(400, elo)) - 400) / 2400;
  return {
    depth: Math.round(3 + t * 13),
    multipv: t > 0.9 ? 2 : 6,
    temp: 300 * (1 - t) ** 2 + 4,
    blunder: 0.12 * (1 - t) ** 2.5,
    bookChance: 0.5 + 0.5 * t,
  };
}

function scoreFor(l: EngineLine, white: boolean): number {
  const v = l.mate !== undefined ? (l.mate > 0 ? 10000 - l.mate : -10000 - l.mate) : (l.cp ?? 0);
  return white ? v : -v;
}

function weightedPick<T>(items: T[], weight: (x: T) => number): T {
  const ws = items.map(weight);
  let r = Math.random() * ws.reduce((s, w) => s + w, 0);
  for (let i = 0; i < items.length; i++) {
    r -= ws[i];
    if (r <= 0) return items[i];
  }
  return items[0];
}

export async function botMove(fen: string, elo: number): Promise<string | null> {
  const s = strength(elo);
  const chess = new Chess(fen);
  const legal = chess.moves({ verbose: true });
  if (!legal.length) return null;

  const book = await loadBook();
  const next = book.lookup(fen).next.filter((m) => legal.some((l) => l.from + l.to + (l.promotion || '') === m.uci));
  if (next.length && Math.random() < s.bookChance) return weightedPick(next, (m) => m.weight).uci;

  if (Math.random() < s.blunder) {
    const m = legal[Math.floor(Math.random() * legal.length)];
    return m.from + m.to + (m.promotion || '');
  }

  const res = await engine.analyze(fen, { depth: s.depth, multipv: s.multipv });
  const lines = res.lines.filter((l) => l.pv[0]);
  if (!lines.length) return res.best || null;
  const white = fen.split(' ')[1] === 'w';
  const top = scoreFor(lines[0], white);
  const pick = weightedPick(lines, (l) => Math.exp(-(top - scoreFor(l, white)) / s.temp));
  const uci = pick.pv[0];
  try {
    new Chess(fen).move(parseUci(uci));
    return uci;
  } catch {
    return res.best || null;
  }
}
