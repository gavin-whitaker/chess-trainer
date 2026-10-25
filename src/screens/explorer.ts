import { Chess } from 'chess.js';
import type { Color } from '@lichess-org/chessground/types';
import { Board, parseUci } from '../board/Board';
import { loadBook, nameAlong, type Book } from '../openings/book';
import { explore, explorerAvailable, fmtGames, normalizeUci, type ExplorerResult } from '../openings/explorer';
import { engine, fmtScore } from '../engine/stockfish';
import { putLine, repertoire } from '../db';
import { newLine } from '../openings/srs';
import { h, icon, toast, sheet } from '../ui/dom';
import { header, boardLayout, actionBtn } from '../ui/layout';
import { navigate } from '../router';
import type { ScreenCtx } from '../router';
import { pvToSan, sanLine } from './analyze';

type Source = 'masters' | 'lichess' | 'book';

interface Ply {
  uci: string;
  san: string;
  fen: string;
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export async function explorerScreen({ root, params }: ScreenCtx) {
  const book: Book = await loadBook();
  const orientation = (params.get('o') as Color) || 'white';
  let source: Source = (localStorage.getItem('ct-ex-src') as Source) || (explorerAvailable() ? 'lichess' : 'book');
  if (source !== 'book' && !explorerAvailable()) source = 'book';
  let plies: Ply[] = [];
  let cursor = 0;
  let reqId = 0;
  let alive = true;

  const board = new Board({ orientation, movable: 'both' });
  const nameEl = h('div.opening-name');
  const engineEl = h('div.engine-meta');
  const table = h('div');
  const movesEl = h('div.moves', { style: { marginTop: '10px' } });
  const segBtns: Record<Source, HTMLElement> = {} as Record<Source, HTMLElement>;
  const seg = h('div.segmented', { style: { marginBottom: '8px' } });
  for (const [k, label] of [['masters', 'Masters'], ['lichess', 'Club players'], ['book', 'Book']] as [Source, string][]) {
    segBtns[k] = h(`button${k === source ? '.on' : ''}`, {
      onclick: () => {
        if (k !== 'book' && !explorerAvailable()) return connectSheet();
        source = k;
        localStorage.setItem('ct-ex-src', k);
        Object.entries(segBtns).forEach(([kk, b]) => b.classList.toggle('on', kk === k));
        void renderTable();
      },
    }, label);
    seg.append(segBtns[k]);
  }

  const { under, bar } = boardLayout(root, { header: header('Explorer', { back: 'learn' }), board: board.el });
  under.append(nameEl, engineEl, seg, table, movesEl);
  bar.append(
    actionBtn('flip', 'Flip', () => board.flip()),
    actionBtn('first', 'Start', () => goto(0)),
    actionBtn('back', 'Back', () => goto(cursor - 1)),
    actionBtn('next', 'Forward', () => goto(cursor + 1)),
    actionBtn('plus', 'Save line', () => saveLine()),
  );

  const preset = (params.get('moves') || '').split(',').filter(Boolean);
  if (preset.length) {
    const c = new Chess();
    for (const u of preset) {
      try {
        const m = c.move(parseUci(u));
        plies.push({ uci: u, san: m.san, fen: c.fen() });
      } catch {
        break;
      }
    }
    cursor = plies.length;
    board.setPosition(fenAt(cursor), plies[cursor - 1]?.uci);
  }

  board.setOnMove((m) => push(m.uci, m.san, m.fen));

  function fenAt(n: number) {
    return n === 0 ? START : plies[n - 1].fen;
  }

  function push(uci: string, san: string, fen: string) {
    if (plies[cursor]?.uci === uci) cursor++;
    else {
      plies = plies.slice(0, cursor);
      plies.push({ uci, san, fen });
      cursor++;
    }
    refresh();
  }

  function playUci(uci: string) {
    const m = board.play(uci);
    if (m) push(m.uci, m.san, m.fen);
  }

  function goto(n: number) {
    n = Math.max(0, Math.min(plies.length, n));
    if (n === cursor) return;
    if (n === cursor + 1) {
      board.play(plies[cursor].uci);
      cursor = n;
    } else {
      cursor = n;
      board.setPosition(fenAt(n), n ? plies[n - 1].uci : undefined);
    }
    refresh();
  }

  function refresh() {
    const fens = [START, ...plies.slice(0, cursor).map((p) => p.fen)];
    const o = nameAlong(book, fens);
    nameEl.replaceChildren(...(o ? [h('span.eco', o.eco), h('span', o.name)] : [h('span.muted', cursor ? 'Out of named theory' : 'Starting position')]));
    movesEl.replaceChildren();
    plies.forEach((p, i) => {
      if (i % 2 === 0) movesEl.append(h('span.mn', `${i / 2 + 1}.`));
      movesEl.append(h(`span.mv${i + 1 === cursor ? '.cur' : ''}`, { onclick: () => goto(i + 1) }, p.san));
    });
    void renderTable();
    runEngine();
  }

  function runEngine() {
    const fen = board.fen;
    engineEl.textContent = 'Stockfish · thinking…';
    void engine.analyze(fen, {
      depth: 16,
      onUpdate: (lines) => {
        if (!alive || board.fen !== fen || !lines[0]) return;
        const l = lines[0];
        engineEl.replaceChildren(h('span', `Best: ${sanLine(fen, pvToSan(fen, l.pv, 3))}`), h('span', { style: { fontWeight: '800' } }, `${fmtScore(l)} · d${l.depth}`));
      },
    });
  }

  async function renderTable() {
    const id = ++reqId;
    const fen = board.fen;
    if (source === 'book') {
      const { next } = book.lookup(fen);
      const c = new Chess(fen);
      const total = next.reduce((s, m) => s + m.weight, 0);
      if (!next.length) {
        table.replaceChildren(h('div.empty', 'No book moves here. Use the engine line above to continue.'));
        return;
      }
      table.replaceChildren(
        ...next.map((m) => {
          const san = c.move(parseUci(m.uci)).san;
          c.undo();
          const after = new Chess(fen);
          after.move(parseUci(m.uci));
          const named = book.lookup(after.fen()).opening;
          return h('button.ex-row', { onclick: () => playUci(m.uci) },
            h('span.ex-san', san),
            h('span.ex-games', `${Math.round((m.weight / total) * 100)}%`),
            h('span.muted', { style: { fontSize: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, named ? named.name : `${m.weight} line${m.weight > 1 ? 's' : ''}`),
          );
        }),
        ...(explorerAvailable() ? [] : [h('div.muted', { style: { fontSize: '12px', padding: '10px 4px' } }, 'Showing the offline book. Add a Lichess token in Settings for live game stats.')]),
      );
      return;
    }
    table.replaceChildren(h('div.spinner'));
    const res: ExplorerResult | null = await explore(fen, source);
    if (id !== reqId) return;
    if (!res) {
      table.replaceChildren(h('div.empty', 'Couldn’t reach the Lichess explorer. Check your connection or token, or switch to Book.'));
      return;
    }
    if (!res.moves.length) {
      table.replaceChildren(h('div.empty', 'No games reached this position.'));
      return;
    }
    table.replaceChildren(
      h('div.ex-row', { style: { fontWeight: '800', fontSize: '12px', color: 'var(--muted)' } }, h('span', 'Move'), h('span.ex-games', fmtGames(res.total)), bar3(res.white, res.draws, res.black)),
      ...res.moves.map((m) => h('button.ex-row', { onclick: () => playUci(normalizeUci(m.uci)) },
        h('span.ex-san', m.san),
        h('span.ex-games', `${fmtGames(m.total)} · ${Math.round((m.total / res.total) * 100)}%`),
        bar3(m.white, m.draws, m.black),
      )),
    );
  }

  async function saveLine() {
    if (!cursor) return toast('Make some moves first');
    const ucis = plies.slice(0, cursor).map((p) => p.uci);
    const sans = plies.slice(0, cursor).map((p) => p.san);
    const o = nameAlong(book, [START, ...plies.slice(0, cursor).map((p) => p.fen)]);
    const color = board.orientation;
    const l = newLine({ color, name: o?.name || 'Custom line', ucis, sans });
    if ((await repertoire()).some((e) => e.id === l.id)) return toast('Already in your repertoire');
    await putLine(l);
    toast(`Saved to ${color === 'white' ? 'White' : 'Black'} repertoire`, 'ok');
  }

  function connectSheet() {
    sheet('Live game stats', h('div.sheet-body',
      h('p', 'Lichess requires a free personal API token for its opening explorer. It takes 30 seconds:'),
      h('p.muted', '1. Log in at lichess.org  2. Open Preferences → API access tokens  3. Create a token (no scopes needed)  4. Paste it in Settings.'),
      h('button.btn.green', { onclick: () => navigate('settings') }, icon('settings'), 'Open Settings'),
    ));
  }

  refresh();
  return () => {
    alive = false;
    engine.stop();
    board.destroy();
  };
}

function bar3(w: number, d: number, b: number): HTMLElement {
  const t = w + d + b || 1;
  const pct = (x: number) => Math.round((x / t) * 100);
  const seg = (cls: string, x: number) => h(`div.${cls}`, { style: { width: `${(x / t) * 100}%` } }, pct(x) >= 12 ? `${pct(x)}%` : '');
  return h('div.ex-bar', seg('ex-w', w), seg('ex-d', d), seg('ex-b', b));
}
