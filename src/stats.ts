import { kvGet, kvSet, addAttempt, type Attempt } from './db';
import { glickoUpdate } from './puzzles/glicko';

export interface Profile {
  rating: number;
  rd: number;
  vol: number;
  peak: number;
  history: { t: number; r: number }[];
  solved: number;
  failed: number;
  streakDays: number;
  lastActiveDay: string;
  rushBest: Record<string, number>;
  themeStats: Record<string, { ok: number; n: number }>;
  dailySolved: string;
}

const DEFAULT: Profile = {
  rating: 800,
  rd: 300,
  vol: 0.06,
  peak: 800,
  history: [],
  solved: 0,
  failed: 0,
  streakDays: 0,
  lastActiveDay: '',
  rushBest: {},
  themeStats: {},
  dailySolved: '',
};

let cache: Profile | null = null;

export async function profile(): Promise<Profile> {
  if (!cache) cache = { ...DEFAULT, ...(await kvGet<Partial<Profile>>('profile', {})) };
  return cache;
}

export async function saveProfile(p: Profile): Promise<void> {
  cache = p;
  await kvSet('profile', p);
}

export function invalidateProfile(): void {
  cache = null;
}

export function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function touchStreak(p: Profile): void {
  const t = today();
  if (p.lastActiveDay === t) return;
  const y = new Date(Date.now() - 86400000);
  const yesterday = `${y.getFullYear()}-${y.getMonth() + 1}-${y.getDate()}`;
  p.streakDays = p.lastActiveDay === yesterday ? p.streakDays + 1 : 1;
  p.lastActiveDay = t;
}

export async function markActive(): Promise<void> {
  const p = await profile();
  touchStreak(p);
  await saveProfile(p);
}

// Records a puzzle result. Rated puzzles change the Glicko rating and return the delta.
export async function recordPuzzle(a: Omit<Attempt, 'at'>): Promise<number> {
  const p = await profile();
  await addAttempt({ ...a, at: Date.now() });
  touchStreak(p);
  if (a.solved) p.solved++;
  else p.failed++;
  for (const t of a.themes.split(' ')) {
    if (!t) continue;
    const s = (p.themeStats[t] ||= { ok: 0, n: 0 });
    s.n++;
    if (a.solved) s.ok++;
  }
  let delta = 0;
  if (a.mode === 'rated') {
    const next = glickoUpdate({ rating: p.rating, rd: p.rd, vol: p.vol }, a.rating, 80, a.solved ? 1 : 0);
    delta = next.rating - p.rating;
    p.rating = next.rating;
    p.rd = next.rd;
    p.vol = next.vol;
    p.peak = Math.max(p.peak, p.rating);
    p.history.push({ t: Date.now(), r: p.rating });
    if (p.history.length > 1000) p.history.splice(0, p.history.length - 1000);
  }
  await saveProfile(p);
  return delta;
}
