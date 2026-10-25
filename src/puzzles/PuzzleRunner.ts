import type { Board, BoardMove } from '../board/Board';
import { play, haptic } from '../board/feedback';
import type { Puzzle } from './data';

export interface RunnerEvents {
  onReady?: (color: 'white' | 'black') => void;
  onCorrect?: () => void;
  onMistake?: (first: boolean) => void;
  onSolved?: (clean: boolean) => void;
}

// Drives one Lichess-format puzzle: FEN is before the opponent's setup move (moves[0]);
// the user then plays moves[1], moves[3], ... and the opponent replies with the even moves.
export class PuzzleRunner {
  puzzle: Puzzle | null = null;
  color: 'white' | 'black' = 'white';
  mistakes = 0;
  hintsUsed = 0;
  done = false;
  private step = 0;
  private timers: number[] = [];
  private hintLevel = 0;

  constructor(private board: Board, private ev: RunnerEvents = {}) {
    board.setOnMove((m) => this.userMove(m));
  }

  get solvedCleanly(): boolean {
    return this.done && this.mistakes === 0 && this.hintsUsed === 0;
  }

  load(p: Puzzle, opts: { instant?: boolean } = {}): void {
    this.clearTimers();
    this.puzzle = p;
    this.mistakes = 0;
    this.hintsUsed = 0;
    this.hintLevel = 0;
    this.done = false;
    this.step = 0;
    const sideToMove = p.fen.split(' ')[1];
    this.color = sideToMove === 'w' ? 'black' : 'white';
    this.board.clearShapes();
    this.board.clearMarks();
    this.board.badge('a1', null);
    this.board.setMovable('none');
    this.board.setPosition(p.fen);
    this.board.setOrientation(this.color);
    this.later(() => {
      this.board.play(p.moves[0]);
      this.step = 1;
      this.board.setMovable(this.color);
      this.ev.onReady?.(this.color);
    }, opts.instant ? 50 : 650);
  }

  // Restart from the position after the setup move, keeping the mistake count.
  retry(): void {
    if (!this.puzzle) return;
    const p = this.puzzle;
    const mistakes = this.mistakes;
    const hints = this.hintsUsed;
    this.load(p, { instant: true });
    this.mistakes = mistakes;
    this.hintsUsed = hints;
  }

  hint(): void {
    if (!this.puzzle || this.done) return;
    const expected = this.puzzle.moves[this.step];
    if (!expected) return;
    this.hintsUsed++;
    this.hintLevel++;
    if (this.hintLevel === 1) this.board.markSquare(expected.slice(0, 2), 'hint');
    else {
      this.board.clearMarks();
      this.board.arrow(expected, 'hint');
    }
  }

  showSolution(onDone?: () => void): void {
    if (!this.puzzle || this.done) return;
    this.board.setMovable('none');
    this.board.clearShapes();
    this.board.clearMarks();
    const rest = this.puzzle.moves.slice(this.step);
    this.done = true;
    rest.forEach((uci, i) => {
      this.later(() => {
        this.board.play(uci);
        if (i === rest.length - 1) onDone?.();
      }, 500 + i * 700);
    });
    if (!rest.length) onDone?.();
  }

  destroy(): void {
    this.clearTimers();
  }

  private userMove(m: BoardMove): void {
    const p = this.puzzle;
    if (!p || this.done) return;
    const expected = p.moves[this.step];
    const correct = m.uci === expected || this.board.chess.isCheckmate();
    this.board.clearMarks();
    this.hintLevel = 0;
    if (!correct) {
      this.mistakes++;
      this.board.setMovable('none');
      this.board.badge(m.to, 'bad');
      play('wrong');
      haptic('heavy');
      this.ev.onMistake?.(this.mistakes === 1);
      this.later(() => {
        this.board.undo();
        this.board.badge('a1', null);
        if (!this.done) this.board.setMovable(this.color);
      }, 550);
      return;
    }
    this.step++;
    const finished = this.step >= p.moves.length || this.board.chess.isCheckmate();
    this.board.badge(m.to, finished ? 'best' : 'ok');
    if (finished) {
      this.done = true;
      this.board.setMovable('none');
      play('solved');
      haptic();
      this.ev.onSolved?.(this.mistakes === 0 && this.hintsUsed === 0);
      return;
    }
    play('correct');
    this.ev.onCorrect?.();
    this.board.setMovable('none');
    this.later(() => {
      this.board.badge('a1', null);
      this.board.play(p.moves[this.step]);
      this.step++;
      this.board.setMovable(this.color);
    }, 380);
  }

  private later(fn: () => void, ms: number): void {
    this.timers.push(window.setTimeout(fn, ms));
  }

  private clearTimers(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
