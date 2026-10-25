import { Board } from '../board/Board';
import { loadBook, lineSide } from '../openings/book';
import { putLine, repertoire } from '../db';
import { newLine } from '../openings/srs';
import { h, sheet, toast } from '../ui/dom';
import { header, boardLayout, actionBtn } from '../ui/layout';
import { navigate } from '../router';
import type { ScreenCtx } from '../router';

export async function lineScreen({ root, params }: ScreenCtx) {
  const book = await loadBook();
  const line = book.lines[+(params.get('i') || 0)];
  if (!line) {
    navigate('learn', { replace: true });
    return;
  }
  const side = lineSide(line);
  const board = new Board({ orientation: side, movable: 'none' });
  let cursor = 0;
  let timer = 0;
  const movesEl = h('div.moves');

  const { under, bar } = boardLayout(root, { header: header(line.family, { back: 'learn', sub: line.variation || line.eco }), board: board.el });
  under.append(
    h('div.opening-name', h('span.eco', line.eco), h('span', line.name)),
    movesEl,
    h('div', { style: { marginTop: '14px' } },
      h('button.btn.green', { onclick: () => navigate(`learn/lesson?i=${line.idx}&side=${side}`) }, 'Learn this line'),
      h('div.btn-row',
        h('button.btn.gray.small', { onclick: () => addToRep() }, 'Add to repertoire'),
        h('button.btn.gray.small', { onclick: () => navigate(`learn/explore?moves=${line.ucis.join(',')}&o=${side}`) }, 'Explore'),
      ),
    ),
  );
  bar.append(
    actionBtn('first', 'Start', () => goto(0)),
    actionBtn('back', 'Back', () => goto(cursor - 1)),
    actionBtn('play', 'Replay', () => replay()),
    actionBtn('next', 'Forward', () => goto(cursor + 1)),
    actionBtn('analyze', 'Analyze', () => navigate(`analyze?moves=${line.ucis.join(',')}&o=${side}`)),
  );

  function renderMoves() {
    movesEl.replaceChildren();
    line.sans.forEach((s, i) => {
      if (i % 2 === 0) movesEl.append(h('span.mn', `${i / 2 + 1}.`));
      movesEl.append(h(`span.mv${i + 1 === cursor ? '.cur' : ''}`, { onclick: () => goto(i + 1) }, s));
    });
  }

  function goto(n: number) {
    clearInterval(timer);
    n = Math.max(0, Math.min(line.ucis.length, n));
    if (n === cursor + 1) board.play(line.ucis[cursor]);
    else {
      board.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
      for (let i = 0; i < n; i++) board.play(line.ucis[i], { sound: false });
    }
    cursor = n;
    renderMoves();
  }

  function replay() {
    goto(0);
    timer = window.setInterval(() => {
      if (cursor >= line.ucis.length) return clearInterval(timer);
      board.play(line.ucis[cursor]);
      cursor++;
      renderMoves();
    }, 650);
  }

  async function addToRep() {
    const existing = await repertoire();
    const pick = (color: 'white' | 'black') => async () => {
      const l = newLine({ color, name: line.name, ucis: line.ucis, sans: line.sans });
      if (existing.some((e) => e.id === l.id)) toast('Already in your repertoire');
      else {
        await putLine(l);
        toast(`Added to ${color === 'white' ? 'White' : 'Black'} repertoire`, 'ok');
      }
      s.close();
    };
    const s = sheet('Add to repertoire', h('div.sheet-body',
      h('p.muted', 'Which side do you play in this line? You’ll drill your moves with spaced repetition.'),
      h('div.btn-row', h(`button.btn.${side === 'white' ? 'green' : 'gray'}`, { onclick: pick('white') }, 'White'), h(`button.btn.${side === 'black' ? 'green' : 'gray'}`, { onclick: pick('black') }, 'Black')),
    ));
  }

  goto(line.ucis.length);
  return () => {
    clearInterval(timer);
    board.destroy();
  };
}
