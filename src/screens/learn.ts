import { Chess } from 'chess.js';
import { miniBoard, parseUci } from '../board/Board';
import { loadBook, FEATURED, lineSide, type OpeningLine, type Book } from '../openings/book';
import { lessonRecords, lastLesson, starsText, type LessonRecord } from '../openings/progress';
import { repertoire } from '../db';
import { isDue } from '../openings/srs';
import { h, icon } from '../ui/dom';
import { header, listItem, sectionTitle } from '../ui/layout';
import { navigate } from '../router';
import type { ScreenCtx } from '../router';

const fenCache = new Map<number, string>();

export function lineFen(l: OpeningLine): string {
  if (!fenCache.has(l.idx)) {
    const c = new Chess();
    for (const u of l.ucis) c.move(parseUci(u));
    fenCache.set(l.idx, c.fen());
  }
  return fenCache.get(l.idx)!;
}

function familyMastery(lines: OpeningLine[], recs: Record<number, LessonRecord>): number {
  const total = lines.length * 3;
  const got = lines.reduce((s, l) => s + (recs[l.idx]?.stars ?? 0), 0);
  return total ? got / total : 0;
}

export async function learnHub({ root }: ScreenCtx) {
  const [book, recs, last, rep] = await Promise.all([loadBook(), lessonRecords(), lastLesson(), repertoire()]);
  const due = rep.filter((l) => isDue(l)).length;
  root.append(h('div.page-title', 'Learn', h('button.icon-btn', { onclick: () => navigate('learn/browse') }, icon('search'))));

  if (last && book.lines[last.idx]) {
    const l = book.lines[last.idx];
    root.append(h('div.card', h('div.hero',
      miniBoard(lineFen(l), last.side, l.ucis[l.ucis.length - 1]),
      h('div.hero-body',
        h('div.hero-kicker', 'Continue learning'),
        h('div.hero-title', { style: { fontSize: '16px' } }, l.name),
        h('button.btn.green.small', { style: { width: '100%' }, onclick: () => navigate(`learn/lesson?i=${l.idx}&side=${last.side}`) }, 'Resume'),
      ),
    )));
  }

  root.append(
    h('div.tiles',
      tile('book', 'c-gold', 'Opening Explorer', 'Every move, with stats', () => navigate('learn/explore')),
      tile('repeat', 'c-green', 'My Repertoire', due ? `${due} line${due > 1 ? 's' : ''} due` : `${rep.length} lines saved`, () => navigate('learn/repertoire')),
    ),
  );
  if (due) root.append(h('div', { style: { padding: '0 14px 8px' } }, h('button.btn.green', { onclick: () => navigate('learn/drill') }, `Review ${due} due line${due > 1 ? 's' : ''}`)));

  root.append(sectionTitle('Popular openings'));
  const list = h('div.list');
  for (const f of FEATURED) {
    const lines = book.families.get(f.family);
    if (!lines?.length) continue;
    const main = lines[0];
    const pct = Math.round(familyMastery(lines, recs) * 100);
    list.append(listItem({
      cls: 'family-row',
      icon: miniBoard(lineFen(main), f.side, main.ucis[main.ucis.length - 1]),
      title: f.family,
      sub: `${f.side === 'white' ? 'White' : 'Black'} · ${f.blurb}`,
      right: pct ? h('span.c-green', `${pct}%`) : undefined,
      onclick: () => navigate(`learn/browse?family=${encodeURIComponent(f.family)}`),
    }));
  }
  root.append(list, h('div', { style: { padding: '0 14px 16px' } }, h('button.btn.gray', { onclick: () => navigate('learn/browse') }, `Browse all ${book.lines.length.toLocaleString()} openings`)));
}

function tile(ic: Parameters<typeof icon>[0], color: string, title: string, sub: string, onclick: () => void): HTMLElement {
  return h('button.tile', { onclick }, icon(ic, color), h('div.tile-title', title), h('div.tile-sub', sub));
}

export async function browseScreen({ root, params }: ScreenCtx) {
  const [book, recs] = await Promise.all([loadBook(), lessonRecords()]);
  const family = params.get('family');
  if (family) return familyView(root, book, family, recs);

  const input = h('input', { type: 'search', placeholder: 'Search openings, e.g. "Najdorf" or "B90"', autocomplete: 'off' }) as HTMLInputElement;
  const results = h('div');
  root.append(header('Openings', { back: 'learn' }), h('div.search', icon('search'), input), results);

  const families = [...book.families.entries()].sort((a, b) => b[1].length - a[1].length);
  const render = () => {
    const q = input.value.trim().toLowerCase();
    results.replaceChildren();
    if (!q) {
      results.append(sectionTitle(`${families.length} opening families`), h('div.list', families.map(([name, lines]) => familyItem(name, lines, recs))));
      return;
    }
    const fam = families.filter(([name]) => name.toLowerCase().includes(q)).slice(0, 20);
    const lines = book.lines.filter((l) => l.name.toLowerCase().includes(q) || l.eco.toLowerCase() === q || l.sans.join(' ').toLowerCase().startsWith(q)).slice(0, 60);
    if (fam.length) results.append(sectionTitle('Families'), h('div.list', fam.map(([name, ls]) => familyItem(name, ls, recs))));
    if (lines.length) results.append(sectionTitle('Variations'), h('div.list', lines.map((l) => lineItem(l, recs))));
    if (!fam.length && !lines.length) results.append(h('div.empty', 'No openings match that search.'));
  };
  let t = 0;
  input.addEventListener('input', () => {
    clearTimeout(t);
    t = window.setTimeout(render, 120);
  });
  render();
}

function familyItem(name: string, lines: OpeningLine[], recs: Record<number, LessonRecord>): HTMLElement {
  const pct = Math.round(familyMastery(lines, recs) * 100);
  return listItem({
    title: name,
    sub: `${lines[0].eco} · ${lines.length} variation${lines.length > 1 ? 's' : ''}${pct ? ` · ${pct}% mastered` : ''}`,
    onclick: () => navigate(`learn/browse?family=${encodeURIComponent(name)}`),
  });
}

function lineItem(l: OpeningLine, recs: Record<number, LessonRecord>): HTMLElement {
  const r = recs[l.idx];
  return listItem({
    cls: 'family-row',
    icon: miniBoard(lineFen(l), lineSide(l), l.ucis[l.ucis.length - 1]),
    title: l.variation || l.family,
    sub: `${l.eco} · ${moveText(l.sans)}`,
    right: r ? h('span.c-gold', starsText(r.stars)) : undefined,
    onclick: () => navigate(`learn/line?i=${l.idx}`),
  });
}

export function moveText(sans: string[]): string {
  return sans.map((s, i) => (i % 2 === 0 ? `${i / 2 + 1}.${s}` : s)).join(' ');
}

function familyView(root: HTMLElement, book: Book, family: string, recs: Record<number, LessonRecord>) {
  const lines = book.families.get(family) || [];
  const side = lines[0] ? lineSide(lines[0]) : 'white';
  const featured = FEATURED.find((f) => f.family === family);
  root.append(header(family, { back: 'learn', sub: `${lines.length} variations` }));
  if (lines[0]) {
    root.append(h('div.card', h('div.hero',
      miniBoard(lineFen(lines[0]), featured?.side ?? side, lines[0].ucis[lines[0].ucis.length - 1]),
      h('div.hero-body',
        h('div.hero-kicker', featured ? `${featured.side === 'white' ? 'White' : 'Black'} opening` : lines[0].eco),
        h('div', { style: { fontSize: '14px', margin: '4px 0 10px', lineHeight: '1.4' } }, featured?.blurb || moveText(lines[0].sans)),
        h('button.btn.green.small', { style: { width: '100%' }, onclick: () => navigate(`learn/lesson?i=${lines[0].idx}&side=${featured?.side ?? side}`) }, 'Start Lesson'),
      ),
    )));
  }
  const list = h('div.list');
  const PAGE = 50;
  let shown = 0;
  const more = h('button.btn.gray', { onclick: () => page() }, 'Show more');
  const page = () => {
    lines.slice(shown, shown + PAGE).forEach((l) => list.append(lineItem(l, recs)));
    shown += PAGE;
    more.style.display = shown >= lines.length ? 'none' : '';
  };
  root.append(sectionTitle('Variations'), list, h('div', { style: { padding: '0 14px 16px' } }, more));
  page();
}
