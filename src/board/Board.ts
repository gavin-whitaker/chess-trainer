import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { Key, Color } from '@lichess-org/chessground/types';
import type { DrawShape } from '@lichess-org/chessground/draw';
import { Chess, type Move, type Square } from 'chess.js';
import { h } from '../ui/dom';
import { settings, onSettings } from '../settings';
import { play, haptic } from './feedback';

export type { DrawShape };

export interface BoardMove {
  from: string;
  to: string;
  promotion?: string;
  san: string;
  uci: string;
  fen: string;
  move: Move;
}

export interface BoardOptions {
  fen?: string;
  orientation?: Color;
  // Which side the user may move: a color, 'both', or 'none'.
  movable?: Color | 'both' | 'none';
  onMove?: (m: BoardMove) => void;
  viewOnly?: boolean;
}

// A press counts as a click (not a drag) until it lasts longer than this or moves farther than DRAG_ESCAPE_PX.
const CLICK_BUFFER_MS = 250;
const DRAG_ESCAPE_PX = 18;

const BRUSHES = {
  green: { key: 'g', color: '#15781B', opacity: 1, lineWidth: 10 },
  red: { key: 'r', color: '#882020', opacity: 1, lineWidth: 10 },
  blue: { key: 'b', color: '#003088', opacity: 1, lineWidth: 10 },
  yellow: { key: 'y', color: '#e68f00', opacity: 1, lineWidth: 10 },
  orange: { key: 'o', color: '#f7a33a', opacity: 0.95, lineWidth: 11 },
  best: { key: 'bs', color: '#3d8ee8', opacity: 0.9, lineWidth: 11 },
  hint: { key: 'h', color: '#81b64c', opacity: 0.9, lineWidth: 11 },
  ghost: { key: 'gh', color: '#ffffff', opacity: 0.55, lineWidth: 9 },
};

// Knight moves get an L-shaped arrow (long leg first, then the turn), like Chess.com.
// Drawn as a custom SVG anchored on the origin square, where one square is 100 units.
function knightArrow(s: DrawShape, orientation: Color): DrawShape {
  const brush = s.brush ? BRUSHES[s.brush as keyof typeof BRUSHES] : undefined;
  if (!s.dest || !brush) return s;
  const sign = orientation === 'white' ? 1 : -1;
  const dx = (s.dest.charCodeAt(0) - s.orig.charCodeAt(0)) * sign;
  const dy = -(s.dest.charCodeAt(1) - s.orig.charCodeAt(1)) * sign;
  if (Math.abs(dx * dy) !== 2) return s;
  const width = (brush.lineWidth / 64) * 100;
  const head = width * 3;
  const tip = [50 + dx * 100, 50 + dy * 100];
  const corner = Math.abs(dx) === 2 ? [tip[0], 50] : [50, tip[1]];
  const ux = Math.sign(tip[0] - corner[0]);
  const uy = Math.sign(tip[1] - corner[1]);
  const base = [tip[0] - ux * head, tip[1] - uy * head];
  const half = width * 2;
  const points = [tip, [base[0] - uy * half, base[1] + ux * half], [base[0] + uy * half, base[1] - ux * half]];
  const opacity = brush.opacity * 0.6;
  const html =
    `<g opacity="${opacity}">` +
    `<path d="M50 50 L${corner[0]} ${corner[1]} L${base[0] + ux} ${base[1] + uy}" fill="none" stroke="${brush.color}" stroke-width="${width}" stroke-linejoin="miter" />` +
    `<polygon points="${points.map((p) => p.join(',')).join(' ')}" fill="${brush.color}" /></g>`;
  return { orig: s.orig, customSvg: { html } };
}

export function uciOf(m: { from: string; to: string; promotion?: string }): string {
  return m.from + m.to + (m.promotion || '');
}

export function parseUci(uci: string): { from: Square; to: Square; promotion?: string } {
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square, promotion: uci[4] };
}

export function legalDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  for (const m of chess.moves({ verbose: true })) {
    const list = dests.get(m.from as Key) || [];
    if (!list.includes(m.to as Key)) list.push(m.to as Key);
    dests.set(m.from as Key, list);
  }
  return dests;
}

export class Board {
  readonly el: HTMLElement;
  readonly chess: Chess;
  private cg: Api;
  private movable: Color | 'both' | 'none';
  private onMove?: (m: BoardMove) => void;
  private promoEl: HTMLElement | null = null;
  private lastMove: Key[] | undefined;
  private unsub: () => void;
  private shapes: DrawShape[] = [];
  private squareMarks: Map<Key, string> = new Map();

  constructor(opts: BoardOptions = {}) {
    this.chess = new Chess(opts.fen);
    this.movable = opts.movable ?? 'both';
    this.onMove = opts.onMove;
    const cgEl = h('div.cg-wrap');
    this.el = h('div.board-wrap', cgEl);
    const s = settings();
    this.cg = Chessground(cgEl, {
      fen: this.chess.fen(),
      orientation: opts.orientation ?? 'white',
      viewOnly: opts.viewOnly,
      coordinates: s.coords,
      coordinatesOnSquares: false,
      ranksPosition: 'left',
      animation: { enabled: true, duration: 160 },
      highlight: { lastMove: true, check: true },
      blockTouchScroll: true,
      draggable: { enabled: true, showGhost: true, distance: 10, autoDistance: false },
      selectable: { enabled: true },
      premovable: { enabled: false },
      drawable: { enabled: true, brushes: BRUSHES, eraseOnMovablePieceClick: true },
      movable: {
        free: false,
        showDests: s.showDests,
        events: { after: (orig, dest) => this.userMove(orig, dest) },
      },
    });
    this.sync();
    const unsubSettings = onSettings((st) => this.cg.set({ coordinates: st.coords, movable: { showDests: st.showDests } }));
    const unbindClick = this.bindClickBuffer(cgEl);
    this.unsub = () => {
      unsubSettings();
      unbindClick();
    };
  }

  // Swallow pointer movement early in a press so small jitters during a tap don't turn into a drag.
  private bindClickBuffer(cgEl: HTMLElement): () => void {
    let press: { t: number; x: number; y: number } | null = null;
    const point = (e: MouseEvent | TouchEvent) => ('touches' in e ? e.touches[0] ?? e.changedTouches[0] : e);
    const down = (e: MouseEvent | TouchEvent) => {
      const p = point(e);
      if (p) press = { t: performance.now(), x: p.clientX, y: p.clientY };
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (!press) return;
      const p = point(e);
      if (!p) return;
      const dist = Math.hypot(p.clientX - press.x, p.clientY - press.y);
      if (performance.now() - press.t < CLICK_BUFFER_MS && dist < DRAG_ESCAPE_PX) e.stopPropagation();
    };
    const up = () => (press = null);
    cgEl.addEventListener('mousedown', down, true);
    cgEl.addEventListener('touchstart', down, { capture: true, passive: true });
    window.addEventListener('mousemove', move, true);
    window.addEventListener('touchmove', move, { capture: true, passive: true });
    window.addEventListener('mouseup', up, true);
    window.addEventListener('touchend', up, true);
    return () => {
      cgEl.removeEventListener('mousedown', down, true);
      cgEl.removeEventListener('touchstart', down, true);
      window.removeEventListener('mousemove', move, true);
      window.removeEventListener('touchmove', move, true);
      window.removeEventListener('mouseup', up, true);
      window.removeEventListener('touchend', up, true);
    };
  }

  get fen(): string {
    return this.chess.fen();
  }

  get turn(): Color {
    return this.chess.turn() === 'w' ? 'white' : 'black';
  }

  get orientation(): Color {
    return this.cg.state.orientation;
  }

  setOrientation(c: Color): void {
    if (this.cg.state.orientation !== c) this.flip();
  }

  flip(): void {
    this.cg.toggleOrientation();
    this.cg.setAutoShapes(this.shapes.map((s) => knightArrow(s, this.orientation)));
  }

  setMovable(m: Color | 'both' | 'none'): void {
    this.movable = m;
    this.sync();
  }

  setOnMove(fn: (m: BoardMove) => void): void {
    this.onMove = fn;
  }

  // Replace the whole position (no animation unless the change is small).
  setPosition(fen: string, lastMove?: string): void {
    this.chess.load(fen);
    this.lastMove = lastMove ? [lastMove.slice(0, 2) as Key, lastMove.slice(2, 4) as Key] : undefined;
    this.closePromo();
    this.sync();
  }

  // Play a move programmatically (opponent / replay). Returns the move or null if illegal.
  play(uci: string, opts: { sound?: boolean } = {}): BoardMove | null {
    const { from, to, promotion } = parseUci(uci);
    let move: Move;
    try {
      move = this.chess.move({ from, to, promotion: promotion || 'q' });
    } catch {
      return null;
    }
    this.lastMove = [from as Key, to as Key];
    this.cg.move(from as Key, to as Key);
    this.sync();
    if (opts.sound !== false) this.moveSound(move);
    return this.toBoardMove(move);
  }

  undo(): Move | null {
    const m = this.chess.undo();
    const hist = this.chess.history({ verbose: true });
    const prev = hist[hist.length - 1];
    this.lastMove = prev ? [prev.from as Key, prev.to as Key] : undefined;
    this.sync();
    return m;
  }

  history(): Move[] {
    return this.chess.history({ verbose: true });
  }

  setShapes(shapes: DrawShape[]): void {
    this.shapes = shapes;
    this.cg.setAutoShapes(shapes.map((s) => knightArrow(s, this.orientation)));
  }

  arrow(uci: string, brush = 'orange'): void {
    this.setShapes([...this.shapes, { orig: uci.slice(0, 2) as Key, dest: uci.slice(2, 4) as Key, brush }]);
  }

  clearShapes(): void {
    this.shapes = [];
    this.cg.setAutoShapes([]);
    this.cg.setShapes([]);
  }

  // Colored square overlays (e.g. hint, correct/incorrect markers).
  markSquare(sq: string, cls: string | null): void {
    if (cls) this.squareMarks.set(sq as Key, cls);
    else this.squareMarks.delete(sq as Key);
    this.cg.set({ highlight: { custom: new Map(this.squareMarks) } });
  }

  clearMarks(): void {
    this.squareMarks.clear();
    this.cg.set({ highlight: { custom: new Map() } });
  }

  // Badge icon (check / x / star) drawn on a square, like Chess.com's move classification.
  badge(sq: string, kind: 'ok' | 'bad' | 'best' | 'book' | null, custom?: { symbol: string; color: string }): void {
    this.el.querySelectorAll('.sq-badge').forEach((b) => b.remove());
    if (!kind && !custom) return;
    const file = sq.charCodeAt(0) - 97;
    const rank = +sq[1] - 1;
    const white = this.orientation === 'white';
    const x = white ? file : 7 - file;
    const y = white ? 7 - rank : rank;
    const symbol = custom ? custom.symbol : { ok: '✓', bad: '✕', best: '★', book: '📖' }[kind!];
    const b = h(`div.sq-badge${kind ? '.' + kind : ''}`, symbol);
    if (custom) b.style.background = custom.color;
    b.style.left = `calc(${(x + 1) * 12.5}% - 14px)`;
    b.style.top = `calc(${y * 12.5}% - 10px)`;
    this.el.append(b);
  }

  destroy(): void {
    this.unsub();
    this.cg.destroy();
  }

  private sync(): void {
    const color = this.turn;
    const canMove = this.movable === 'both' || this.movable === color;
    this.cg.set({
      fen: this.chess.fen(),
      turnColor: color,
      check: this.chess.inCheck() ? color : false,
      lastMove: this.lastMove,
      movable: {
        color: this.movable === 'none' ? undefined : this.movable === 'both' ? 'both' : this.movable,
        dests: canMove && !this.chess.isGameOver() ? legalDests(this.chess) : new Map(),
      },
    });
  }

  private userMove(orig: Key, dest: Key): void {
    const piece = this.chess.get(orig as Square);
    const isPromo = piece?.type === 'p' && ((piece.color === 'w' && dest[1] === '8') || (piece.color === 'b' && dest[1] === '1'));
    if (isPromo && !settings().autoQueen) {
      this.askPromotion(orig, dest, piece.color === 'w' ? 'white' : 'black');
      return;
    }
    this.commitUserMove(orig, dest, isPromo ? 'q' : undefined);
  }

  private commitUserMove(orig: Key, dest: Key, promotion?: string): void {
    let move: Move;
    try {
      move = this.chess.move({ from: orig, to: dest, promotion });
    } catch {
      this.sync();
      return;
    }
    this.lastMove = [orig, dest];
    this.clearShapes();
    this.sync();
    this.moveSound(move);
    haptic();
    this.onMove?.(this.toBoardMove(move));
  }

  private askPromotion(orig: Key, dest: Key, color: Color): void {
    this.closePromo();
    const file = dest.charCodeAt(0) - 97;
    const white = this.orientation === 'white';
    const x = white ? file : 7 - file;
    const fromTop = (color === 'white') === white;
    const roles = ['queen', 'knight', 'rook', 'bishop'];
    const box = h(`div.promo-col${fromTop ? '' : '.from-bottom'}`, { style: { left: `${x * 12.5}%`, [fromTop ? 'top' : 'bottom']: '0' } });
    for (const role of roles) {
      box.append(
        h('div.promo-piece', {
          onclick: (e: Event) => {
            e.stopPropagation();
            this.closePromo();
            this.commitUserMove(orig, dest, role === 'knight' ? 'n' : role[0]);
          },
        }, h(`piece.${role}.${color}`)),
      );
    }
    this.promoEl = h('div.promo-overlay.cg-wrap', {
      onclick: () => {
        this.closePromo();
        this.sync();
      },
    }, box);
    this.el.append(this.promoEl);
  }

  private closePromo(): void {
    this.promoEl?.remove();
    this.promoEl = null;
  }

  private moveSound(m: Move): void {
    if (this.chess.inCheck()) play('check');
    else if (m.promotion) play('promote');
    else if (m.isKingsideCastle() || m.isQueensideCastle()) play('castle');
    else if (m.captured) play('capture');
    else play('move');
  }

  private toBoardMove(m: Move): BoardMove {
    return { from: m.from, to: m.to, promotion: m.promotion, san: m.san, uci: uciOf(m), fen: this.chess.fen(), move: m };
  }
}

// Lightweight static board for thumbnails and lists (no chessground instance).
export function miniBoard(fen: string, orientation: Color = 'white', lastMove?: string): HTMLElement {
  const wrap = h('div.mini-board.cg-wrap');
  const rows = fen.split(' ')[0].split('/');
  const names: Record<string, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  if (lastMove) {
    for (const sq of [lastMove.slice(0, 2), lastMove.slice(2, 4)]) {
      const f = sq.charCodeAt(0) - 97;
      const r = 8 - +sq[1];
      const x = orientation === 'white' ? f : 7 - f;
      const y = orientation === 'white' ? r : 7 - r;
      wrap.append(h('div.mini-hl', { style: { left: `${x * 12.5}%`, top: `${y * 12.5}%` } }));
    }
  }
  rows.forEach((row, r) => {
    let f = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        f += +ch;
        continue;
      }
      const color = ch === ch.toUpperCase() ? 'white' : 'black';
      const x = orientation === 'white' ? f : 7 - f;
      const y = orientation === 'white' ? r : 7 - r;
      wrap.append(h(`piece.${names[ch.toLowerCase()]}.${color}`, { style: { transform: `translate(${x * 100}%, ${y * 100}%)` } }));
      f++;
    }
  });
  return wrap;
}
