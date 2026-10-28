import { Chess } from 'chess.js';
import { Board, parseUci } from '../board/Board';
import { play } from '../board/feedback';
import { engine } from '../engine/stockfish';
import { loadBook, type Book } from '../openings/book';
import { botLabel, botMove, playUrl } from '../play/bot';
import { chooseBotLevel } from '../play/levelSheet';
import { preAnalyze, reviewUrl } from '../review/analysis';
import { h, icon, confirmSheet } from '../ui/dom';
import { header, boardLayout, actionBtn, StatusPanel } from '../ui/layout';
import { navigate } from '../router';
import type { ScreenCtx } from '../router';

type Result = { title: string; sub: string; outcome: 'win' | 'loss' | 'draw' };

export async function playScreen({ root, params }: ScreenCtx) {
  const side = (params.get('side') as 'white' | 'black') || 'white';
  const elo = +(params.get('elo') || 1200);
  const back = params.get('back') || 'learn';
  const startMoves = (params.get('moves') || '').split(',').filter(Boolean);
  const book: Book = await loadBook();

  const board = new Board({ orientation: side, movable: 'none' });
  for (const uci of startMoves) if (!board.play(uci, { sound: false })) break;
  const startLen = board.history().length;

  let alive = true;
  let gen = 0;
  let over = false;
  let hintLevel = 0;
  let hintBest: Promise<string> | null = null;
  let openingName = '';

  const status = new StatusPanel();
  const openingEl = h('div.opening-name');
  const hintLabel = h('span', 'Hint');
  const hintBtn = h('button.btn.gray.compact', { onclick: () => void hint() }, icon('hint'), hintLabel);
  const result = h('div');
  const movesEl = h('div.moves', { style: { marginTop: '10px' } });

  const { under, bar } = boardLayout(root, {
    header: header(`Bot ${elo}`, { back, sub: `${botLabel(elo)} · you play ${side}` }),
    board: board.el,
  });
  under.append(status.el, hintBtn, result, openingEl, movesEl);
  bar.append(
    actionBtn('back', 'Takeback', () => takeback()),
    actionBtn('flip', 'Flip', () => board.flip()),
    actionBtn('close', 'Resign', () => void resign()),
    actionBtn('analyze', 'Analyze', () => navigate(`analyze?moves=${ucis().join(',')}&o=${side}`)),
  );

  board.setOnMove(() => {
    resetHint();
    advance();
  });

  function ucis(): string[] {
    return board.history().map((m) => m.from + m.to + (m.promotion || ''));
  }

  function resetHint() {
    hintLevel = 0;
    hintBest = null;
    hintLabel.textContent = 'Hint';
    board.clearMarks();
    board.clearShapes();
  }

  // First press highlights the piece to move, second press reveals the move with an arrow.
  async function hint() {
    if (over || board.turn !== side || hintLevel >= 2) return;
    const fen = board.fen;
    hintBest ||= engine.analyze(fen, { depth: 14 }).then((r) => r.best);
    const level = ++hintLevel;
    hintLabel.textContent = 'Reveal Move';
    const best = await hintBest;
    if (!alive || !best || board.fen !== fen || hintLevel !== level) return;
    if (level === 1) board.markSquare(best.slice(0, 2), 'hint');
    else {
      board.clearMarks();
      board.arrow(best, 'hint');
    }
  }

  function gameResult(): Result | null {
    const c = board.chess;
    if (c.isCheckmate()) {
      const userMated = c.turn() === side[0];
      return userMated ? { title: 'You lost', sub: 'by checkmate', outcome: 'loss' } : { title: 'You won!', sub: 'by checkmate', outcome: 'win' };
    }
    if (c.isStalemate()) return { title: 'Draw', sub: 'by stalemate', outcome: 'draw' };
    if (c.isInsufficientMaterial()) return { title: 'Draw', sub: 'by insufficient material', outcome: 'draw' };
    if (c.isThreefoldRepetition()) return { title: 'Draw', sub: 'by repetition', outcome: 'draw' };
    if (c.isDraw()) return { title: 'Draw', sub: 'by the 50-move rule', outcome: 'draw' };
    return null;
  }

  function advance() {
    preAnalyze(board.fen);
    renderMoves();
    const r = gameResult();
    if (r) return end(r);
    if (board.turn === side) {
      board.setMovable(side);
      status.set('Your move', side, openingName ? `Still in the ${openingName}` : 'Find a good plan');
    } else void botTurn();
  }

  async function botTurn() {
    board.setMovable('none');
    status.set('Bot is thinking…', side === 'white' ? 'black' : 'white');
    const g = ++gen;
    const t0 = Date.now();
    const uci = await botMove(board.fen, elo);
    if (!alive || g !== gen || over) return;
    if (!uci) return advance();
    const wait = Math.max(0, 350 + Math.random() * 450 - (Date.now() - t0));
    window.setTimeout(() => {
      if (!alive || g !== gen || over) return;
      board.play(uci);
      advance();
    }, wait);
  }

  function takeback() {
    const len = board.history().length;
    if (len <= startLen) return;
    gen++;
    engine.stop();
    resetHint();
    let n = board.turn === side ? 2 : 1;
    if (len - n < startLen) n = len - startLen;
    if (board.turn === side && n === 1) return;
    for (let i = 0; i < n; i++) board.undo();
    over = false;
    result.replaceChildren();
    hintBtn.style.display = '';
    advance();
  }

  async function resign() {
    if (over) return;
    if (!(await confirmSheet('Resign?', 'The game will end as a loss.', 'Resign'))) return;
    gen++;
    engine.stop();
    end({ title: 'You resigned', sub: 'the bot wins', outcome: 'loss' });
  }

  function end(r: Result) {
    over = true;
    board.setMovable('none');
    resetHint();
    hintBtn.style.display = 'none';
    play(r.outcome === 'win' ? 'solved' : r.outcome === 'loss' ? 'wrong' : 'correct');
    status.set(r.title, r.outcome === 'win' ? 'ok' : r.outcome === 'loss' ? 'bad' : 'info', r.sub);
    result.replaceChildren(
      h('button.btn.green.compact', { onclick: () => navigate(reviewUrl(ucis(), side, `Bot ${elo}`, r.outcome), { replace: true }) }, 'Game Review'),
      h('div.btn-row',
        h('button.btn.gray.small', { onclick: () => navigate(playUrl(startMoves, side, elo, back), { replace: true }) }, 'Rematch'),
        h('button.btn.gray.small', { onclick: () => chooseBotLevel((e) => navigate(playUrl(startMoves, side, e, back), { replace: true }), 'Change bot level') }, 'Change level'),
      ),
    );
  }

  function renderMoves() {
    const hist = board.history();
    const named = book.lookup(board.fen).opening;
    if (named) openingName = named.name;
    openingEl.replaceChildren(...(openingName ? [h('span', openingName)] : []));
    movesEl.replaceChildren();
    hist.forEach((m, i) => {
      if (i % 2 === 0) movesEl.append(h('span.mn', `${i / 2 + 1}.`));
      movesEl.append(h(`span.mv${i < startLen ? '.book' : ''}${i === hist.length - 1 ? '.cur' : ''}`, m.san));
    });
    movesEl.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
  }

  const replay = new Chess();
  preAnalyze(replay.fen());
  for (const uci of startMoves.slice(0, startLen)) {
    replay.move(parseUci(uci));
    preAnalyze(replay.fen());
    const named = book.lookup(replay.fen()).opening;
    if (named) openingName = named.name;
  }
  play('start');
  advance();

  return () => {
    alive = false;
    gen++;
    engine.stop();
    board.destroy();
  };
}