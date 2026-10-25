import { Board } from '../board/Board';
import { play } from '../board/feedback';
import { PuzzleRunner } from '../puzzles/PuzzleRunner';
import { pickPuzzle, type Puzzle } from '../puzzles/data';
import { profile, recordPuzzle, saveProfile } from '../stats';
import { h, icon, fmtTime, sheet } from '../ui/dom';
import { header, boardLayout, listItem, sectionTitle } from '../ui/layout';
import { navigate } from '../router';
import type { ScreenCtx } from '../router';

const MODES: Record<string, { label: string; ms: number; strikes: number; sub: string }> = {
  '3': { label: '3 Minute', ms: 180000, strikes: 3, sub: 'Solve as many as you can in 3 minutes' },
  '5': { label: '5 Minute', ms: 300000, strikes: 3, sub: 'More time, same three strikes' },
  survival: { label: 'Survival', ms: 0, strikes: 3, sub: 'No clock. Three mistakes and you’re out' },
};

export async function rushMenu({ root }: ScreenCtx) {
  const p = await profile();
  root.append(
    header('Puzzle Rush', { back: 'puzzles' }),
    h('div.card', { style: { textAlign: 'center' } },
      icon('bolt', 'c-orange'),
      h('p', { style: { margin: '8px 0 0', lineHeight: '1.45' } }, 'Puzzles start easy and get harder with every one you solve. Three wrong moves ends your run.'),
    ),
    sectionTitle('Choose a mode'),
    h('div.list', Object.entries(MODES).map(([k, m]) =>
      listItem({ title: m.label, sub: m.sub, right: h('span.c-orange', `Best ${p.rushBest[k] ?? 0}`), icon: icon(k === 'survival' ? 'heart' : 'clock', 'c-orange'), onclick: () => navigate(`puzzles/rush/play?mode=${k}`) }),
    )),
  );
}

export async function rushScreen({ root, params }: ScreenCtx) {
  const modeKey = params.get('mode') && MODES[params.get('mode')!] ? params.get('mode')! : '3';
  const mode = MODES[modeKey];
  const board = new Board({ movable: 'none' });
  const scoreEl = h('div.rush-score', '0');
  const timerEl = h('div.rush-timer', mode.ms ? fmtTime(mode.ms) : '∞');
  const strikesEl = h('div.strikes');
  const top = h('div.rush-top', scoreEl, strikesEl, timerEl);
  const logEl = h('div.rush-log');
  const statusEl = h('div.status-panel.info', h('div.status-dot'), h('div.status-body', h('div.status-text', 'Get ready…')));

  let score = 0;
  let strikes = 0;
  let index = 0;
  let endAt = 0;
  let over = false;
  let tick = 0;
  let current: Puzzle | null = null;
  let puzzleStart = 0;
  const seen = new Set<string>();

  const runner = new PuzzleRunner(board, {
    onReady: (color) => {
      puzzleStart = Date.now();
      setStatus(`${color === 'white' ? 'White' : 'Black'} to move`, color);
    },
    onMistake: () => {
      // In Rush a wrong move fails the puzzle immediately.
      runner.done = true;
      void result(false);
    },
    onSolved: () => void result(true),
  });

  const { under, bar } = boardLayout(root, { header: header(`Puzzle Rush · ${mode.label}`, { back: 'puzzles/rush' }), board: board.el, above: top });
  under.append(statusEl, logEl);
  bar.append(h('button.btn.gray.small', { style: { margin: '6px auto', width: '60%' }, onclick: () => end() }, 'Resign run'));
  renderStrikes();

  function setStatus(text: string, kind: string) {
    statusEl.className = `status-panel ${kind}`;
    (statusEl.querySelector('.status-text') as HTMLElement).textContent = text;
  }

  function renderStrikes() {
    strikesEl.replaceChildren(...Array.from({ length: mode.strikes }, (_, i) => h(`div.strike${i < strikes ? '.hit' : ''}`, i < strikes ? '✕' : '')));
  }

  // Difficulty ramps from ~650 up by ~45 points per puzzle, like Chess.com's Rush.
  function targetRating(): number {
    return 650 + index * 45 + Math.round(index * index * 0.6);
  }

  async function result(ok: boolean) {
    if (!current || over) return;
    logEl.append(h(`span.${ok ? 'ok' : 'bad'}`, ok ? '✓' : '✕'));
    void recordPuzzle({ id: current.id, rating: current.rating, themes: current.themes.join(' '), solved: ok, mode: 'rush', ms: Date.now() - puzzleStart });
    if (ok) {
      score++;
      scoreEl.textContent = String(score);
      scoreEl.animate([{ transform: 'scale(1.25)' }, { transform: 'scale(1)' }], { duration: 250 });
    } else {
      strikes++;
      renderStrikes();
      if (strikes >= mode.strikes) {
        setTimeout(end, 500);
        return;
      }
    }
    index++;
    setTimeout(() => void next(), ok ? 350 : 650);
  }

  async function next() {
    if (over) return;
    current = await pickPuzzle(targetRating(), seen, 60);
    seen.add(current.id);
    runner.load(current, { instant: true });
  }

  async function end() {
    if (over) return;
    over = true;
    clearInterval(tick);
    board.setMovable('none');
    const p = await profile();
    const prev = p.rushBest[modeKey] ?? 0;
    const isBest = score > prev;
    if (isBest) {
      p.rushBest[modeKey] = score;
      await saveProfile(p);
    }
    play(isBest ? 'solved' : 'start');
    sheet('', h('div.sheet-body',
      h('div.big-result', h('div.num', String(score)), h('div.lbl', isBest ? 'New personal best!' : `Personal best: ${prev}`)),
      h('div.rush-log', { style: { justifyContent: 'center', margin: '8px 0 16px' } }, ...Array.from(logEl.children).map((c) => c.cloneNode(true))),
      h('button.btn.green', { onclick: () => location.reload() }, 'Play Again'),
      h('button.btn.gray', { style: { marginTop: '6px' }, onclick: () => navigate('puzzles/rush', { replace: true }) }, 'Done'),
    ), { onClose: () => navigate('puzzles/rush', { replace: true }) });
  }

  play('start');
  if (mode.ms) {
    endAt = Date.now() + mode.ms;
    tick = window.setInterval(() => {
      const left = endAt - Date.now();
      timerEl.textContent = fmtTime(left);
      timerEl.classList.toggle('low', left < 15000);
      if (left <= 0) void end();
    }, 250);
  }
  await next();

  return () => {
    over = true;
    clearInterval(tick);
    runner.destroy();
    board.destroy();
  };
}
