import { Board } from '../board/Board';
import { PuzzleRunner } from '../puzzles/PuzzleRunner';
import { pickPuzzle, dailyPuzzle, themeLabel, type Puzzle } from '../puzzles/data';
import { seenIds, type Attempt } from '../db';
import { profile, recordPuzzle, saveProfile, today } from '../stats';
import { h, icon, toast } from '../ui/dom';
import { header, boardLayout, actionBtn, StatusPanel } from '../ui/layout';
import { navigate } from '../router';
import type { ScreenCtx } from '../router';

export interface TrainerOptions {
  title: string;
  back: string;
  mode: Attempt['mode'];
  rated: boolean;
  next: () => Promise<Puzzle | null>;
  onRecorded?: (p: Puzzle, solved: boolean) => void;
  onFinished?: (p: Puzzle) => void;
  emptyText?: string;
}

// Shared puzzle page used by rated, daily and theme modes.
export async function puzzleTrainer(root: HTMLElement, opts: TrainerOptions) {
  const board = new Board({ movable: 'none' });
  const status = new StatusPanel();
  const ratingEl = h('div.rating-big', icon('puzzle'), h('span', '—'));
  const deltaEl = h('span.delta');
  const strip = h('div.rating-strip', ratingEl, deltaEl);
  const info = h('div');
  let puzzle: Puzzle | null = null;
  let recorded = false;
  let started = 0;

  const runner = new PuzzleRunner(board, {
    onReady: (color) => {
      started = Date.now();
      status.set(`${color === 'white' ? 'White' : 'Black'} to move`, color, 'Find the best move');
    },
    onCorrect: () => status.set('Best move!', 'ok', 'Keep going…'),
    onMistake: async () => {
      status.set('Incorrect', 'bad', 'Try again, or tap Solution');
      await record(false);
      showDone(false);
    },
    onSolved: async (clean) => {
      status.set(clean ? 'Solved!' : 'Completed', 'ok', clean ? 'Nice work.' : 'Solved with help.');
      await record(clean);
      if (puzzle) opts.onFinished?.(puzzle);
      showDone(true);
    },
  });

  const hintBtn = actionBtn('hint', 'Hint', () => {
    if (!puzzle || runner.done) return;
    runner.hint();
    void record(false);
  });
  const retryBtn = actionBtn('retry', 'Retry', () => {
    runner.retry();
    hideNext();
  });
  const solutionBtn = actionBtn('book', 'Solution', () => {
    void record(false);
    runner.showSolution(() => {
      status.set('Solution shown', 'info', 'Study it, then try the next one');
      showDone(true);
    });
  });
  const analyzeBtn = actionBtn('analyze', 'Analyze', () => {
    if (!puzzle) return;
    navigate(`analyze?fen=${encodeURIComponent(puzzle.fen)}&moves=${puzzle.moves.join(',')}&o=${runner.color}&ply=1`);
  });
  const nextBtn = h('button.btn.green', { onclick: () => void loadNext() }, 'Next Puzzle');
  nextBtn.style.display = 'none';

  const { under, bar } = boardLayout(root, { header: header(opts.title, { back: opts.back }), board: board.el, above: opts.rated ? strip : undefined });
  under.append(status.el, nextBtn, info);
  bar.append(hintBtn, retryBtn, solutionBtn, analyzeBtn);

  async function refreshRating() {
    const p = await profile();
    (ratingEl.lastChild as HTMLElement).textContent = String(p.rating);
  }

  async function record(solved: boolean) {
    if (recorded || !puzzle) return;
    recorded = true;
    const delta = await recordPuzzle({ id: puzzle.id, rating: puzzle.rating, themes: puzzle.themes.join(' '), solved, mode: opts.mode, ms: Date.now() - started });
    opts.onRecorded?.(puzzle, solved);
    if (opts.rated) {
      deltaEl.textContent = delta >= 0 ? `+${delta}` : String(delta);
      deltaEl.className = `delta ${delta >= 0 ? 'up' : 'down'}`;
      void refreshRating();
    }
  }

  function showDone(_solved: boolean) {
    nextBtn.style.display = '';
    if (!puzzle) return;
    info.replaceChildren(
      h('div.card', { style: { margin: '6px 0 0' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', fontWeight: '700', marginBottom: '8px' } }, h('span', 'Puzzle rating'), h('span', String(puzzle.rating))),
        h('div.chips', puzzle.themes.filter((t) => !['short', 'long', 'veryLong', 'oneMove', 'crushing', 'advantage', 'equality'].includes(t)).map((t) => h('span.chip', themeLabel(t)))),
      ),
    );
  }

  function hideNext() {
    nextBtn.style.display = 'none';
  }

  async function loadNext() {
    hideNext();
    info.replaceChildren();
    deltaEl.textContent = '';
    status.set('Loading…', 'info');
    try {
      puzzle = await opts.next();
    } catch {
      status.set('Puzzles unavailable', 'bad', 'Connect once to download this puzzle pack.');
      return;
    }
    if (!puzzle) {
      status.set(opts.emptyText || 'No more puzzles', 'info');
      return;
    }
    recorded = false;
    runner.load(puzzle);
  }

  await refreshRating();
  await loadNext();
  return () => {
    runner.destroy();
    board.destroy();
  };
}

export async function ratedScreen({ root }: ScreenCtx) {
  return puzzleTrainer(root, {
    title: 'Puzzles',
    back: 'puzzles',
    mode: 'rated',
    rated: true,
    next: async () => {
      const p = await profile();
      // Slightly below rating on average keeps a ~60% success rate, like Chess.com.
      const target = p.rating - 40 + Math.round((Math.random() - 0.5) * 120);
      return pickPuzzle(Math.max(601, target), await seenIds());
    },
  });
}

export async function dailyScreen({ root }: ScreenCtx) {
  let served = false;
  return puzzleTrainer(root, {
    title: 'Daily Puzzle',
    back: 'home',
    mode: 'daily',
    rated: false,
    emptyText: 'Come back tomorrow for a new daily puzzle',
    next: async () => {
      if (served) return null;
      served = true;
      return dailyPuzzle();
    },
    onFinished: async () => {
      const pr = await profile();
      if (pr.dailySolved === today()) return;
      pr.dailySolved = today();
      await saveProfile(pr);
      toast('Daily puzzle solved!', 'ok');
    },
  });
}
