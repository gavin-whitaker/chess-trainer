import { profile } from '../stats';
import { allAttempts } from '../db';
import { themeLabel } from '../puzzles/data';
import { lessonRecords } from '../openings/progress';
import { loadBook } from '../openings/book';
import { h, icon } from '../ui/dom';
import { listItem, sectionTitle } from '../ui/layout';
import { navigate } from '../router';
import type { ScreenCtx } from '../router';

const IGNORE = new Set(['short', 'long', 'veryLong', 'oneMove', 'crushing', 'advantage', 'equality', 'mate', 'middlegame', 'opening', 'endgame', 'master', 'masterVsMaster', 'superGM']);

export async function profileScreen({ root }: ScreenCtx) {
  const [p, attempts, recs, book] = await Promise.all([profile(), allAttempts(), lessonRecords(), loadBook().catch(() => null)]);
  const total = p.solved + p.failed;
  const last7 = attempts.filter((a) => a.at > Date.now() - 7 * 86400000);

  root.append(
    h('div.page-title', h('span', 'Profile'), h('button.icon-btn', { onclick: () => navigate('settings') }, icon('settings'))),
    h('div.stat-row',
      h('div.stat', h('div.stat-val', String(p.rating)), h('div.stat-label', 'Puzzle rating')),
      h('div.stat', h('div.stat-val', String(p.peak)), h('div.stat-label', 'Peak')),
      h('div.stat', h('div.stat-val', total ? `${Math.round((p.solved / total) * 100)}%` : '—'), h('div.stat-label', 'Accuracy')),
    ),
    h('div.card', h('div', { style: { fontWeight: '800', marginBottom: '8px' } }, 'Rating history'), chart(p.history.map((x) => x.r))),
  );

  root.append(
    sectionTitle('Activity'),
    h('div.list',
      listItem({ title: 'Day streak', right: `${p.streakDays} 🔥` }),
      listItem({ title: 'Puzzles this week', right: String(last7.length) }),
      listItem({ title: 'Total puzzles', right: String(total) }),
      listItem({ title: 'Puzzle Rush best (3 min)', right: String(p.rushBest['3'] ?? 0) }),
      listItem({ title: 'Puzzle Rush best (5 min)', right: String(p.rushBest['5'] ?? 0) }),
      listItem({ title: 'Puzzle Rush best (Survival)', right: String(p.rushBest['survival'] ?? 0) }),
    ),
  );

  const themes = Object.entries(p.themeStats).filter(([t, s]) => !IGNORE.has(t) && s.n >= 3);
  if (themes.length) {
    const sorted = themes.sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n);
    root.append(sectionTitle('Tactics: weakest first'), h('div.card', sorted.slice(0, 12).map(([t, s]) => {
      const pct = Math.round((s.ok / s.n) * 100);
      return h('button.bar-row', { style: { width: '100%', textAlign: 'left' }, onclick: () => navigate(`puzzles/theme?t=${t}`) },
        h('span.name', themeLabel(t)),
        h('div.progress', h('div', { style: { width: `${pct}%`, background: pct < 50 ? 'var(--red-soft)' : pct < 75 ? 'var(--orange)' : 'var(--green)' } })),
        h('span.pct', `${pct}%`),
      );
    })));
  }

  const lessonEntries = Object.entries(recs);
  if (book && lessonEntries.length) {
    const fam = new Map<string, number>();
    for (const [idx, r] of lessonEntries) {
      const l = book.lines[+idx];
      if (l) fam.set(l.family, (fam.get(l.family) ?? 0) + r.stars);
    }
    root.append(sectionTitle('Opening mastery'), h('div.card', [...fam.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([f, stars]) => {
      const lines = book.families.get(f)?.length ?? 1;
      const pct = Math.round((stars / (lines * 3)) * 100);
      return h('button.bar-row', { style: { width: '100%', textAlign: 'left' }, onclick: () => navigate(`learn/browse?family=${encodeURIComponent(f)}`) },
        h('span.name', f), h('div.progress', h('div', { style: { width: `${Math.max(3, pct)}%` } })), h('span.pct', `${pct}%`));
    })));
  }
}

function chart(values: number[]): HTMLElement {
  if (values.length < 2) return h('div.muted', { style: { padding: '30px 0', textAlign: 'center' } }, 'Solve a few rated puzzles to see your graph.');
  const data = values.slice(-200);
  const min = Math.min(...data) - 20;
  const max = Math.max(...data) + 20;
  const W = 340;
  const H = 150;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * W, H - ((v - min) / (max - min)) * H]);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${d} L${W},${H} L0,${H} Z`;
  const el = h('div');
  el.innerHTML = `<svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">
    <defs><linearGradient id="rg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#81b64c" stop-opacity=".45"/><stop offset="1" stop-color="#81b64c" stop-opacity="0"/></linearGradient></defs>
    <path d="${area}" fill="url(#rg)"/><path d="${d}" fill="none" stroke="#81b64c" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>
    <div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);margin-top:4px"><span>Low ${Math.round(min + 20)}</span><span>High ${Math.round(max - 20)}</span></div>`;
  return el;
}
