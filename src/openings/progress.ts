import { kvGet, kvSet } from '../db';

export interface LessonRecord {
  stars: number;
  done: number;
  last: number;
  side: 'white' | 'black';
}

export async function lessonRecords(): Promise<Record<number, LessonRecord>> {
  return kvGet<Record<number, LessonRecord>>('lessons', {});
}

export async function saveLesson(idx: number, stars: number, side: 'white' | 'black'): Promise<void> {
  const all = await lessonRecords();
  const prev = all[idx];
  all[idx] = { stars: Math.max(stars, prev?.stars ?? 0), done: (prev?.done ?? 0) + 1, last: Date.now(), side };
  await kvSet('lessons', all);
  await kvSet('lastLesson', { idx, side });
}

export async function lastLesson(): Promise<{ idx: number; side: 'white' | 'black' } | null> {
  return kvGet('lastLesson', null);
}

export function starsText(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}
