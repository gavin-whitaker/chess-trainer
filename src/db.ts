import { openDB, type IDBPDatabase } from 'idb';

export interface Attempt {
  id: string;
  rating: number;
  themes: string;
  solved: boolean;
  mode: 'rated' | 'rush' | 'theme' | 'woodpecker' | 'daily';
  at: number;
  ms: number;
}

export interface RepertoireLine {
  id: string;
  color: 'white' | 'black';
  name: string;
  ucis: string[];
  sans: string[];
  added: number;
  due: number;
  interval: number;
  ease: number;
  reps: number;
  lapses: number;
}

let dbp: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbp) {
    dbp = openDB('chess-trainer', 1, {
      upgrade(d) {
        d.createObjectStore('kv');
        const a = d.createObjectStore('attempts', { keyPath: 'key', autoIncrement: true });
        a.createIndex('id', 'id');
        d.createObjectStore('repertoire', { keyPath: 'id' });
      },
    });
  }
  return dbp;
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  const v = await (await db()).get('kv', key);
  return v === undefined ? fallback : (v as T);
}

export async function kvSet<T>(key: string, value: T): Promise<void> {
  await (await db()).put('kv', value, key);
}

let seenCache: Set<string> | null = null;

export async function addAttempt(a: Attempt): Promise<void> {
  await (await db()).add('attempts', a);
  seenCache?.add(a.id);
}

export async function allAttempts(): Promise<Attempt[]> {
  return (await db()).getAll('attempts');
}

export async function seenIds(): Promise<Set<string>> {
  if (!seenCache) {
    const all: Attempt[] = await (await db()).getAll('attempts');
    seenCache = new Set(all.map((a) => a.id));
  }
  return seenCache;
}

export async function repertoire(): Promise<RepertoireLine[]> {
  return (await db()).getAll('repertoire');
}

export async function putLine(line: RepertoireLine): Promise<void> {
  await (await db()).put('repertoire', line);
}

export async function deleteLine(id: string): Promise<void> {
  await (await db()).delete('repertoire', id);
}

export async function exportAll(): Promise<string> {
  const d = await db();
  const kvKeys = await d.getAllKeys('kv');
  const kv: Record<string, unknown> = {};
  for (const k of kvKeys) kv[String(k)] = await d.get('kv', k);
  return JSON.stringify({
    app: 'chess-trainer',
    version: 1,
    exported: new Date().toISOString(),
    settings: localStorage.getItem('ct-settings'),
    kv,
    attempts: await d.getAll('attempts'),
    repertoire: await d.getAll('repertoire'),
  });
}

export async function importAll(json: string): Promise<void> {
  const data = JSON.parse(json);
  if (data.app !== 'chess-trainer') throw new Error('Not a Chess Trainer backup');
  const d = await db();
  const tx = d.transaction(['kv', 'attempts', 'repertoire'], 'readwrite');
  await Promise.all([tx.objectStore('kv').clear(), tx.objectStore('attempts').clear(), tx.objectStore('repertoire').clear()]);
  for (const [k, v] of Object.entries(data.kv || {})) await tx.objectStore('kv').put(v, k);
  for (const a of data.attempts || []) {
    const { key: _key, ...rest } = a;
    void _key;
    await tx.objectStore('attempts').add(rest);
  }
  for (const r of data.repertoire || []) await tx.objectStore('repertoire').put(r);
  await tx.done;
  if (data.settings) localStorage.setItem('ct-settings', data.settings);
  seenCache = null;
}
