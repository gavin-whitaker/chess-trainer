import { kvGet, kvSet } from '../db';
import { FEATURED, type Book } from './book';

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

// Random lesson from the popular openings, favouring lines you haven't learned or mastered yet.
export async function randomLesson(book: Book, exclude?: number): Promise<{ idx: number; side: 'white' | 'black' } | null> {
  const recs = await lessonRecords();
  const pool: { idx: number; side: 'white' | 'black'; w: number }[] = [];
  for (const f of FEATURED) {
    for (const l of book.families.get(f.family) ?? []) {
      if (l.idx === exclude || l.ucis.length < 4 || l.ucis.length > 16) continue;
      const stars = recs[l.idx]?.stars ?? 0;
      pool.push({ idx: l.idx, side: f.side, w: [4, 2, 1, 0.3][stars] });
    }
  }
  let r = Math.random() * pool.reduce((s, p) => s + p.w, 0);
  for (const p of pool) {
    r -= p.w;
    if (r <= 0) return p;
  }
  return pool[0] ?? null;
}

export function starsText(n: number): string {
  return '★'.repeat(n) + '☆'.repeat(Math.max(0, 3 - n));
}
