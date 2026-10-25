import { miniBoard } from '../board/Board';
import { dailyPuzzle } from '../puzzles/data';
import { profile, today } from '../stats';
import { repertoire } from '../db';
import { isDue } from '../openings/srs';
import { lastLesson } from '../openings/progress';
import { loadBook } from '../openings/book';
import { h, icon } from '../ui/dom';
import { listItem, sectionTitle } from '../ui/layout';
import { navigate } from '../router';
import type { ScreenCtx } from '../router';
import { lineFen } from './learn';

export async function homeScreen({ root }: ScreenCtx) {
  const [p, rep, last, book] = await Promise.all([profile(), repertoire(), lastLesson(), loadBook().catch(() => null)]);
  const due = rep.filter((l) => isDue(l)).length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  root.append(
    h('div.page-title', h('span', greet), h('button.icon-btn', { onclick: () => navigate('settings'), 'aria-label': 'Settings' }, icon('settings'))),
    h('div.stat-row',
      h('div.stat', h('div.stat-val', icon('puzzle', 'c-orange'), String(p.rating)), h('div.stat-label', 'Puzzle rating')),
      h('div.stat', h('div.stat-val', icon('fire', 'c-orange'), String(p.streakDays)), h('div.stat-label', 'Day streak')),
      h('div.stat', h('div.stat-val', icon('check', 'c-green'), String(p.solved)), h('div.stat-label', 'Solved')),
    ),
  );

  const dailyCard = h('div.card', h('div.spinner'));
  root.append(dailyCard);
  dailyPuzzle()
    .then((d) => {
      const solved = p.dailySolved === today();
      const color = d.fen.split(' ')[1] === 'w' ? 'black' : 'white';
      dailyCard.replaceChildren(h('div.hero',
        miniBoard(d.fen, color, d.moves[0]),
        h('div.hero-body',
          h('div.hero-kicker', 'Daily Puzzle'),
          h('div.hero-title', solved ? 'Solved today ✓' : `${color === 'white' ? 'White' : 'Black'} to play`),
          h(`button.btn.${solved ? 'gray' : 'green'}.small`, { style: { width: '100%' }, onclick: () => navigate('puzzles/daily') }, solved ? 'View' : 'Solve'),
        ),
      ));
    })
    .catch(() => dailyCard.replaceChildren(h('div.muted', 'Daily puzzle will be available once the puzzle pack downloads.')));

  if (last && book?.lines[last.idx]) {
    const l = book.lines[last.idx];
    root.append(h('div.card', h('div.hero',
      miniBoard(lineFen(l), last.side, l.ucis[l.ucis.length - 1]),
      h('div.hero-body',
        h('div.hero-kicker', 'Continue lesson'),
        h('div.hero-title', { style: { fontSize: '16px' } }, l.name),
        h('button.btn.green.small', { style: { width: '100%' }, onclick: () => navigate(`learn/lesson?i=${l.idx}&side=${last.side}`) }, 'Continue'),
      ),
    )));
  }

  root.append(
    sectionTitle('Train'),
    h('div.list',
      listItem({ title: 'Solve Puzzles', sub: 'Rated puzzles matched to your level', icon: icon('puzzle', 'c-orange'), onclick: () => navigate('puzzles/rated') }),
      listItem({ title: 'Puzzle Rush', sub: `Best: ${Math.max(0, ...Object.values(p.rushBest))}`, icon: icon('bolt', 'c-orange'), onclick: () => navigate('puzzles/rush') }),
      listItem({ title: 'Learn Openings', sub: 'Guided lessons for every major opening', icon: icon('learn', 'c-green'), onclick: () => navigate('learn') }),
      listItem({
        title: 'Repertoire Review',
        sub: due ? `${due} line${due > 1 ? 's' : ''} due today` : rep.length ? 'All caught up' : 'Save lines to start drilling',
        right: due ? h('span.chip.bg-orange.c-orange', String(due)) : undefined,
        icon: icon('repeat', 'c-green'),
        onclick: () => navigate(due ? 'learn/drill' : 'learn/repertoire'),
      }),
      listItem({ title: 'Analysis Board', sub: 'Stockfish on your phone, offline', icon: icon('analyze', 'c-blue'), onclick: () => navigate('analyze') }),
    ),
  );
}
