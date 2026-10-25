import type { RepertoireLine } from '../db';

const DAY = 86400000;

// SM-2 scheduling. grade: 0 = forgot, 3 = hard (needed a correction), 5 = perfect.
export function schedule(line: RepertoireLine, grade: 0 | 3 | 5, now = Date.now()): RepertoireLine {
  let { interval, ease, reps, lapses } = line;
  if (grade < 3) {
    reps = 0;
    lapses++;
    interval = 0;
  } else {
    reps++;
    if (reps === 1) interval = 1;
    else if (reps === 2) interval = 3;
    else interval = Math.round(interval * ease);
    if (grade === 3) interval = Math.max(1, Math.round(interval * 0.6));
  }
  ease = Math.max(1.3, ease + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)));
  // Failed lines come back in 10 minutes in the same session.
  const due = interval === 0 ? now + 10 * 60000 : now + interval * DAY;
  return { ...line, interval, ease, reps, lapses, due };
}

export function newLine(partial: Pick<RepertoireLine, 'color' | 'name' | 'ucis' | 'sans'>): RepertoireLine {
  return {
    ...partial,
    id: `${partial.color}:${partial.ucis.join(',')}`,
    added: Date.now(),
    due: Date.now(),
    interval: 0,
    ease: 2.5,
    reps: 0,
    lapses: 0,
  };
}

export function isDue(l: RepertoireLine, now = Date.now()): boolean {
  return l.due <= now;
}

export function dueLabel(l: RepertoireLine): string {
  const d = l.due - Date.now();
  if (d <= 0) return 'Due now';
  if (d < DAY) return `Due in ${Math.max(1, Math.round(d / 3600000))}h`;
  return `Due in ${Math.round(d / DAY)}d`;
}
