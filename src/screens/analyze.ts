import { Chess } from 'chess.js';
import type { Color } from '@lichess-org/chessground/types';
import { Board, parseUci } from '../board/Board';
import { EvalBar } from '../engine/EvalBar';
import { engine, fmtScore, type EngineLine } from '../engine/stockfish';
import { loadBook, nameAlong, type Book } from '../openings/book';
import { h, icon, sheet, toast } from '../ui/dom';
import { header, boardLayout, actionBtn } from '../ui/layout';
import { navigate } from '../router';
import type { ScreenCtx } from '../router';

interface Ply {
  uci: string;
  san: string;
  fen: string;
}

export function pvToSan(fen: string, pv: string[], max = 10): string[] {
  const c = new Chess(fen);
  const out: string[] = [];
  for (const uci of pv.slice(0, max)) {
    try {
      const m = c.move(parseUci(uci));
      out.push(m.san);
    } catch {
      break;
    }
  }
  return out;
}

export function sanLine(fen: string, sans: string[]): string {
  const parts = fen.split(' ');
  let n = +parts[5] || 1;
  let white = parts[1] === 'w';
  const out: string[] = [];
  sans.forEach((s, i) => {
    if (white) out.push(`${n}.${s}`);
    else out.push(i === 0 ? `${n}…${s}` : s);
    if (!white) n++;
    white = !white;
  });
  return out.join(' ');
}

export async function analyzeScreen({ root, params }: ScreenCtx) {
  const startFen = params.get('fen') || new Chess().fen();
  const orientation = (params.get('o') as Color) || 'white';
  let plies: Ply[] = [];
  let cursor = 0;
  let engineOn = params.get('engine') !== '0';
  let book: Book | null = null;
  let timer = 0;
  let alive = true;

  const board = new Board({ fen: startFen, orientation, movable: 'both' });
  const evalBar = new EvalBar();
  evalBar.setFlipped(orientation === 'black');
  if (!engineOn) evalBar.el.style.display = 'none';
  const openingEl = h('div.opening-name');
  const meta = h('div.engine-meta');
  const linesEl = h('div.engine-lines');
  const movesEl = h('div.moves');
  const engineBtn = actionBtn('engine', 'Engine', () => {
    engineOn = !engineOn;
    engineBtn.classList.toggle('primary', engineOn);
    evalBar.el.style.display = engineOn ? '' : 'none';
    if (!engineOn) {
      engine.stop();
      board.clearShapes();
      linesEl.replaceChildren();
      meta.textContent = 'Engine off';
    } else analyse();
  }, engineOn ? 'primary' : '');

  const { under, bar } = boardLayout(root, {
    header: header('Analysis', {
      back: 'home',
      actions: [h('button.icon-btn', { onclick: () => openTools(), 'aria-label': 'More' }, icon('more'))],
    }),
    board: board.el,
    evalBar: evalBar.el,
  });
  under.append(openingEl, meta, linesEl, movesEl);
  bar.append(
    engineBtn,
    actionBtn('flip', 'Flip', () => {
      board.flip();
      evalBar.setFlipped(board.orientation === 'black');
      analyse();
    }),
    actionBtn('first', 'Start', () => goto(0)),
    actionBtn('back', 'Back', () => goto(cursor - 1)),
    actionBtn('next', 'Forward', () => goto(cursor + 1)),
  );

  const preset = (params.get('moves') || '').split(/[ ,]/).filter(Boolean);
  if (preset.length) {
    const c = new Chess(startFen);
    for (const uci of preset) {
      try {
        const m = c.move(parseUci(uci));
        plies.push({ uci, san: m.san, fen: c.fen() });
      } catch {
        break;
      }
    }
    cursor = Math.min(plies.length, +(params.get('ply') ?? plies.length));
  }

  board.setOnMove((m) => {
    if (plies[cursor]?.uci === m.uci) cursor++;
    else {
      plies = plies.slice(0, cursor);
      plies.push({ uci: m.uci, san: m.san, fen: m.fen });
      cursor++;
    }
    refresh();
  });

  function fenAt(n: number): string {
    return n === 0 ? startFen : plies[n - 1].fen;
  }

  function goto(n: number) {
    n = Math.max(0, Math.min(plies.length, n));
    if (n === cursor) return;
    const forwardOne = n === cursor + 1;
    cursor = n;
    if (forwardOne) {
      board.setPosition(fenAt(n - 1), n > 1 ? plies[n - 2].uci : undefined);
      board.play(plies[n - 1].uci);
    } else board.setPosition(fenAt(n), n > 0 ? plies[n - 1].uci : undefined);
    refresh();
  }

  function refresh() {
    renderMoves();
    renderOpening();
    analyse();
  }

  function renderMoves() {
    movesEl.replaceChildren();
    const turnW = startFen.split(' ')[1] === 'w';
    let n = +startFen.split(' ')[5] || 1;
    plies.forEach((p, i) => {
      const white = (i % 2 === 0) === turnW;
      if (white) movesEl.append(h('span.mn', `${n}.`));
      else if (i === 0) movesEl.append(h('span.mn', `${n}…`));
      const el = h(`span.mv${i + 1 === cursor ? '.cur' : ''}`, { onclick: () => goto(i + 1) }, p.san);
      movesEl.append(el);
      if (!white) n++;
    });
    movesEl.querySelector('.cur')?.scrollIntoView({ block: 'nearest' });
  }

  async function renderOpening() {
    book ||= await loadBook();
    const fens = [startFen, ...plies.slice(0, cursor).map((p) => p.fen)];
    const o = nameAlong(book, fens);
    openingEl.replaceChildren(...(o ? [h('span.eco', o.eco), h('span', o.name)] : []));
  }

  function analyse() {
    if (!engineOn) return;
    clearTimeout(timer);
    const fen = board.fen;
    timer = window.setTimeout(() => {
      const c = new Chess(fen);
      if (c.isGameOver()) {
        engine.stop();
        board.clearShapes();
        const txt = c.isCheckmate() ? 'Checkmate' : 'Draw';
        meta.textContent = txt;
        linesEl.replaceChildren();
        evalBar.update(c.isCheckmate() ? { mate: 0, cp: c.turn() === 'w' ? -1 : 1 } : { cp: 0 });
        return;
      }
      meta.textContent = 'Stockfish · thinking…';
      void engine.analyze(fen, {
        depth: 20,
        multipv: 3,
        onUpdate: (lines) => {
          if (!alive || board.fen !== fen) return;
          renderLines(fen, lines);
        },
      });
    }, 120);
  }

  function renderLines(fen: string, lines: EngineLine[]) {
    const best = lines[0];
    if (!best) return;
    evalBar.update(best);
    meta.replaceChildren(h('span', `Stockfish · depth ${best.depth}`), h('span', fmtScore(best)));
    linesEl.replaceChildren(
      ...lines.map((l) => {
        const neg = l.mate !== undefined ? l.mate < 0 : (l.cp ?? 0) < 0;
        return h(
          'div.engine-line',
          { onclick: () => l.pv[0] && board.chess.fen() === fen && playUci(l.pv[0]) },
          h(`span.engine-score${neg ? '.neg' : ''}`, fmtScore(l)),
          h('span.engine-pv', sanLine(fen, pvToSan(fen, l.pv, 8))),
        );
      }),
    );
    if (best.pv[0]) board.setShapes([{ orig: best.pv[0].slice(0, 2) as never, dest: best.pv[0].slice(2, 4) as never, brush: 'best' }]);
  }

  function playUci(uci: string) {
    const m = board.play(uci);
    if (!m) return;
    plies = plies.slice(0, cursor);
    plies.push({ uci, san: m.san, fen: m.fen });
    cursor++;
    refresh();
  }

  function openTools() {
    const input = h('textarea', { rows: 3, placeholder: 'Paste a FEN or PGN' }) as HTMLTextAreaElement;
    const s = sheet(
      'Analysis tools',
      h(
        'div.sheet-body',
        input,
        h('div.btn-row',
          h('button.btn.green.small', {
            onclick: () => {
              const txt = input.value.trim();
              if (!txt) return;
              const c = new Chess();
              try {
                if (/^[rnbqkpRNBQKP1-8/]+ [wb] /.test(txt)) {
                  c.load(txt);
                  s.close();
                  navigate(`analyze?fen=${encodeURIComponent(c.fen())}&t=${Date.now()}`);
                } else {
                  c.loadPgn(txt);
                  const ucis = c.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
                  s.close();
                  navigate(`analyze?moves=${ucis.join(',')}&t=${Date.now()}`);
                }
              } catch {
                toast('Could not read that FEN/PGN', 'bad');
              }
            },
          }, 'Load'),
        ),
        h('div.list', { style: { marginTop: '12px' } },
          h('button.list-item', {
            onclick: async () => {
              await navigator.clipboard?.writeText(board.fen);
              toast('FEN copied', 'ok');
            },
          }, h('div.li-main', h('div.li-title', 'Copy FEN'), h('div.li-sub', board.fen))),
          h('button.list-item', {
            onclick: async () => {
              const c = new Chess(startFen);
              plies.forEach((p) => c.move(parseUci(p.uci)));
              await navigator.clipboard?.writeText(c.pgn());
              toast('PGN copied', 'ok');
            },
          }, h('div.li-main', h('div.li-title', 'Copy PGN'))),
          h('button.list-item', {
            onclick: () => {
              s.close();
              const ucis = plies.slice(0, cursor).map((p) => p.uci);
              navigate(`learn/explore?moves=${ucis.join(',')}`);
            },
          }, h('div.li-main', h('div.li-title', 'Open in Explorer'), h('div.li-sub', 'See what masters and club players play here'))),
          h('button.list-item', {
            onclick: () => {
              s.close();
              navigate(`analyze?t=${Date.now()}`);
            },
          }, h('div.li-main', h('div.li-title', 'New board'), h('div.li-sub', 'Reset to the starting position'))),
        ),
      ),
    );
    setTimeout(() => input.focus(), 300);
  }

  if (cursor > 0) board.setPosition(fenAt(cursor), plies[cursor - 1].uci);
  refresh();

  return () => {
    alive = false;
    clearTimeout(timer);
    engine.stop();
    board.destroy();
  };
}
