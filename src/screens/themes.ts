import { h, icon } from '../ui/dom';
import { header, listItem, sectionTitle } from '../ui/layout';
import { navigate } from '../router';
import { puzzleIndex, themeRows, themeLabel, toPuzzle } from '../puzzles/data';
import { profile } from '../stats';
import { seenIds } from '../db';
import { puzzleTrainer } from './puzzleRated';
import type { ScreenCtx } from '../router';

const GROUPS: { title: string; themes: string[] }[] = [
  { title: 'Tactics', themes: ['fork', 'pin', 'skewer', 'discoveredAttack', 'discoveredCheck', 'doubleCheck', 'deflection', 'attraction', 'decoy', 'clearance', 'interference', 'intermezzo', 'xRayAttack', 'capturingDefender', 'hangingPiece', 'trappedPiece', 'sacrifice', 'quietMove', 'defensiveMove', 'zugzwang', 'collinearMove'] },
  { title: 'Checkmates', themes: ['mateIn1', 'mateIn2', 'mateIn3', 'mateIn4', 'mateIn5', 'backRankMate', 'smotheredMate', 'anastasiaMate', 'arabianMate', 'bodenMate', 'doubleBishopMate', 'dovetailMate', 'hookMate', 'epauletteMate', 'operaMate', 'pillsburysMate', 'morphysMate', 'cornerMate', 'killBoxMate', 'vukovicMate', 'triangleMate', 'balestraMate', 'blindSwineMate', 'swallowstailMate'] },
  { title: 'Phases', themes: ['opening', 'middlegame', 'endgame', 'kingsideAttack', 'queensideAttack', 'attackingF2F7', 'exposedKing', 'advancedPawn', 'promotion', 'underPromotion', 'enPassant', 'castling'] },
  { title: 'Endgames', themes: ['pawnEndgame', 'rookEndgame', 'bishopEndgame', 'knightEndgame', 'queenEndgame', 'queenRookEndgame'] },
];

export async function themesScreen({ root }: ScreenCtx) {
  const [idx, p] = await Promise.all([puzzleIndex(), profile()]);
  const available = new Set(idx.themes.map((t) => t.theme));
  root.append(header('Themes', { back: 'puzzles' }));
  // Weakest themes first: where you've played at least 5 and accuracy is lowest.
  const weak = Object.entries(p.themeStats)
    .filter(([t, s]) => s.n >= 5 && available.has(t))
    .sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)
    .slice(0, 3);
  if (weak.length) {
    root.append(sectionTitle('Recommended for you'), h('div.list', weak.map(([t, s]) => row(t, `${Math.round((s.ok / s.n) * 100)}% accuracy · your weakest`))));
  }
  for (const g of GROUPS) {
    const items = g.themes.filter((t) => available.has(t));
    if (!items.length) continue;
    root.append(sectionTitle(g.title), h('div.list', items.map((t) => {
      const s = p.themeStats[t];
      return row(t, s ? `${s.ok}/${s.n} solved` : 'Not tried yet');
    })));
  }
}

function row(theme: string, sub: string): HTMLElement {
  return listItem({ title: themeLabel(theme), sub, icon: icon('target', 'c-blue'), onclick: () => navigate(`puzzles/theme?t=${theme}`) });
}

export async function themePlayScreen({ root, params }: ScreenCtx) {
  const theme = params.get('t') || 'fork';
  return puzzleTrainer(root, {
    title: themeLabel(theme),
    back: 'puzzles/themes',
    mode: 'theme',
    rated: false,
    next: async () => {
      const [rows, p, seen] = await Promise.all([themeRows(theme), profile(), seenIds()]);
      const near = rows.filter((r) => Math.abs(r[3] - p.rating) < 250 && !seen.has(r[0]));
      const pool = near.length ? near : rows.filter((r) => !seen.has(r[0]));
      const list = pool.length ? pool : rows;
      return toPuzzle(list[Math.floor(Math.random() * list.length)]);
    },
  });
}
