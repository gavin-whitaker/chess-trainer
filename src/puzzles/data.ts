// Row layout written by scripts/build-data.mjs
export type PuzzleRow = [id: string, fen: string, moves: string, rating: number, themes: string, openings: string];

export interface Puzzle {
  id: string;
  fen: string;
  moves: string[];
  rating: number;
  themes: string[];
  openings: string;
}

export interface PuzzleIndex {
  minRating: number;
  total: number;
  bands: { band: number; key: string; count: number }[];
  themes: { theme: string; count: number; available: number }[];
}

let indexP: Promise<PuzzleIndex> | null = null;
const shardCache = new Map<string, Promise<PuzzleRow[]>>();

export function toPuzzle(r: PuzzleRow): Puzzle {
  return { id: r[0], fen: r[1], moves: r[2].split(' '), rating: r[3], themes: r[4].split(' ').filter(Boolean), openings: r[5] };
}

export function puzzleIndex(): Promise<PuzzleIndex> {
  if (!indexP) indexP = fetch('/data/puzzles/index.json').then((r) => r.json());
  return indexP;
}

function shard(file: string): Promise<PuzzleRow[]> {
  if (!shardCache.has(file)) {
    const p = fetch(`/data/puzzles/${file}.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`Missing puzzle file ${file}`);
        return r.json();
      })
      .catch((e) => {
        shardCache.delete(file);
        throw e;
      });
    shardCache.set(file, p);
  }
  return shardCache.get(file)!;
}

export async function bandRows(rating: number): Promise<PuzzleRow[]> {
  const idx = await puzzleIndex();
  const target = Math.min(Math.max(Math.floor(rating / 100) * 100, idx.bands[0].band), idx.bands[idx.bands.length - 1].band);
  const band = idx.bands.reduce((best, b) => (Math.abs(b.band - target) < Math.abs(best.band - target) ? b : best), idx.bands[0]);
  return shard(band.key);
}

export function themeRows(theme: string): Promise<PuzzleRow[]> {
  return shard(`t-${theme}`);
}

// Pick an unseen puzzle close to the target rating.
export async function pickPuzzle(target: number, seen: Set<string>, spread = 75): Promise<Puzzle> {
  const rows = await bandRows(target);
  for (const s of [spread, spread * 2, spread * 4, 10000]) {
    const pool = rows.filter((r) => Math.abs(r[3] - target) <= s && !seen.has(r[0]));
    if (pool.length) return toPuzzle(pool[Math.floor(Math.random() * pool.length)]);
  }
  return toPuzzle(rows[Math.floor(Math.random() * rows.length)]);
}

export async function dailyPuzzle(): Promise<Puzzle> {
  const d = new Date();
  const seed = d.getFullYear() * 1000 + Math.floor((d.getTime() - new Date(d.getFullYear(), 0, 0).getTime()) / 86400000);
  const rows = await bandRows(1400 + (seed % 5) * 100);
  return toPuzzle(rows[(seed * 7919) % rows.length]);
}

export const THEME_LABELS: Record<string, string> = {
  advancedPawn: 'Advanced Pawn',
  anastasiaMate: "Anastasia's Mate",
  arabianMate: 'Arabian Mate',
  attackingF2F7: 'Attacking f2/f7',
  attraction: 'Attraction',
  backRankMate: 'Back Rank Mate',
  bishopEndgame: 'Bishop Endgame',
  bodenMate: "Boden's Mate",
  capturingDefender: 'Remove the Defender',
  castling: 'Castling',
  clearance: 'Clearance',
  defensiveMove: 'Defensive Move',
  deflection: 'Deflection',
  discoveredAttack: 'Discovered Attack',
  doubleBishopMate: 'Double Bishop Mate',
  doubleCheck: 'Double Check',
  dovetailMate: 'Dovetail Mate',
  enPassant: 'En Passant',
  endgame: 'Endgame',
  exposedKing: 'Exposed King',
  fork: 'Fork',
  hangingPiece: 'Hanging Piece',
  hookMate: 'Hook Mate',
  interference: 'Interference',
  intermezzo: 'Intermezzo',
  kingsideAttack: 'Kingside Attack',
  knightEndgame: 'Knight Endgame',
  mate: 'Checkmate',
  mateIn1: 'Mate in 1',
  mateIn2: 'Mate in 2',
  mateIn3: 'Mate in 3',
  mateIn4: 'Mate in 4',
  mateIn5: 'Mate in 5+',
  middlegame: 'Middlegame',
  opening: 'Opening',
  pawnEndgame: 'Pawn Endgame',
  pin: 'Pin',
  promotion: 'Promotion',
  queenEndgame: 'Queen Endgame',
  queenRookEndgame: 'Queen & Rook Endgame',
  queensideAttack: 'Queenside Attack',
  quietMove: 'Quiet Move',
  rookEndgame: 'Rook Endgame',
  sacrifice: 'Sacrifice',
  skewer: 'Skewer',
  smotheredMate: 'Smothered Mate',
  trappedPiece: 'Trapped Piece',
  underPromotion: 'Underpromotion',
  xRayAttack: 'X-Ray Attack',
  zugzwang: 'Zugzwang',
  killBoxMate: 'Kill Box Mate',
  vukovicMate: 'Vukovic Mate',
  cornerMate: 'Corner Mate',
  balestraMate: 'Balestra Mate',
  blindSwineMate: 'Blind Swine Mate',
  triangleMate: 'Triangle Mate',
  operaMate: 'Opera Mate',
  pillsburysMate: "Pillsbury's Mate",
  morphysMate: "Morphy's Mate",
  epauletteMate: 'Epaulette Mate',
  swallowstailMate: "Swallow's Tail Mate",
  greco: "Greco's Mate",
  lolli: "Lolli's Mate",
};

export function themeLabel(t: string): string {
  return THEME_LABELS[t] || t.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase());
}
