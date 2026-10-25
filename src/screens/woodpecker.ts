import { Board } from '../board/Board';
import { PuzzleRunner } from '../puzzles/PuzzleRunner';
import { bandRows, toPuzzle, type PuzzleRow } from '../puzzles/data';
import { kvGet, kvSet } from '../db';
import { profile, recordPuzzle } from '../stats';
import { h, icon, fmtTime, sheet, shuffle, confirmSheet, toast } from '../ui/dom';
import { header, boardLayout, listItem, sectionTitle, StatusPanel, actionBtn } from '../ui/layout';
import { navigate } from '../router';
import type { ScreenCtx } from '../router';

interface Round {
  correct: number;
  total: number;
  ms: number;
  finished: number;
}

interface WoodSet {
  id: string;
  name: string;
  rows: PuzzleRow[];
  rounds: Round[];
  current: { idx: number; correct: number; ms: number; order: number[] } | null;
  created: number;
}

const KEY = 'woodpecker';

async function sets(): Promise<WoodSet[]> {
  return kvGet<WoodSet[]>(KEY, []);
}

async function saveSet(s: WoodSet): Promise<void> {
  const all = await sets();
  const i = all.findIndex((x) => x.id === s.id);
  if (i >= 0) all[i] = s;
  else all.unshift(s);
  await kvSet(KEY, all);
}

export async function woodpeckerMenu({ root }: ScreenCtx) {
  const all = await sets();
  root.append(
    header('Woodpecker', { back: 'puzzles' }),
    h('div.card',
      h('div', { style: { fontWeight: '800', marginBottom: '6px' } }, 'The Woodpecker Method'),
      h('div.muted', { style: { lineHeight: '1.45', fontSize: '14px' } }, 'Solve the same set of puzzles again and again, faster each round. Repetition burns the patterns into memory so you spot them instantly in your games.'),
    ),
    h('div', { style: { padding: '0 14px 6px' } }, h('button.btn.green', { onclick: () => createSheet() }, icon('plus'), 'New Set')),
  );
  if (!all.length) {
    root.append(h('div.empty', 'No sets yet. Create one to start your first round.'));
    return;
  }
  root.append(sectionTitle('Your sets'), h('div.list', all.map((s) => {
    const last = s.rounds[s.rounds.length - 1];
    const sub = s.current
      ? `Round ${s.rounds.length + 1} in progress · ${s.current.idx}/${s.rows.length}`
      : last
        ? `${s.rounds.length} round${s.rounds.length > 1 ? 's' : ''} · last ${Math.round((last.correct / last.total) * 100)}% in ${fmtTime(last.ms)}`
        : 'Not started';
    return listItem({ title: s.name, sub, icon: icon('repeat', 'c-green'), onclick: () => setSheet(s) });
  })));
}

function setSheet(s: WoodSet) {
  const rows = s.rounds.map((r, i) => h('div.bar-row', h('span.name', `Round ${i + 1}`), h('div.progress', h('div', { style: { width: `${(r.correct / r.total) * 100}%` } })), h('span.pct', fmtTime(r.ms))));
  const sh = sheet(s.name, h('div.sheet-body',
    rows.length ? h('div', { style: { marginBottom: '12px' } }, ...rows) : h('p.muted', `${s.rows.length} puzzles. Aim for 85%+ accuracy, then repeat faster.`),
    h('button.btn.green', { onclick: () => { sh.close(); navigate(`puzzles/woodpecker/play?id=${s.id}`); } }, s.current ? 'Continue Round' : s.rounds.length ? 'Start Next Round' : 'Start Round 1'),
    h('button.btn.gray', {
      style: { marginTop: '6px' },
      onclick: async () => {
        if (!(await confirmSheet('Delete set?', 'Your round history for this set will be removed.', 'Delete'))) return;
        await kvSet(KEY, (await sets()).filter((x) => x.id !== s.id));
        sh.close();
        location.reload();
      },
    }, icon('trash'), 'Delete'),
  ));
}

async function createSheet() {
  const p = await profile();
  let size = 50;
  let level = 0;
  const sizeSeg = seg(['25', '50', '100', '200'], '50', (v) => (size = +v));
  const levelSeg = seg(['Easier', 'My level', 'Harder'], 'My level', (v) => (level = v === 'Easier' ? -200 : v === 'Harder' ? 150 : 0));
  const sh = sheet('New Woodpecker set', h('div.sheet-body',
    h('div.setting-label', { style: { margin: '4px 0 8px' } }, 'Number of puzzles'), sizeSeg,
    h('div.setting-label', { style: { margin: '16px 0 8px' } }, 'Difficulty'), levelSeg,
    h('p.muted', { style: { marginTop: '12px', fontSize: '13px' } }, 'Woodpecker works best with puzzles a bit below your rating, so you can build speed.'),
    h('button.btn.green', {
      onclick: async () => {
        const center = Math.max(650, p.rating - 150 + level);
        const pool: PuzzleRow[] = [];
        for (const r of [center - 100, center, center + 100]) pool.push(...(await bandRows(r)).filter((x) => Math.abs(x[3] - center) <= 150));
        const rows = shuffle([...new Map(pool.map((r) => [r[0], r])).values()]).slice(0, size);
        const all = await sets();
        const s: WoodSet = { id: String(Date.now()), name: `Set ${all.length + 1} · ~${center} · ${rows.length} puzzles`, rows, rounds: [], current: null, created: Date.now() };
        await saveSet(s);
        sh.close();
        toast('Set created', 'ok');
        navigate(`puzzles/woodpecker/play?id=${s.id}`);
      },
    }, 'Create Set'),
  ));
}

function seg(options: string[], initial: string, onChange: (v: string) => void): HTMLElement {
  const el = h('div.segmented');
  for (const o of options) {
    const b = h(`button${o === initial ? '.on' : ''}`, {
      onclick: () => {
        el.querySelectorAll('button').forEach((x) => x.classList.remove('on'));
        b.classList.add('on');
        onChange(o);
      },
    }, o);
    el.append(b);
  }
  return el;
}

export async function woodpeckerScreen({ root, params }: ScreenCtx) {
  const s = (await sets()).find((x) => x.id === params.get('id'));
  if (!s) {
    navigate('puzzles/woodpecker', { replace: true });
    return;
  }
  if (!s.current) s.current = { idx: 0, correct: 0, ms: 0, order: shuffle(s.rows.map((_, i) => i)) };
  const cur = s.current;
  const board = new Board({ movable: 'none' });
  const status = new StatusPanel();
  const progressFill = h('div', { style: { width: '0%' } });
  const countEl = h('span');
  const timerEl = h('span.rush-timer', { style: { fontSize: '18px' } }, fmtTime(cur.ms));
  const top = h('div.rush-top', h('div', { style: { flex: '1', marginRight: '12px' } }, h('div', { style: { fontWeight: '800', marginBottom: '6px' } }, `Round ${s.rounds.length + 1} · `, countEl), h('div.progress', progressFill)), timerEl);
  const nextBtn = h('button.btn.green', { onclick: () => advance() }, 'Next');
  nextBtn.style.display = 'none';
  let segStart = Date.now();
  let failed = false;
  let puzzleStart = 0;
  let closed = false;

  const runner = new PuzzleRunner(board, {
    onReady: (color) => {
      puzzleStart = Date.now();
      status.set(`${color === 'white' ? 'White' : 'Black'} to move`, color);
    },
    onMistake: (first) => {
      if (!first) return;
      failed = true;
      runner.showSolution(() => {
        status.set('Missed — study the solution', 'bad', 'You’ll see this one again next round');
        nextBtn.style.display = '';
      });
    },
    onSolved: () => {
      status.set('Correct', 'ok');
      setTimeout(() => advance(), 450);
    },
  });

  const { under, bar } = boardLayout(root, { header: header(s.name.split(' · ')[0], { back: 'puzzles/woodpecker' }), board: board.el, above: top });
  under.append(status.el, nextBtn);
  bar.append(actionBtn('back', 'Pause', () => navigate('puzzles/woodpecker')));

  const tick = window.setInterval(() => (timerEl.textContent = fmtTime(cur.ms + Date.now() - segStart)), 500);

  function render() {
    countEl.textContent = `${cur.idx + 1}/${s!.rows.length}`;
    progressFill.style.width = `${(cur.idx / s!.rows.length) * 100}%`;
  }

  function load() {
    failed = false;
    nextBtn.style.display = 'none';
    render();
    runner.load(toPuzzle(s!.rows[cur.order[cur.idx]]), { instant: cur.idx > 0 });
  }

  async function advance() {
    if (closed) return;
    const row = s!.rows[cur.order[cur.idx]];
    void recordPuzzle({ id: row[0], rating: row[3], themes: row[4], solved: !failed, mode: 'woodpecker', ms: Date.now() - puzzleStart });
    if (!failed) cur.correct++;
    cur.idx++;
    cur.ms += Date.now() - segStart;
    segStart = Date.now();
    if (cur.idx >= s!.rows.length) {
      const round: Round = { correct: cur.correct, total: s!.rows.length, ms: cur.ms, finished: Date.now() };
      s!.rounds.push(round);
      s!.current = null;
      await saveSet(s!);
      closed = true;
      const prev = s!.rounds[s!.rounds.length - 2];
      sheet(`Round ${s!.rounds.length} complete`, h('div.sheet-body',
        h('div.big-result', h('div.num', `${Math.round((round.correct / round.total) * 100)}%`), h('div.lbl', `${round.correct}/${round.total} in ${fmtTime(round.ms)}`)),
        prev ? h('p.muted', { style: { textAlign: 'center' } }, round.ms < prev.ms ? `${fmtTime(prev.ms - round.ms)} faster than last round!` : 'Keep going: speed comes with repetition.') : null,
        h('button.btn.green', { onclick: () => navigate('puzzles/woodpecker', { replace: true }) }, 'Done'),
      ), { onClose: () => navigate('puzzles/woodpecker', { replace: true }) });
      return;
    }
    await saveSet(s!);
    load();
  }

  load();
  return () => {
    clearInterval(tick);
    if (!closed && s.current) {
      cur.ms += Date.now() - segStart;
      void saveSet(s);
    }
    runner.destroy();
    board.destroy();
  };
}
