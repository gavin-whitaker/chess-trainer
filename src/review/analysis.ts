import { Chess, type Move, type Square } from 'chess.js';
import { parseUci } from '../board/Board';
import { Engine } from '../engine/stockfish';
import { kvGet, kvSet } from '../db';
import type { Book } from '../openings/book';

export type Outcome = 'win' | 'loss' | 'draw';

export function reviewUrl(ucis: string[], side: 'white' | 'black', opponent: string, result: Outcome): string {
  return `review?moves=${ucis.join(',')}&side=${side}&opp=${encodeURIComponent(opponent)}&result=${result}`;
}

export type Cls = 'brilliant' | 'great' | 'best' | 'excellent' | 'good' | 'book' | 'forced' | 'inaccuracy' | 'mistake' | 'miss' | 'blunder';

export const CLS_META: Record<Cls, { label: string; symbol: string; color: string }> = {
  brilliant: { label: 'Brilliant', symbol: '!!', color: '#1baca6' },
  great: { label: 'Great', symbol: '!', color: '#5c8bb0' },
  best: { label: 'Best', symbol: '★', color: '#81b64c' },
  excellent: { label: 'Excellent', symbol: '👍', color: '#96bc4b' },
  good: { label: 'Good', symbol: '✓', color: '#95af8a' },
  book: { label: 'Book', symbol: '📖', color: '#a88865' },
  forced: { label: 'Forced', symbol: '→', color: '#8f8d8a' },
  inaccuracy: { label: 'Inaccuracy', symbol: '?!', color: '#f7c045' },
  mistake: { label: 'Mistake', symbol: '?', color: '#ffa459' },
  miss: { label: 'Miss', symbol: '✕', color: '#ff7769' },
  blunder: { label: 'Blunder', symbol: '??', color: '#fa412d' },
};

export const CLS_ORDER: Cls[] = ['brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder'];
export const BAD: Cls[] = ['inaccuracy', 'mistake', 'miss', 'blunder'];

// Engine verdict on a position, scores from White's point of view.
export interface PosEval {
  cp?: number;
  mate?: number;
  best: string;
  pv: string[];
  second?: { cp?: number; mate?: number; uci: string };
}

export interface MoveReview {
  ply: number;
  color: 'w' | 'b';
  san: string;
  uci: string;
  from: string;
  to: string;
  cls: Cls;
  loss: number;
  accuracy: number;
  bestSan: string;
  bestUci: string;
  text: string;
  phase: 'opening' | 'middlegame' | 'endgame';
}

export interface GameReview {
  fens: string[];
  evals: PosEval[];
  moves: MoveReview[];
}

const VAL: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const NAME: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };

// White's winning chances, 0..100 (Lichess model).
export function wpWhite(s: { cp?: number; mate?: number }): number {
  if (s.mate !== undefined) return s.mate > 0 ? 100 : 0;
  const cp = Math.max(-1000, Math.min(1000, s.cp ?? 0));
  return 100 / (1 + Math.exp(-0.00368208 * cp));
}

function wpFor(s: { cp?: number; mate?: number }, c: 'w' | 'b'): number {
  const w = wpWhite(s);
  return c === 'w' ? w : 100 - w;
}

function moveAccuracy(loss: number): number {
  return Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * loss) - 3.1669));
}

// Lichess-style game accuracy: blend of the mean and the harmonic mean, so a few blunders hurt.
// Book and forced moves take no skill, so they don't count.
export function gameAccuracy(moves: MoveReview[]): number {
  const counted = moves.filter((m) => m.cls !== 'book' && m.cls !== 'forced');
  if (!counted.length) return moves.length ? 100 : 0;
  const accs = counted.map((m) => Math.max(1, m.accuracy));
  const mean = accs.reduce((s, a) => s + a, 0) / accs.length;
  const harmonic = accs.length / accs.reduce((s, a) => s + 1 / a, 0);
  return Math.round(((mean + harmonic) / 2) * 10) / 10;
}

const RATING_CURVE: [number, number][] = [[0, 100], [50, 250], [60, 400], [70, 700], [75, 900], [80, 1150], [85, 1500], [88, 1800], [91, 2100], [94, 2450], [97, 2800], [100, 3000]];

export function estimatedRating(accuracy: number): number {
  for (let i = 1; i < RATING_CURVE.length; i++) {
    const [a1, r1] = RATING_CURVE[i];
    const [a0, r0] = RATING_CURVE[i - 1];
    if (accuracy <= a1) return Math.round((r0 + ((accuracy - a0) / (a1 - a0)) * (r1 - r0)) / 50) * 50;
  }
  return 3000;
}

function terminalEval(c: Chess): PosEval | null {
  if (c.isCheckmate()) return { cp: c.turn() === 'w' ? -10000 : 10000, best: '', pv: [] };
  if (c.isGameOver()) return { cp: 0, best: '', pv: [] };
  return null;
}

// Review analysis runs on its own engines so it never interrupts the bot or the analysis board,
// and positions are queued while the game is still being played.
const POOL_SIZE = 2;
const pool: { engine: Engine; chain: Promise<unknown>; pending: number }[] = [];
const memo = new Map<string, Promise<PosEval>>();

function idleEngine() {
  if (!pool.length) for (let i = 0; i < POOL_SIZE; i++) pool.push({ engine: new Engine(16), chain: Promise.resolve(), pending: 0 });
  return pool.reduce((a, b) => (b.pending < a.pending ? b : a));
}

function evalPosition(fen: string): Promise<PosEval> {
  const key = fen.split(' ').slice(0, 4).join(' ');
  const known = memo.get(key);
  if (known) return known;
  const t = terminalEval(new Chess(fen));
  if (t) return Promise.resolve(t);
  const slot = idleEngine();
  slot.pending++;
  const job = slot.chain.then(async () => {
    const r = await slot.engine.analyze(fen, { depth: 16, movetime: 700, multipv: 2 });
    slot.pending--;
    const [a, b] = r.lines;
    return {
      cp: a?.cp,
      mate: a?.mate,
      best: r.best || a?.pv[0] || '',
      pv: a?.pv.slice(0, 8) ?? [],
      second: b?.pv[0] ? { cp: b.cp, mate: b.mate, uci: b.pv[0] } : undefined,
    };
  });
  slot.chain = job;
  memo.set(key, job);
  return job;
}

// Start analyzing a position in the background (called after each move of a game).
export function preAnalyze(fen: string): void {
  void evalPosition(fen);
}

// Engine evals for every position of the game, cached so reopening a review is instant.
export async function evaluateGame(ucis: string[], onProgress: (done: number, total: number) => void, isAlive: () => boolean): Promise<{ fens: string[]; evals: PosEval[] } | null> {
  const c = new Chess();
  const fens = [c.fen()];
  for (const u of ucis) {
    c.move(parseUci(u));
    fens.push(c.fen());
  }
  const key = ucis.join(',');
  const cache = await kvGet<Record<string, PosEval[]>>('reviews', {});
  if (cache[key]?.length === fens.length) return { fens, evals: cache[key] };
  let done = 0;
  onProgress(0, fens.length);
  const evals = await Promise.all(fens.map((f) => evalPosition(f).then((e) => {
    if (isAlive()) onProgress(++done, fens.length);
    return e;
  })));
  if (!isAlive()) return null;
  const keys = Object.keys(cache);
  if (keys.length >= 10) delete cache[keys[0]];
  cache[key] = evals;
  await kvSet('reviews', cache);
  return { fens, evals };
}

function material(c: Chess, color: 'w' | 'b'): number {
  let s = 0;
  for (const row of c.board()) for (const p of row) if (p && p.color === color) s += VAL[p.type];
  return s;
}

function pieceCount(c: Chess): number {
  let n = 0;
  for (const row of c.board()) for (const p of row) if (p && p.type !== 'p' && p.type !== 'k') n++;
  return n;
}

function sanOf(fen: string, uci: string): string {
  try {
    return new Chess(fen).move(parseUci(uci)).san;
  } catch {
    return uci;
  }
}

// Biggest piece the given side loses while playing out a line (captures of `victim` pieces).
function lineSwing(fen: string, pv: string[], side: 'w' | 'b', plies = 5): { net: number; lost?: string; won?: string } {
  const c = new Chess(fen);
  const start = material(c, side) - material(c, side === 'w' ? 'b' : 'w');
  let lost: string | undefined;
  let won: string | undefined;
  for (const u of pv.slice(0, plies)) {
    let m: Move;
    try {
      m = c.move(parseUci(u));
    } catch {
      break;
    }
    if (m.captured) {
      if (m.color === side) {
        if (!won || VAL[m.captured] > VAL[won]) won = m.captured;
      } else if (!lost || VAL[m.captured] > VAL[lost]) lost = m.captured;
    }
  }
  const end = material(c, side) - material(c, side === 'w' ? 'b' : 'w');
  return { net: end - start, lost, won };
}

// Static exchange on `sq`: best material the side to move can win by trading off captures there.
function see(c: Chess, sq: string, depth = 0): number {
  if (depth > 8) return 0;
  const target = c.get(sq as Square);
  if (!target) return 0;
  const caps = c.moves({ verbose: true }).filter((x) => x.to === sq);
  if (!caps.length) return 0;
  const m = caps.reduce((a, b) => (VAL[b.piece] < VAL[a.piece] ? b : a));
  c.move(m);
  const gain = VAL[target.type] - see(c, sq, depth + 1);
  c.undo();
  return Math.max(0, gain);
}

// The move leaves its piece to be won: the opponent comes out at least 2 points ahead on that square.
function isSacrifice(after: Chess, m: Move): boolean {
  if (VAL[m.promotion || m.piece] < 3) return false;
  const taken = m.captured ? VAL[m.captured] : 0;
  return see(after, m.to) - taken >= 2;
}

export function reviewGame(fens: string[], evals: PosEval[], ucis: string[], book: Book): MoveReview[] {
  const out: MoveReview[] = [];
  let inBook = true;
  for (let i = 0; i < ucis.length; i++) {
    const before = new Chess(fens[i]);
    const color = before.turn();
    const legal = before.moves().length;
    const m = before.move(parseUci(ucis[i]));
    const after = before;
    const eb = evals[i];
    const ea = evals[i + 1];
    const wpBefore = wpFor(eb, color);
    const wpAfter = wpFor(ea, color);
    const loss = Math.max(0, wpBefore - wpAfter);
    const bestUci = eb.best;
    const bestSan = bestUci ? sanOf(fens[i], bestUci) : '';
    const isBest = ucis[i] === bestUci || loss < 0.6;
    const bookMove = inBook && book.lookup(fens[i]).next.some((b) => b.uci === ucis[i]);
    if (!bookMove) inBook = false;
    const prev = out[i - 1];

    let cls: Cls;
    if (bookMove) cls = 'book';
    else if (legal === 1) cls = 'forced';
    else if (isBest && wpAfter >= 50 && isSacrifice(after, m)) cls = 'brilliant';
    else if (
      isBest &&
      eb.second &&
      wpBefore < 97 &&
      wpFor(eb.second, color) < wpBefore - 15 &&
      !(prev && prev.to === m.to && m.captured)
    ) cls = 'great';
    else if (isBest) cls = 'best';
    else if (loss < 2) cls = 'excellent';
    else if (loss < 5) cls = 'good';
    else if (loss < 10) cls = 'inaccuracy';
    else if (loss < 20) cls = 'mistake';
    else cls = 'blunder';

    const missedMate = eb.mate !== undefined && (color === 'w' ? eb.mate > 0 : eb.mate < 0) && !(ea.mate !== undefined && (color === 'w' ? ea.mate > 0 : ea.mate < 0));
    if ((cls === 'mistake' || cls === 'blunder' || cls === 'inaccuracy') && ((prev && (prev.cls === 'mistake' || prev.cls === 'blunder')) || missedMate) && wpAfter >= 30) cls = 'miss';

    const phase = i < 20 && (bookMove || i < 16) ? 'opening' : pieceCount(after) <= 6 ? 'endgame' : 'middlegame';
    out.push({
      ply: i,
      color,
      san: m.san,
      uci: ucis[i],
      from: m.from,
      to: m.to,
      cls,
      loss,
      accuracy: bookMove || legal === 1 ? 100 : moveAccuracy(loss),
      bestSan,
      bestUci,
      text: '',
      phase,
    });
    out[i].text = explain(out[i], fens, evals, m);
  }
  return out;
}

function explain(r: MoveReview, fens: string[], evals: PosEval[], m: Move): string {
  const san = `<b>${r.san}</b>`;
  const best = `<b>${r.bestSan}</b>`;
  const eb = evals[r.ply];
  const ea = evals[r.ply + 1];
  const opp = r.color === 'w' ? 'b' : 'w';
  const mateFor = (e: PosEval, c: 'w' | 'b') => e.mate !== undefined && (c === 'w' ? e.mate > 0 : e.mate < 0);
  const afterChess = new Chess(fens[r.ply + 1]);
  if (afterChess.isCheckmate()) return `${san} is checkmate!`;

  switch (r.cls) {
    case 'book':
      return `${san} is a book move.`;
    case 'forced':
      return `${san} is the only legal move.`;
    case 'brilliant':
      return `${san} is brilliant! It gives up the ${NAME[m.promotion || m.piece]}, but the engine confirms it works.`;
    case 'great':
      return `${san} is a great move. It was the only good move here.`;
    case 'best': {
      const gain = lineSwing(fens[r.ply], eb.pv, r.color);
      if (mateFor(eb, r.color)) return `${san} is the best move. Mate is coming.`;
      if (gain.net >= 2 && gain.won) return `${san} is the best move, winning a ${NAME[gain.won]}.`;
      return `${san} is the best move.`;
    }
    case 'excellent':
      return `${san} is an excellent move.`;
    case 'good':
      return `${san} is good. ${best} was a bit more precise.`;
  }

  // Inaccuracy, mistake, miss, blunder: say what went wrong and what was better.
  const parts: string[] = [`${san} is ${r.cls === 'inaccuracy' ? 'an inaccuracy' : r.cls === 'miss' ? 'a missed chance' : `a ${r.cls}`}.`];
  if (mateFor(ea, opp)) parts.push(`It allows mate in ${Math.abs(ea.mate!)}.`);
  else {
    const punish = lineSwing(fens[r.ply], [r.uci, ...ea.pv], r.color, 6);
    const reply = ea.pv[0] ? sanOf(fens[r.ply + 1], ea.pv[0]) : '';
    if (punish.net <= -2 && punish.lost) {
      const hangs = ea.pv[0]?.slice(2, 4) === r.to;
      parts.push(hangs ? `It hangs your ${NAME[punish.lost]} to <b>${reply}</b>.` : `After <b>${reply}</b> you lose a ${NAME[punish.lost]}.`);
    }
  }
  if (mateFor(eb, r.color)) parts.push(`You had mate in ${Math.abs(eb.mate!)} with ${best}.`);
  else if (r.bestSan) {
    const gain = lineSwing(fens[r.ply], eb.pv, r.color);
    parts.push(gain.net >= 2 && gain.won ? `${best} would have won a ${NAME[gain.won]}.` : `The best move was ${best}.`);
  }
  return parts.join(' ');
}

// Rewrite "your" to "its" for the bot's moves.
export function forBot(text: string): string {
  return text.replace(/\byour\b/g, 'its').replace(/\bYou had\b/g, 'It had').replace(/\byou lose\b/g, 'it loses');
}

export function phaseAccuracy(moves: MoveReview[], phase: MoveReview['phase']): number | null {
  const list = moves.filter((m) => m.phase === phase);
  return list.length ? gameAccuracy(list) : null;
}
