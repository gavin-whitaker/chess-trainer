export interface EngineLine {
  multipv: number;
  depth: number;
  // Score from White's point of view.
  cp?: number;
  mate?: number;
  pv: string[];
}

export interface AnalyzeOptions {
  depth?: number;
  movetime?: number;
  multipv?: number;
  onUpdate?: (lines: EngineLine[]) => void;
}

interface Job {
  fen: string;
  opts: AnalyzeOptions;
  lines: EngineLine[];
  resolve: (r: { best: string; lines: EngineLine[] }) => void;
}

// Single shared Stockfish worker (lite, single-threaded WASM: runs on iOS without cross-origin isolation).
class Engine {
  private worker: Worker | null = null;
  private ready: Promise<void> | null = null;
  private job: Job | null = null;
  private queued: Job | null = null;
  private stopping = false;

  private boot(): Promise<void> {
    if (this.ready) return this.ready;
    this.ready = new Promise((resolve) => {
      this.worker = new Worker('/engine/stockfish-19-lite-single.js');
      this.worker.onmessage = (e) => {
        const line = String(e.data);
        if (line === 'uciok') this.worker!.postMessage('isready');
        else if (line === 'readyok' && !this.job) resolve();
        else this.handle(line);
      };
      this.worker.postMessage('uci');
      this.worker.postMessage('setoption name Hash value 32');
    });
    return this.ready;
  }

  async analyze(fen: string, opts: AnalyzeOptions = {}): Promise<{ best: string; lines: EngineLine[] }> {
    await this.boot();
    return new Promise((resolve) => {
      const job: Job = { fen, opts, lines: [], resolve };
      if (this.job) {
        if (this.queued) this.queued.resolve({ best: '', lines: [] });
        this.queued = job;
        if (!this.stopping) {
          this.stopping = true;
          this.worker!.postMessage('stop');
        }
      } else this.start(job);
    });
  }

  stop(): void {
    if (this.queued) {
      this.queued.resolve({ best: '', lines: [] });
      this.queued = null;
    }
    if (this.job && !this.stopping) {
      this.stopping = true;
      this.worker?.postMessage('stop');
    }
  }

  private start(job: Job): void {
    this.job = job;
    const w = this.worker!;
    w.postMessage(`setoption name MultiPV value ${job.opts.multipv ?? 1}`);
    w.postMessage(`position fen ${job.fen}`);
    if (job.opts.movetime) w.postMessage(`go movetime ${job.opts.movetime}`);
    else w.postMessage(`go depth ${job.opts.depth ?? 18}`);
  }

  private handle(line: string): void {
    const job = this.job;
    if (!job) return;
    if (line.startsWith('bestmove')) {
      const best = line.split(' ')[1] || '';
      this.job = null;
      this.stopping = false;
      job.resolve({ best: best === '(none)' ? '' : best, lines: job.lines.filter(Boolean) });
      const next = this.queued;
      this.queued = null;
      if (next) this.start(next);
      return;
    }
    if (!line.startsWith('info') || !line.includes(' pv ') || this.stopping) return;
    const tok = line.split(' ');
    const get = (k: string) => {
      const i = tok.indexOf(k);
      return i >= 0 ? tok[i + 1] : undefined;
    };
    const multipv = +(get('multipv') || 1);
    const depth = +(get('depth') || 0);
    const whiteToMove = job.fen.split(' ')[1] === 'w';
    const sign = whiteToMove ? 1 : -1;
    const si = tok.indexOf('score');
    const entry: EngineLine = { multipv, depth, pv: tok.slice(tok.indexOf('pv') + 1) };
    if (tok[si + 1] === 'cp') entry.cp = +tok[si + 2] * sign;
    else if (tok[si + 1] === 'mate') entry.mate = +tok[si + 2] * sign;
    job.lines[multipv - 1] = entry;
    job.opts.onUpdate?.(job.lines.filter(Boolean));
  }
}

export const engine = new Engine();

export function fmtScore(l: Pick<EngineLine, 'cp' | 'mate'> | undefined): string {
  if (!l) return '0.0';
  if (l.mate !== undefined) return l.mate === 0 ? '#' : `${l.mate > 0 ? '' : '-'}M${Math.abs(l.mate)}`;
  const v = (l.cp ?? 0) / 100;
  return `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
}

// Win probability for White, 0..1 (Lichess formula).
export function winChance(l: Pick<EngineLine, 'cp' | 'mate'> | undefined): number {
  if (!l) return 0.5;
  if (l.mate !== undefined) return l.mate > 0 || (l.mate === 0 && (l.cp ?? 0) >= 0) ? 1 : 0;
  const cp = Math.max(-1000, Math.min(1000, l.cp ?? 0));
  return 1 / (1 + Math.exp(-0.00368208 * cp));
}
