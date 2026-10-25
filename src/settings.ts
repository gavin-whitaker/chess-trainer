export type BoardTheme = 'green' | 'brown' | 'blue' | 'gray';
export type PieceSet = 'cburnett' | 'merida';
export type ThemeMode = 'dark' | 'light' | 'system';

export interface Settings {
  boardTheme: BoardTheme;
  pieceSet: PieceSet;
  theme: ThemeMode;
  sound: boolean;
  haptics: boolean;
  coords: boolean;
  showDests: boolean;
  autoQueen: boolean;
  explorerToken: string;
}

const KEY = 'ct-settings';

const DEFAULTS: Settings = {
  boardTheme: 'green',
  pieceSet: 'cburnett',
  theme: 'dark',
  sound: true,
  haptics: true,
  coords: true,
  showDests: true,
  autoQueen: false,
  explorerToken: '',
};

let current: Settings = load();
const listeners = new Set<(s: Settings) => void>();

function load(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}

export function settings(): Settings {
  return current;
}

export function updateSettings(patch: Partial<Settings>): void {
  current = { ...current, ...patch };
  localStorage.setItem(KEY, JSON.stringify(current));
  applyTheme();
  listeners.forEach((fn) => fn(current));
}

export function onSettings(fn: (s: Settings) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function applyTheme(): void {
  const s = current;
  const dark = s.theme === 'dark' || (s.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.board = s.boardTheme;
  document.documentElement.dataset.pieces = s.pieceSet;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#262421' : '#f1f1ef');
}
