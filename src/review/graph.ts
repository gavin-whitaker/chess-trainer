import { CLS_META, wpWhite, type MoveReview, type PosEval } from './analysis';

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, String(v));
  return e;
}

const MARKED = new Set(['brilliant', 'great', 'mistake', 'miss', 'blunder']);

// Chess.com-style advantage graph: white area = White's winning chances. Tap to jump to a move.
export class EvalGraph {
  readonly el: HTMLElement;
  private cursor: SVGLineElement;
  private n: number;

  constructor(evals: PosEval[], moves: MoveReview[], onPick: (ply: number) => void, height = 72) {
    const W = 300;
    const H = height;
    this.n = evals.length;
    const x = (i: number) => (this.n > 1 ? (i / (this.n - 1)) * W : 0);
    const y = (i: number) => H - (wpWhite(evals[i]) / 100) * H;
    const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'eval-graph-svg' });
    svg.append(el('rect', { x: 0, y: 0, width: W, height: H, fill: '#403d39' }));
    let d = `M0 ${H}`;
    for (let i = 0; i < this.n; i++) d += ` L${x(i).toFixed(1)} ${y(i).toFixed(1)}`;
    d += ` L${W} ${H} Z`;
    svg.append(el('path', { d, fill: '#f0f0f0' }));
    svg.append(el('line', { x1: 0, y1: H / 2, x2: W, y2: H / 2, stroke: '#8b8987', 'stroke-width': 0.6, 'stroke-dasharray': '3 3' }));
    this.cursor = el('line', { x1: 0, y1: 0, x2: 0, y2: H, stroke: '#81b64c', 'stroke-width': 2 });
    svg.append(this.cursor);
    this.el = document.createElement('div');
    this.el.className = 'eval-graph';
    this.el.append(svg);
    for (const m of moves) {
      if (!MARKED.has(m.cls)) continue;
      const dot = document.createElement('span');
      dot.className = 'eval-dot';
      dot.style.left = `${(x(m.ply + 1) / W) * 100}%`;
      dot.style.top = `${Math.min(90, Math.max(10, (y(m.ply + 1) / H) * 100))}%`;
      dot.style.background = CLS_META[m.cls].color;
      this.el.append(dot);
    }
    this.el.addEventListener('click', (e) => {
      const r = this.el.getBoundingClientRect();
      const ply = Math.round(((e.clientX - r.left) / r.width) * (this.n - 1));
      onPick(Math.max(0, Math.min(this.n - 1, ply)));
    });
    this.set(0);
  }

  set(ply: number): void {
    const x = this.n > 1 ? (ply / (this.n - 1)) * 300 : 0;
    this.cursor.setAttribute('x1', String(x));
    this.cursor.setAttribute('x2', String(x));
  }
}
