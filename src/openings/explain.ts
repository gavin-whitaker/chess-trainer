import type { Move } from 'chess.js';

const NAMES: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const CENTER = new Set(['d4', 'e4', 'd5', 'e5']);
const EXT_CENTER = new Set(['c4', 'c5', 'f4', 'f5', 'c3', 'c6', 'f3', 'f6']);

// One-line coaching explanation for a book move, from the mover's perspective.
export function explainMove(m: Move, ply: number): string {
  const piece = NAMES[m.piece];
  if (m.isKingsideCastle() || m.isQueensideCastle()) return 'Castle to tuck the king away and bring the rook toward the center.';
  if (m.san.includes('#')) return 'Checkmate!';
  if (m.captured) {
    const cap = NAMES[m.captured];
    if (m.piece === 'p' && m.captured === 'p') return `Trade pawns with ${m.san}, opening lines for your pieces.`;
    return `Capture the ${cap} with your ${piece}.`;
  }
  if (m.san.includes('+')) return `Give check with the ${piece}, gaining time.`;
  if (m.piece === 'p') {
    if (CENTER.has(m.to)) return ply < 4 ? `Grab the center with ${m.san}. It frees your bishop and queen.` : `Push ${m.san} to claim more central space.`;
    if (EXT_CENTER.has(m.to)) return `${m.san} supports the fight for the center from the side.`;
    if (['g3', 'b3', 'g6', 'b6'].includes(m.to)) return `${m.san} prepares a fianchetto: the bishop will sit on the long diagonal.`;
    if (['a3', 'h3', 'a6', 'h6'].includes(m.to)) return `${m.san} is a useful waiting move that takes squares away from enemy pieces.`;
    return `${m.san} gains space on the ${m.to[0] <= 'c' ? 'queenside' : m.to[0] >= 'f' ? 'kingside' : 'center'}.`;
  }
  if (m.piece === 'n') return `Develop the knight to ${m.to}, toward the center where it controls the most squares.`;
  if (m.piece === 'b') {
    if (['g2', 'b2', 'g7', 'b7'].includes(m.to)) return 'Fianchetto the bishop onto the long diagonal.';
    if (['b5', 'b4', 'g5', 'g4'].includes(m.to)) return `${m.san} pins or pressures an enemy piece.`;
    if (['c4', 'c5'].includes(m.to)) return `${m.san} aims the bishop at the weak f-pawn next to the king.`;
    return `Develop the bishop to ${m.to}.`;
  }
  if (m.piece === 'q') return `${m.san} brings the queen out to apply pressure. Keep it safe from attacks.`;
  if (m.piece === 'r') return `${m.san} puts the rook on a more useful file.`;
  return `Play ${m.san}.`;
}
