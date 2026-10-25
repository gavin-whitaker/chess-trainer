import { Chess } from 'chess.js';
import { Board, parseUci, type BoardMove } from '../board/Board';
import { play } from '../board/feedback';
import { loadBook, lineSide, type OpeningLine, type Book } from '../openings/book';
import { explainMove } from '../openings/explain';
import { plansFor } from '../openings/plans';
import { explore, explorerAvailable, normalizeUci } from '../openings/explorer';
import { saveLesson, starsText } from '../openings/progress';
import { engine, fmtScore, type EngineLine } from '../engine/stockfish';
import { putLine, repertoire } from '../db';
import { newLine } from '../openings/srs';
import { h, icon, toast } from '../ui/dom';
import { header, boardLayout, actionBtn } from '../ui/layout';
import { navigate } from '../router';
import type { ScreenCtx } from '../router';
import { moveText, startRandomLesson } from './learn';

type Phase = 'learn' | 'practice' | 'beyond' | 'done';

const BEYOND_MOVES = 3;

// cp from the given side's point of view (mate scores mapped to large values).
function sideScore(l: Pick<EngineLine, 'cp' | 'mate'> | undefined, side: 'white' | 'black'): number {
  if (!l) return 0;
  const v = l.mate !== undefined ? (l.mate > 0 ? 10000 - l.mate : -10000 - l.mate) : (l.cp ?? 0);
  return side === 'white' ? v : -v;
}

export async function lessonScreen({ root, params }: ScreenCtx) {
  const book: Book = await loadBook();
  const found: OpeningLine | undefined = book.lines[+(params.get('i') || 0)];
  if (!found) {
    navigate('learn', { replace: true });
    return;
  }
  const line: OpeningLine = found;
  const side = (params.get('side') as 'white' | 'black') || lineSide(line);
  const board = new Board({ orientation: side, movable: 'none' });
  let phase: Phase = 'learn';
  let ply = 0;
  let mistakes = 0;
  let alive = true;
  let beyondCount = 0;
  let attempts = 0;
  let hintLevel = 0;
  let timers: number[] = [];
  let pendingEval: Promise<{ best: string; lines: EngineLine[] }> | null = null;

  const phaseEls = ['Learn', 'Practice', 'Play on'].map((t, i) => h('div.chip', `${i + 1} ${t}`));
  const steps = h('div.chips', { style: { justifyContent: 'center', padding: '4px 0 8px' } }, ...phaseEls);
  const bubble = h('div.coach-bubble');
  const coach = h('div.coach', h('div.coach-avatar', icon('learn')), bubble);
  const extra = h('div');

  const { under, bar } = boardLayout(root, { header: header(line.family, { back: 'learn', sub: line.variation || `${line.eco} · you play ${side}` }), board: board.el, above: steps });
  under.append(coach, extra);
  const hintBtn = actionBtn('hint', 'Hint', () => hint());
  bar.append(
    hintBtn,
    actionBtn('retry', 'Restart', () => start('learn')),
    actionBtn('book', 'Moves', () => toast(moveText(line.sans))),
    actionBtn('analyze', 'Analyze', () => navigate(`analyze?moves=${board.history().map((m) => m.from + m.to + (m.promotion || '')).join(',')}&o=${side}`)),
  );

  board.setOnMove((m) => onUserMove(m));

  function later(fn: () => void, ms: number) {
    timers.push(window.setTimeout(() => alive && fn(), ms));
  }

  function say(html: string, bad = false) {
    bubble.className = `coach-bubble${bad ? ' bad' : ''}`;
    bubble.innerHTML = html;
    bubble.animate([{ opacity: 0.4, transform: 'translateY(4px)' }, { opacity: 1, transform: 'none' }], { duration: 220 });
  }

  function setPhase(p: Phase) {
    phase = p;
    const i = { learn: 0, practice: 1, beyond: 2, done: 3 }[p];
    phaseEls.forEach((el, k) => {
      el.classList.toggle('bg-green', k === i);
      el.classList.toggle('c-green', k < i);
    });
  }

  function resetHint() {
    hintLevel = 0;
    hintBtn.querySelector('span')!.textContent = 'Hint';
    board.clearMarks();
    board.clearShapes();
  }

  function isUserPly(n: number) {
    return (n % 2 === 0) === (side === 'white');
  }

  function start(p: 'learn' | 'practice') {
    timers.forEach(clearTimeout);
    timers = [];
    setPhase(p);
    ply = 0;
    attempts = 0;
    if (p === 'learn') mistakes = 0;
    extra.replaceChildren();
    resetHint();
    board.badge('a1', null);
    board.setMovable('none');
    board.setPosition('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
    if (p === 'learn') say(`Let’s learn the <b>${line.name}</b>. You play <b>${side}</b>. I’ll tell you each move and why it’s played.`);
    else say(`Now play it from memory. Tap Hint if you get stuck.`);
    later(step, 900);
  }

  function explanationFor(n: number): string {
    const c = new Chess();
    for (let i = 0; i < n; i++) c.move(parseUci(line.ucis[i]));
    return explainMove(c.move(parseUci(line.ucis[n])), n);
  }

  function step() {
    if (ply >= line.ucis.length) {
      if (phase === 'learn') {
        play('correct');
        say(`That’s the main line of the <b>${line.name}</b>. Let’s practice it.`);
        later(() => start('practice'), 1600);
      } else startBeyond();
      return;
    }
    const uci = line.ucis[ply];
    if (!isUserPly(ply)) {
      board.setMovable('none');
      later(() => {
        board.badge('a1', null);
        board.play(uci);
        ply++;
        step();
      }, 550);
      return;
    }
    attempts = 0;
    resetHint();
    board.setMovable(side);
    if (phase === 'learn') {
      say(`Play <b>${line.sans[ply]}</b>. ${explanationFor(ply)}`);
    } else {
      say(`Your move. What does the book play here?`);
    }
  }

  // First press highlights the piece to move, second press reveals the move with an arrow.
  function hint() {
    if (hintLevel >= 2) return;
    if (phase === 'learn' || phase === 'practice') {
      if (ply < line.ucis.length && isUserPly(ply)) {
        if (phase === 'practice' && hintLevel === 0) mistakes++;
        showHint(line.ucis[ply]);
      }
    } else if (phase === 'beyond' && pendingEval) {
      const level = hintLevel;
      void pendingEval.then((r) => alive && hintLevel === level && r.best && showHint(r.best));
    }
  }

  function showHint(uci: string) {
    hintLevel++;
    if (hintLevel === 1) {
      board.markSquare(uci.slice(0, 2), 'hint');
      hintBtn.querySelector('span')!.textContent = 'Reveal';
    } else {
      board.clearMarks();
      board.arrow(uci, 'hint');
    }
  }

  function onUserMove(m: BoardMove) {
    if (phase === 'learn' || phase === 'practice') return onBookMove(m);
    if (phase === 'beyond') void onBeyondMove(m);
  }

  function onBookMove(m: BoardMove) {
    const expected = line.ucis[ply];
    if (m.uci === expected) {
      resetHint();
      board.badge(m.to, 'book');
      if (phase === 'practice') say(`<b>Correct!</b> ${explanationFor(ply)}`);
      ply++;
      board.setMovable('none');
      later(step, 450);
      return;
    }
    attempts++;
    if (phase === 'practice') mistakes++;
    board.badge(m.to, 'bad');
    play('wrong');
    board.setMovable('none');
    say(`<b>${m.san}</b> isn’t the book move here. ${attempts >= 2 && hintLevel < 2 ? 'Try again, or tap Hint for help.' : 'Try again.'}`, true);
    later(() => {
      board.undo();
      board.badge('a1', null);
      board.setMovable(side);
    }, 600);
  }

  // After the book line: keep playing a few moves against popular replies, checked by the engine.
  function startBeyond() {
    setPhase('beyond');
    beyondCount = 0;
    play('correct');
    say(`You know the main line! Now let’s play on. I’ll reply like a real opponent and check that your moves keep a good position.`);
    later(beyondStep, 1400);
  }

  async function opponentReply(fen: string): Promise<string | null> {
    if (explorerAvailable()) {
      const r = await explore(fen, 'lichess');
      const pool = r?.moves.filter((m) => m.total / (r.total || 1) >= 0.03) ?? [];
      if (pool.length) return normalizeUci(weighted(pool.map((m) => [m.uci, m.total]))!);
    }
    const next = book.lookup(fen).next;
    if (next.length) return weighted(next.map((m) => [m.uci, m.weight]));
    const res = await engine.analyze(fen, { depth: 12 });
    return res.best || null;
  }

  async function beyondStep() {
    if (!alive) return;
    const c = board.chess;
    if (c.isGameOver() || beyondCount >= BEYOND_MOVES) return finish();
    if (board.turn !== side) {
      board.setMovable('none');
      const reply = await opponentReply(board.fen);
      if (!alive) return;
      if (!reply) return finish();
      later(() => {
        board.badge('a1', null);
        board.play(reply);
        beyondStep();
      }, 500);
      return;
    }
    attempts = 0;
    resetHint();
    const fen = board.fen;
    pendingEval = engine.analyze(fen, { depth: 14, multipv: 3 });
    const named = book.lookup(fen).opening;
    say(`${named ? `We’re in the <b>${named.name}</b>. ` : ''}Find a good move (${beyondCount + 1}/${BEYOND_MOVES}). Think about development, king safety and the center.`);
    board.setMovable(side);
  }

  async function onBeyondMove(m: BoardMove) {
    board.setMovable('none');
    const prevFen = fenBefore();
    const bookNext = book.lookup(prevFen).next.map((b) => b.uci);
    let verdict: 'book' | 'good' | 'bad' = bookNext.includes(m.uci) ? 'book' : 'good';
    let bestUci = '';
    let lossText = '';
    const res = await pendingEval!;
    if (!alive) return;
    bestUci = res.best;
    if (verdict !== 'book' && res.lines.length) {
      const bestScore = sideScore(res.lines[0], side);
      const same = res.lines.find((l) => l.pv[0] === m.uci);
      let moveScore: number;
      if (same) moveScore = sideScore(same, side);
      else {
        const after = await engine.analyze(m.fen, { depth: 12 });
        if (!alive) return;
        moveScore = sideScore(after.lines[0], side);
      }
      const loss = bestScore - moveScore;
      if (loss > 70) {
        verdict = 'bad';
        lossText = loss > 300 ? 'That drops material.' : `That gives away about ${(loss / 100).toFixed(1)} pawns of advantage.`;
      }
    }
    if (verdict !== 'bad') {
      resetHint();
      board.badge(m.to, verdict === 'book' ? 'book' : bestUci === m.uci ? 'best' : 'ok');
      play('correct');
      say(verdict === 'book' ? `<b>${m.san}</b> is a book move. Well played.` : bestUci === m.uci ? `<b>${m.san}</b> is the engine’s top choice!` : `<b>${m.san}</b> is a good move.`);
      beyondCount++;
      later(beyondStep, 800);
      return;
    }
    attempts++;
    board.badge(m.to, 'bad');
    play('wrong');
    say(`${lossText} ${attempts >= 2 && hintLevel < 2 ? 'Try again, or tap Hint for help.' : 'Try to find a better move.'}`, true);
    later(() => {
      board.undo();
      board.badge('a1', null);
      board.setMovable(side);
    }, 700);
  }

  function fenBefore(): string {
    const c = new Chess();
    const hist = board.history();
    for (const mv of hist.slice(0, -1)) c.move(mv.san);
    return c.fen();
  }

  async function finish() {
    setPhase('done');
    board.setMovable('none');
    const stars = mistakes === 0 ? 3 : mistakes <= 2 ? 2 : 1;
    await saveLesson(line.idx, stars, side);
    play('solved');
    say(`Lesson complete! <span class="c-gold">${starsText(stars)}</span> ${mistakes ? `${mistakes} mistake${mistakes > 1 ? 's' : ''} in practice.` : 'Perfect practice run.'}`);
    const evalEl = h('div.engine-meta', h('span', 'Evaluating final position…'));
    const plans = plansFor(line.family, side);
    const familyLines = book.families.get(line.family) || [];
    const nextLine = familyLines[familyLines.indexOf(line!) + 1];
    extra.replaceChildren(
      h('div.card', { style: { margin: '0 0 10px' } },
        evalEl,
        h('div', { style: { fontWeight: '800', marginTop: '8px' } }, 'Plans from here'),
        h('ul.plan-list', plans.map((p) => h('li', p))),
      ),
      h('button.btn.green', { onclick: () => addToRep() }, 'Add to my repertoire'),
      h('div.btn-row',
        h('button.btn.gray.small', { onclick: () => start('practice') }, 'Practice again'),
        nextLine ? h('button.btn.gray.small', { onclick: () => navigate(`learn/lesson?i=${nextLine.idx}&side=${side}`, { replace: true }) }, 'Next variation') : h('button.btn.gray.small', { onclick: () => navigate(`learn/explore?moves=${board.history().map((m) => m.from + m.to + (m.promotion || '')).join(',')}&o=${side}`) }, 'Explore'),
      ),
      h('div.btn-row', h('button.btn.gray.small', { onclick: () => void startRandomLesson(book, line.idx, true) }, icon('dice'), 'Random opening')),
    );
    const r = await engine.analyze(board.fen, { depth: 16 });
    if (!alive || !r.lines[0]) return;
    const sc = sideScore(r.lines[0], side);
    const verdict = sc > 150 ? 'You’re clearly better' : sc > 50 ? 'You have a pleasant edge' : sc > -50 ? 'The position is balanced' : sc > -150 ? 'Your opponent is slightly better' : 'You’re worse here — review the line';
    evalEl.replaceChildren(h('span', verdict), h('span', { style: { fontWeight: '800' } }, fmtScore(r.lines[0])));
  }

  async function addToRep() {
    const hist = board.history();
    const l = newLine({ color: side, name: line.name, ucis: hist.map((m) => m.from + m.to + (m.promotion || '')), sans: hist.map((m) => m.san) });
    if ((await repertoire()).some((e) => e.id === l.id)) return toast('Already in your repertoire');
    await putLine(l);
    toast('Added to your repertoire', 'ok');
  }

  start('learn');
  return () => {
    alive = false;
    timers.forEach(clearTimeout);
    engine.stop();
    board.destroy();
  };
}

function weighted(items: [string, number][]): string | null {
  const total = items.reduce((s, [, w]) => s + w, 0);
  if (!total) return null;
  let r = Math.random() * total;
  for (const [k, w] of items) {
    r -= w;
    if (r <= 0) return k;
  }
  return items[0][0];
}