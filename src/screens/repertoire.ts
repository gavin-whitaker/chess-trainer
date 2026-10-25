import { Board, miniBoard, parseUci, type BoardMove } from '../board/Board';
import { play } from '../board/feedback';
import { repertoire, putLine, deleteLine, type RepertoireLine } from '../db';
import { schedule, isDue, dueLabel } from '../openings/srs';
import { h, icon, sheet, confirmSheet, toast } from '../ui/dom';
import { header, listItem, sectionTitle, boardLayout, actionBtn, StatusPanel } from '../ui/layout';
import { navigate } from '../router';
import type { ScreenCtx } from '../router';
import { moveText } from './learn';
import { Chess } from 'chess.js';

function finalFen(l: RepertoireLine): string {
  const c = new Chess();
  for (const u of l.ucis) c.move(parseUci(u));
  return c.fen();
}

export async function repertoireScreen({ root, params }: ScreenCtx) {
  const all = await repertoire();
  let color: 'white' | 'black' = (params.get('c') as 'white' | 'black') || 'white';
  const listEl = h('div');
  const seg = h('div.segmented');
  const btns = (['white', 'black'] as const).map((c) => {
    const b = h(`button${c === color ? '.on' : ''}`, {
      onclick: () => {
        color = c;
        btns.forEach((x) => x.classList.toggle('on', x === b));
        render();
      },
    }, `${c === 'white' ? 'White' : 'Black'} (${all.filter((l) => l.color === c).length})`);
    return b;
  });
  seg.append(...btns);
  const due = all.filter((l) => isDue(l));
  root.append(
    header('My Repertoire', { back: 'learn', actions: [h('button.icon-btn', { onclick: () => navigate('learn/explore') }, icon('plus'))] }),
    h('div.card',
      h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' } },
        h('div', h('div', { style: { fontWeight: '800', fontSize: '18px' } }, due.length ? `${due.length} line${due.length > 1 ? 's' : ''} due` : 'All caught up'), h('div.muted', { style: { fontSize: '13px' } }, `${all.length} lines · spaced repetition`)),
        icon('repeat', 'c-green'),
      ),
      h('button.btn.green', { disabled: !all.length, onclick: () => navigate(due.length ? 'learn/drill' : 'learn/drill?all=1') }, due.length ? 'Start Review' : 'Practice All Anyway'),
    ),
    h('div', { style: { padding: '0 14px 4px' } }, seg),
    listEl,
  );

  function render() {
    const lines = all.filter((l) => l.color === color).sort((a, b) => a.due - b.due);
    listEl.replaceChildren();
    if (!lines.length) {
      listEl.append(h('div.empty', 'No lines yet. Add them from a lesson, an opening page, or the Explorer (“Save line”).'));
      return;
    }
    listEl.append(sectionTitle(`${color === 'white' ? 'White' : 'Black'} lines`), h('div.list', lines.map((l) => listItem({
      cls: 'family-row',
      icon: miniBoard(finalFen(l), l.color, l.ucis[l.ucis.length - 1]),
      title: l.name,
      sub: moveText(l.sans),
      right: h(`span.${isDue(l) ? 'c-orange' : 'muted'}`, { style: { fontSize: '12px' } }, dueLabel(l)),
      onclick: () => lineSheet(l),
    }))));
  }

  function lineSheet(l: RepertoireLine) {
    const s = sheet(l.name, h('div.sheet-body',
      h('p.muted', moveText(l.sans)),
      h('p.muted', { style: { fontSize: '13px' } }, `Reviewed ${l.reps}× · ${l.lapses} lapse${l.lapses === 1 ? '' : 's'} · ${dueLabel(l)}`),
      h('button.btn.green', { onclick: () => { s.close(); navigate(`learn/drill?id=${encodeURIComponent(l.id)}`); } }, 'Drill this line'),
      h('div.btn-row',
        h('button.btn.gray.small', { onclick: () => { s.close(); navigate(`learn/explore?moves=${l.ucis.join(',')}&o=${l.color}`); } }, 'Explore'),
        h('button.btn.gray.small', {
          onclick: async () => {
            if (!(await confirmSheet('Remove line?', l.name, 'Remove'))) return;
            await deleteLine(l.id);
            s.close();
            location.reload();
          },
        }, 'Remove'),
      ),
    ));
  }

  render();
}

export async function drillScreen({ root, params }: ScreenCtx) {
  const all = await repertoire();
  const id = params.get('id');
  let queue = id ? all.filter((l) => l.id === id) : params.get('all') ? [...all] : all.filter((l) => isDue(l));
  queue.sort((a, b) => a.due - b.due);
  if (!queue.length) {
    navigate('learn/repertoire', { replace: true });
    return;
  }
  const total = queue.length;
  let done = 0;
  let perfect = 0;
  let line: RepertoireLine = queue[0];
  let ply = 0;
  let mistakes = 0;
  let tries = 0;
  let timers: number[] = [];
  let alive = true;

  const board = new Board({ movable: 'none' });
  const status = new StatusPanel();
  const fill = h('div', { style: { width: '0%' } });
  const countEl = h('span');
  const top = h('div', { style: { padding: '0 14px 10px' } }, h('div', { style: { display: 'flex', justifyContent: 'space-between', fontWeight: '700', marginBottom: '6px', fontSize: '14px' } }, h('span', 'Repertoire review'), countEl), h('div.progress', fill));
  const nameEl = h('div.opening-name');
  const { under, bar } = boardLayout(root, { header: header('Drill', { back: 'learn/repertoire' }), board: board.el, above: top });
  under.append(status.el, nameEl);
  let hintLevel = 0;
  // First press highlights the piece to move, second press reveals the move with an arrow.
  const hintBtn = actionBtn('hint', 'Hint', () => {
    if (ply >= line.ucis.length || !isUser(ply) || hintLevel >= 2) return;
    if (hintLevel === 0) mistakes++;
    hintLevel++;
    if (hintLevel === 1) {
      board.markSquare(line.ucis[ply].slice(0, 2), 'hint');
      hintBtn.querySelector('span')!.textContent = 'Reveal';
    } else {
      board.clearMarks();
      board.arrow(line.ucis[ply], 'hint');
    }
  });
  bar.append(hintBtn, actionBtn('next', 'Skip', () => nextLine()));

  function resetHint() {
    hintLevel = 0;
    hintBtn.querySelector('span')!.textContent = 'Hint';
    board.clearMarks();
    board.clearShapes();
  }

  board.setOnMove((m) => onMove(m));

  function later(fn: () => void, ms: number) {
    timers.push(window.setTimeout(() => alive && fn(), ms));
  }

  function isUser(n: number) {
    return (n % 2 === 0) === (line.color === 'white');
  }

  function loadLine() {
    timers.forEach(clearTimeout);
    timers = [];
    ply = 0;
    mistakes = 0;
    countEl.textContent = `${done + 1}/${total}`;
    fill.style.width = `${(done / total) * 100}%`;
    nameEl.replaceChildren(h('span', line.name));
    resetHint();
    board.badge('a1', null);
    board.setMovable('none');
    board.setOrientation(line.color);
    board.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    status.set(`Play your ${line.color === 'white' ? 'White' : 'Black'} repertoire`, line.color, 'Make each of your moves from memory');
    later(step, 500);
  }

  function step() {
    if (ply >= line.ucis.length) return complete();
    if (!isUser(ply)) {
      board.setMovable('none');
      later(() => {
        board.badge('a1', null);
        board.play(line.ucis[ply]);
        ply++;
        step();
      }, 450);
      return;
    }
    tries = 0;
    board.setMovable(line.color);
  }

  function onMove(m: BoardMove) {
    const expected = line.ucis[ply];
    board.setMovable('none');
    if (m.uci === expected) {
      resetHint();
      board.badge(m.to, 'ok');
      ply++;
      later(step, 350);
      return;
    }
    mistakes++;
    tries++;
    board.badge(m.to, 'bad');
    play('wrong');
    status.set('Not your repertoire move', 'bad', tries >= 2 && hintLevel < 2 ? 'Try again, or tap Hint for help' : 'Try again');
    later(() => {
      board.undo();
      board.badge('a1', null);
      board.setMovable(line.color);
    }, 600);
  }

  async function complete() {
    const grade = mistakes === 0 ? 5 : mistakes === 1 ? 3 : 0;
    if (grade === 5) perfect++;
    const updated = schedule(line, grade);
    await putLine(updated);
    play(grade === 5 ? 'solved' : 'correct');
    status.set(grade === 5 ? 'Perfect!' : grade === 3 ? 'Good, with one slip' : 'Needs more work', grade ? 'ok' : 'bad', `Next review: ${dueLabel(updated).replace('Due ', '')}`);
    later(nextLine, 1200);
  }

  function nextLine() {
    done++;
    queue = queue.slice(1);
    if (!queue.length) {
      fill.style.width = '100%';
      board.setMovable('none');
      under.replaceChildren(
        h('div.big-result', h('div.num', `${perfect}/${total}`), h('div.lbl', 'lines played perfectly')),
        h('button.btn.green', { onclick: () => navigate('learn/repertoire', { replace: true }) }, 'Done'),
      );
      toast('Review complete', 'ok');
      return;
    }
    line = queue[0];
    loadLine();
  }

  loadLine();
  return () => {
    alive = false;
    timers.forEach(clearTimeout);
    board.destroy();
  };
}
