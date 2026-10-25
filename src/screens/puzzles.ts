import { h, icon } from '../ui/dom';
import { listItem, sectionTitle } from '../ui/layout';
import { navigate } from '../router';
import { profile, today } from '../stats';
import { puzzleIndex } from '../puzzles/data';
import type { ScreenCtx } from '../router';

export async function puzzlesHub({ root }: ScreenCtx) {
  const p = await profile();
  const idx = await puzzleIndex().catch(() => null);
  const best = (k: string) => p.rushBest[k] ?? 0;
  root.append(
    h('div.page-title', 'Puzzles'),
    h('div.card', h('div.hero',
      h('div.hero-body',
        h('div.hero-kicker', 'Puzzle rating'),
        h('div.hero-title', { style: { fontSize: '34px' } }, String(p.rating)),
        h('button.btn.green', { onclick: () => navigate('puzzles/rated') }, 'Solve Puzzles'),
      ),
    )),
    h('div.tiles',
      tile('bolt', 'c-orange', 'Puzzle Rush', `Best ${Math.max(best('3'), best('5'), best('survival'))}`, () => navigate('puzzles/rush')),
      tile('target', 'c-blue', 'Themes', 'Drill one tactic', () => navigate('puzzles/themes')),
      tile('repeat', 'c-green', 'Woodpecker', 'Repeat sets faster', () => navigate('puzzles/woodpecker')),
      tile('star', 'c-gold', 'Daily Puzzle', p.dailySolved === today() ? 'Solved today ✓' : 'New every day', () => navigate('puzzles/daily')),
    ),
    sectionTitle('Your stats'),
    h('div.list',
      listItem({ title: 'Puzzles solved', right: String(p.solved), icon: icon('check', 'c-green') }),
      listItem({ title: 'Accuracy', right: p.solved + p.failed ? `${Math.round((p.solved / (p.solved + p.failed)) * 100)}%` : '—', icon: icon('target', 'c-blue') }),
      listItem({ title: 'Highest rating', right: String(p.peak), icon: icon('trophy', 'c-gold') }),
    ),
  );
  if (idx) root.append(h('div.muted', { style: { textAlign: 'center', fontSize: '12px', padding: '6px 20px 20px' } }, `${idx.total.toLocaleString()} puzzles rated ${idx.minRating}+ from the Lichess puzzle database, available offline`));
}

function tile(ic: Parameters<typeof icon>[0], color: string, title: string, sub: string, onclick: () => void): HTMLElement {
  return h('button.tile', { onclick }, icon(ic, color), h('div.tile-title', title), h('div.tile-sub', sub));
}
