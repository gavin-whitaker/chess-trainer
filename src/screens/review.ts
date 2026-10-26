import { Chess } from 'chess.js';
import { Board, parseUci, type BoardMove } from '../board/Board';
import { play } from '../board/feedback';
import { EvalBar } from '../engine/EvalBar';
import { engine } from '../engine/stockfish';
import { loadBook } from '../openings/book';
import {
  BAD, CLS_META, CLS_ORDER, evaluateGame, estimatedRating, forBot, gameAccuracy, phaseAccuracy, reviewGame, wpWhite,
  type Cls, type GameReview, type MoveReview, type Outcome,
} from '../review/analysis';
import { EvalGraph } from '../review/graph';
import { h, icon, toast } from '../ui/dom';
import { header, boardLayout, actionBtn } from '../ui/layout';
import type { ScreenCtx } from '../router';

function clsIcon(cls: Cls, size = ''): HTMLElement {
  const m = CLS_META[cls];
  return h(`span.cls-icon${size ? '.' + size : ''}`, { style: { background: m.color }, title: m.label }, m.symbol);
}

function phaseCls(acc: number | null): Cls | null {
  if (acc === null) return null;
  return acc >= 90 ? 'best' : acc >= 80 ? 'excellent' : acc >= 70 ? 'good' : acc >= 60 ? 'inaccuracy' : acc >= 50 ? 'mistake' : 'blunder';
}

export async function reviewScreen({ root, params }: ScreenCtx) {
  const ucis = (params.get('moves') || '').split(',').filter(Boolean);
  const side = (params.get('side') as 'white' | 'black') || 'white';
  const me = side === 'white' ? 'w' : 'b';
  const opp = params.get('opp') || 'Opponent';
  const result = (params.get('result') as Outcome) || null;
  let alive = true;

  // ---------- Board view (move-by-move review) ----------
  const board = new Board({ orientation: side, movable: 'none' });
  const evalBar = new EvalBar();
  evalBar.setFlipped(side === 'black');
  const coachIcon = h('div.coach-avatar', icon('learn'));
  const bubble = h('div.coach-bubble');
  const coachActions = h('div.coach-actions');
  const graphSlot = h('div', { style: { margin: '10px 0' } });
  const movesEl = h('div.moves.review-moves');
  const { under, bar } = boardLayout(root, {
    header: header('Game Review', { actions: [h('button.icon-btn', { onclick: () => showSummary(), 'aria-label': 'Summary' }, icon('close'))] }),
    board: board.el,
    evalBar: evalBar.el,
  });
  under.append(h('div.coach', coachIcon, h('div', { style: { flex: '1' } }, bubble, coachActions)), graphSlot, movesEl);
  bar.append(
    actionBtn('book', 'Summary', () => showSummary()),
    actionBtn('first', 'Start', () => goto(0)),
    actionBtn('back', 'Back', () => goto(cursor - 1)),
    actionBtn('next', 'Next', () => goto(cursor + 1), 'primary'),
  );
  const boardScreen = root.querySelector('.board-screen') as HTMLElement;

  // ---------- Summary page ----------
  const summary = h('div.review-page');
  root.prepend(summary);
  boardScreen.style.display = 'none';

  const progressFill = h('div', { style: { width: '0%' } });
  const progressText = h('div.muted', { style: { textAlign: 'center', fontSize: '13px', marginTop: '8px' } }, 'Starting the engine…');
  summary.append(
    header('Game Review', { back: params.get('back') || 'learn' }),
    h('div.review-body',
      h('div.coach', h('div.coach-avatar', icon('learn')), h('div.coach-bubble', 'Give me a moment, I’m going through every move of your game…')),
      h('div.progress', { style: { marginTop: '18px' } }, progressFill),
      progressText,
    ),
  );

  const [book, evaluated] = await Promise.all([
    loadBook(),
    evaluateGame(ucis, (done, total) => {
      progressFill.style.width = `${Math.round((done / total) * 100)}%`;
      progressText.textContent = done < total ? `Analyzing position ${done + 1} of ${total}` : 'Putting it together…';
    }, () => alive),
  ]);
  if (!alive || !evaluated) return;
  const moves = reviewGame(evaluated.fens, evaluated.evals, ucis, book);
  const review: GameReview = { ...evaluated, moves };
  const mine = moves.filter((m) => m.color === me);
  const theirs = moves.filter((m) => m.color !== me);
  const myAcc = gameAccuracy(mine);
  const theirAcc = gameAccuracy(theirs);

  let cursor = 0;
  let mode: 'browse' | 'retry' = 'browse';
  let practiceQueue: MoveReview[] = [];
  let practicing = false;
  let retryTarget: MoveReview | null = null;
  let retryHint = 0;

  const bigGraph = new EvalGraph(review.evals, moves, (ply) => openAt(ply));
  const smallGraph = new EvalGraph(review.evals, moves, (ply) => goto(ply), 46);
  graphSlot.append(smallGraph.el);
  renderSummary();
  renderMoveList();

  board.setOnMove((m) => void onRetryMove(m));

  function count(list: MoveReview[], cls: Cls) {
    return list.filter((m) => m.cls === cls).length;
  }

  function summaryText(): string {
    const lead = result === 'win' ? 'Nice win! ' : result === 'loss' ? 'Tough one. ' : result === 'draw' ? 'A hard-fought draw. ' : '';
    const body = myAcc >= 90 ? 'You played at a really high level.' : myAcc >= 80 ? 'A strong game with only a few slips.' : myAcc >= 70 ? 'A solid game, with some chances to do even better.' : myAcc >= 55 ? 'Some good ideas, but a few costly mistakes.' : 'This one got away from you. Let’s find the turning points.';
    const worst = [...mine].sort((a, b) => b.loss - a.loss)[0];
    const brill = mine.find((m) => m.cls === 'brilliant' || m.cls === 'great');
    let extra = '';
    if (brill) extra = ` You found ${brill.cls === 'brilliant' ? 'a brilliant' : 'a great'} <b>${brill.san}</b>!`;
    else if (worst && BAD.includes(worst.cls)) extra = ` The turning point was move ${Math.floor(worst.ply / 2) + 1}, <b>${worst.san}</b>.`;
    return lead + body + extra;
  }

  function renderSummary() {
    const keyMoments = moves.filter((m) => (m.color === me && ['mistake', 'miss', 'blunder', 'brilliant', 'great'].includes(m.cls)) || (m.color !== me && ['blunder', 'brilliant'].includes(m.cls)));
    const practice = mine.filter((m) => ['mistake', 'miss', 'blunder'].includes(m.cls));
    const sideBox = (c: 'white' | 'black') => h(`span.side-box.${c}`);
    const phaseRow = (label: string, phase: MoveReview['phase']) => {
      const a = phaseAccuracy(mine, phase);
      const b = phaseAccuracy(theirs, phase);
      const ca = phaseCls(a);
      const cb = phaseCls(b);
      return h('div.cls-row', h('span.cls-n', ca ? clsIcon(ca) : '–'), h('span.cls-name', label), h('span.cls-n', cb ? clsIcon(cb) : '–'));
    };
    summary.replaceChildren(
      header('Game Review', { back: params.get('back') || 'learn' }),
      h('div.review-body',
        h('div.coach', h('div.coach-avatar', icon('learn')), h('div.coach-bubble', { html: summaryText() })),
        h('div.card.flush', bigGraph.el),
        h('div.acc-cards',
          h('div.acc-card', h('div.acc-who', sideBox(side), 'You'), h('div.acc-num.me', myAcc.toFixed(1)), h('div.acc-lbl', 'Accuracy')),
          h('div.acc-card', h('div.acc-who', sideBox(side === 'white' ? 'black' : 'white'), opp), h('div.acc-num', theirAcc.toFixed(1)), h('div.acc-lbl', 'Accuracy')),
        ),
        h('div.card.cls-table',
          ...CLS_ORDER.map((c) => {
            const a = count(mine, c);
            const b = count(theirs, c);
            return h(`div.cls-row${a || b ? '' : '.dim'}`,
              h('span.cls-n', { style: { color: a ? CLS_META[c].color : '' } }, String(a)),
              h('span.cls-name', clsIcon(c, 'sm'), CLS_META[c].label),
              h('span.cls-n', { style: { color: b ? CLS_META[c].color : '' } }, String(b)));
          }),
          h('div.cls-sep'),
          h('div.cls-row',
            h('span.cls-n.big', mine.length >= 8 ? String(estimatedRating(myAcc)) : '–'),
            h('span.cls-name', 'Game Rating'),
            h('span.cls-n.big', theirs.length >= 8 ? String(estimatedRating(theirAcc)) : '–')),
          h('div.cls-sep'),
          phaseRow('Opening', 'opening'),
          phaseRow('Middlegame', 'middlegame'),
          phaseRow('Endgame', 'endgame'),
        ),
        keyMoments.length
          ? h('div',
              h('div.section-title', { style: { padding: '14px 2px 6px' } }, 'Key moments'),
              h('div.list.flush', ...keyMoments.map((m) => h('button.list-item', { onclick: () => openAt(m.ply + 1) },
                h('div.li-icon', clsIcon(m.cls)),
                h('div.li-main',
                  h('div.li-title', `${Math.floor(m.ply / 2) + 1}${m.color === 'w' ? '.' : '…'} ${m.san} · ${CLS_META[m.cls].label}`),
                  h('div.li-sub', m.color === me ? 'You' : opp)),
                h('div.li-chev', icon('next'))))))
          : null,
        h('div.review-buttons',
          h('button.btn.green', { onclick: () => openAt(0) }, 'Start Review'),
          practice.length ? h('button.btn.gray.compact', { onclick: () => startPractice(practice) }, icon('retry'), `Retry your mistakes (${practice.length})`) : null,
        ),
      ),
    );
  }

  function showSummary() {
    mode = 'browse';
    board.setMovable('none');
    boardScreen.style.display = 'none';
    summary.style.display = '';
    summary.scrollTop = 0;
  }

  function openAt(ply: number) {
    summary.style.display = 'none';
    boardScreen.style.display = '';
    cursor = -1;
    goto(ply);
  }

  function goto(ply: number) {
    if (mode === 'retry') exitRetry();
    ply = Math.max(0, Math.min(review.fens.length - 1, ply));
    if (ply === cursor) return;
    const forward = ply === cursor + 1 && cursor >= 0;
    cursor = ply;
    const m = moves[ply - 1];
    if (forward && m) {
      board.setPosition(review.fens[ply - 1], ply > 1 ? moves[ply - 2].uci : undefined);
      board.play(m.uci);
    } else board.setPosition(review.fens[ply], m?.uci);
    showMove();
  }

  function showMove() {
    const m = moves[cursor - 1];
    board.clearShapes();
    board.clearMarks();
    evalBar.update(review.evals[cursor]);
    smallGraph.set(cursor);
    coachActions.replaceChildren();
    movesEl.querySelectorAll('.cur').forEach((e) => e.classList.remove('cur'));
    const cur = movesEl.querySelector<HTMLElement>(`[data-ply="${cursor}"]`);
    cur?.classList.add('cur');
    if (cur) movesEl.scrollTop = Math.max(0, cur.offsetTop - movesEl.clientHeight / 2);
    under.scrollTop = 0;
    if (!m) {
      board.badge('a1', null);
      coachIcon.replaceChildren(icon('learn'));
      coachIcon.style.background = '';
      setBubble('Let’s go through your game from the start. Tap <b>Next</b> to step through each move.');
      return;
    }
    const meta = CLS_META[m.cls];
    board.badge(m.to, null, { symbol: meta.symbol, color: meta.color });
    coachIcon.replaceChildren(h('span', meta.symbol));
    coachIcon.style.background = meta.color;
    const showBest = m.bestUci && m.uci !== m.bestUci && !['book', 'forced', 'best', 'brilliant', 'great'].includes(m.cls);
    if (showBest) board.setShapes([{ orig: m.bestUci.slice(0, 2) as never, dest: m.bestUci.slice(2, 4) as never, brush: 'best' }]);
    const who = m.color === me ? '' : `<span class="muted">${opp}:</span> `;
    setBubble(who + (m.color === me ? m.text : forBot(m.text)), BAD.includes(m.cls));
    if (m.color === me && BAD.includes(m.cls)) coachActions.append(h('button.chip-btn', { onclick: () => startRetry(m) }, icon('retry'), 'Retry'));
    if (showBest) coachActions.append(h('button.chip-btn', { onclick: () => playBest(m) }, icon('play'), 'Show best'));
    const nextKey = moves.find((x) => x.ply >= cursor && x.color === me && BAD.includes(x.cls));
    if (nextKey) coachActions.append(h('button.chip-btn', { onclick: () => goto(nextKey.ply + 1) }, icon('next'), 'Next mistake'));
  }

  function setBubble(html: string, bad = false) {
    bubble.className = `coach-bubble${bad ? ' bad' : ''}`;
    bubble.innerHTML = html;
  }

  function playBest(m: MoveReview) {
    board.setPosition(review.fens[m.ply], m.ply > 0 ? moves[m.ply - 1].uci : undefined);
    board.clearShapes();
    board.badge('a1', null);
    board.play(m.bestUci);
    const meta = CLS_META.best;
    board.badge(m.bestUci.slice(2, 4), null, { symbol: meta.symbol, color: meta.color });
    coachIcon.replaceChildren(h('span', meta.symbol));
    coachIcon.style.background = meta.color;
    evalBar.update(review.evals[m.ply]);
    const line = review.evals[m.ply].pv.slice(0, 6);
    setBubble(`<b>${m.bestSan}</b> was best. The engine line: ${sanLine(review.fens[m.ply], line)}`);
  }

  // ---------- Retry a mistake ----------
  function startRetry(m: MoveReview) {
    mode = 'retry';
    retryTarget = m;
    cursor = m.ply;
    board.setPosition(review.fens[m.ply], m.ply > 0 ? moves[m.ply - 1].uci : undefined);
    board.clearShapes();
    board.clearMarks();
    board.badge('a1', null);
    evalBar.update(review.evals[m.ply]);
    smallGraph.set(m.ply);
    coachIcon.replaceChildren(icon('retry'));
    coachIcon.style.background = 'var(--blue)';
    setBubble(`You played <b>${m.san}</b> here. Can you find something better?${practiceQueue.length ? ` <span class="muted">(${practiceQueue.length} left)</span>` : ''}`);
    coachActions.replaceChildren(
      h('button.chip-btn', { onclick: () => hintRetry() }, icon('hint'), 'Hint'),
      h('button.chip-btn', { onclick: () => revealRetry() }, icon('book'), 'Show answer'),
      h('button.chip-btn', { onclick: () => (practiceQueue.length ? nextPractice() : goto(m.ply + 1)) }, icon('next'), practiceQueue.length ? 'Skip' : 'Back to review'),
    );
    board.setMovable(side);
  }

  function hintRetry() {
    if (!retryTarget) return;
    retryHint++;
    if (retryHint === 1) board.markSquare(retryTarget.bestUci.slice(0, 2), 'hint');
    else {
      board.clearMarks();
      board.setShapes([{ orig: retryTarget.bestUci.slice(0, 2) as never, dest: retryTarget.bestUci.slice(2, 4) as never, brush: 'hint' }]);
    }
  }

  function revealRetry() {
    if (!retryTarget) return;
    const t = retryTarget;
    board.setMovable('none');
    playBest(t);
    retryDone();
  }

  async function onRetryMove(mv: BoardMove) {
    const t = retryTarget;
    if (mode !== 'retry' || !t) return;
    board.setMovable('none');
    board.clearMarks();
    board.clearShapes();
    let ok = mv.uci === t.bestUci;
    if (!ok) {
      setBubble('Checking…');
      const r = await engine.analyze(mv.fen, { depth: 14, movetime: 1200 });
      if (!alive || mode !== 'retry' || retryTarget !== t) return;
      const before = review.evals[t.ply];
      const wpB = me === 'w' ? wpWhite(before) : 100 - wpWhite(before);
      const after = new Chess(mv.fen).isCheckmate() ? 100 : (me === 'w' ? wpWhite(r.lines[0] ?? {}) : 100 - wpWhite(r.lines[0] ?? {}));
      ok = wpB - after < 5;
    }
    if (ok) {
      play('correct');
      board.badge(mv.to, null, { symbol: '✓', color: CLS_META.best.color });
      setBubble(`<b>${mv.san}</b> is a great find! ${mv.uci === t.bestUci ? 'That’s the engine’s top move.' : 'That keeps the position.'}`);
      retryDone();
    } else {
      play('wrong');
      board.badge(mv.to, 'bad');
      setBubble(`<b>${mv.san}</b> isn’t better. Try again.`, true);
      window.setTimeout(() => {
        if (!alive || retryTarget !== t) return;
        board.undo();
        board.badge('a1', null);
        board.setMovable(side);
      }, 700);
    }
  }

  function retryDone() {
    retryHint = 0;
    const t = retryTarget!;
    retryTarget = null;
    mode = 'browse';
    coachActions.replaceChildren(
      practicing
        ? h('button.chip-btn.primary', { onclick: () => nextPractice() }, icon('next'), practiceQueue.length ? 'Next mistake' : 'Finish')
        : h('button.chip-btn.primary', { onclick: () => { cursor = -1; goto(t.ply + 1); } }, icon('next'), 'Continue review'),
    );
  }

  function exitRetry() {
    mode = 'browse';
    retryTarget = null;
    retryHint = 0;
    board.setMovable('none');
    cursor = -1;
  }

  function startPractice(list: MoveReview[]) {
    practicing = true;
    practiceQueue = [...list];
    summary.style.display = 'none';
    boardScreen.style.display = '';
    nextPractice();
  }

  function nextPractice() {
    const m = practiceQueue.shift();
    if (!m) {
      practicing = false;
      toast('All mistakes reviewed', 'ok');
      return showSummary();
    }
    startRetry(m);
  }

  function renderMoveList() {
    movesEl.replaceChildren();
    moves.forEach((m, i) => {
      if (i % 2 === 0) movesEl.append(h('span.mn', `${i / 2 + 1}.`));
      const showIcon = !['good', 'excellent', 'best'].includes(m.cls) || m.color === me;
      movesEl.append(h('span.mv', { 'data-ply': String(i + 1), onclick: () => goto(i + 1) }, showIcon ? clsIcon(m.cls, 'xs') : null, m.san));
    });
  }

  return () => {
    alive = false;
    engine.stop();
    board.destroy();
  };
}

function sanLine(fen: string, pv: string[]): string {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const u of pv) {
    try {
      const white = c.turn() === 'w';
      const n = c.moveNumber();
      const m = c.move(parseUci(u));
      out.push(white ? `${n}.${m.san}` : out.length ? m.san : `${n}…${m.san}`);
    } catch {
      break;
    }
  }
  return out.join(' ');
}
