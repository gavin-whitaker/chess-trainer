import { settings } from '../settings';

export interface ExplorerMove {
  uci: string;
  san: string;
  white: number;
  draws: number;
  black: number;
  total: number;
  averageRating?: number;
}

export interface ExplorerResult {
  source: 'masters' | 'lichess';
  total: number;
  white: number;
  draws: number;
  black: number;
  moves: ExplorerMove[];
  opening?: { eco: string; name: string };
}

const cache = new Map<string, ExplorerResult | null>();

export function explorerAvailable(): boolean {
  return navigator.onLine && !!settings().explorerToken.trim();
}

// Lichess opening explorer. Since 2025 it requires a (free, scope-less) personal API token.
export async function explore(fen: string, source: 'masters' | 'lichess', ratingBand = '1200,1400,1600,1800,2000'): Promise<ExplorerResult | null> {
  const token = settings().explorerToken.trim();
  if (!token || !navigator.onLine) return null;
  const key = `${source}|${ratingBand}|${fen}`;
  if (cache.has(key)) return cache.get(key)!;
  const base = 'https://explorer.lichess.ovh';
  const q = new URLSearchParams({ fen, moves: '12', topGames: '0' });
  if (source === 'lichess') {
    q.set('variant', 'standard');
    q.set('speeds', 'blitz,rapid,classical');
    q.set('ratings', ratingBand);
    q.set('recentGames', '0');
  }
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${base}/${source}?${q}`, { headers: { Authorization: `Bearer ${token}` }, signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) {
      cache.set(key, null);
      return null;
    }
    const j = await res.json();
    const moves: ExplorerMove[] = (j.moves || []).map((m: { uci: string; san: string; white: number; draws: number; black: number; averageRating?: number }) => ({
      uci: m.uci,
      san: m.san,
      white: m.white,
      draws: m.draws,
      black: m.black,
      total: m.white + m.draws + m.black,
      averageRating: m.averageRating,
    }));
    const r: ExplorerResult = { source, total: j.white + j.draws + j.black, white: j.white, draws: j.draws, black: j.black, moves, opening: j.opening || undefined };
    cache.set(key, r);
    return r;
  } catch {
    return null;
  }
}

// Castling is reported as king-takes-rook by some sources; normalize to standard king moves.
export function normalizeUci(uci: string): string {
  const map: Record<string, string> = { e1h1: 'e1g1', e1a1: 'e1c1', e8h8: 'e8g8', e8a8: 'e8c8' };
  return map[uci] || uci;
}

export function fmtGames(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + 'K';
  return String(n);
}
