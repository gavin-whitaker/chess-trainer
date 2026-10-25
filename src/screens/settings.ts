import { settings, updateSettings, type BoardTheme, type Settings } from '../settings';
import { exportAll, importAll } from '../db';
import { invalidateProfile } from '../stats';
import { h, icon, toast, confirmSheet } from '../ui/dom';
import { header, sectionTitle } from '../ui/layout';
import { miniBoard } from '../board/Board';
import type { ScreenCtx } from '../router';

const BOARDS: { id: BoardTheme; l: string; d: string }[] = [
  { id: 'green', l: '#ebecd0', d: '#739552' },
  { id: 'brown', l: '#f0d9b5', d: '#b58863' },
  { id: 'blue', l: '#dee3e6', d: '#8ca2ad' },
  { id: 'gray', l: '#e0e0e0', d: '#8c8c8c' },
];

export function settingsScreen({ root }: ScreenCtx) {
  const s = settings();
  const preview = h('div', { style: { width: '120px', borderRadius: '6px', overflow: 'hidden' } }, miniBoard('r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3'));

  root.append(
    header('Settings', { back: 'profile' }),
    sectionTitle('Board'),
    h('div.list',
      h('div.setting', h('div', h('div.setting-label', 'Board colors'), h('div.swatches', { style: { marginTop: '10px' } }, BOARDS.map((b) => {
        const sw = h(`button.swatch${s.boardTheme === b.id ? '.on' : ''}`, {
          style: `--l:${b.l};--d:${b.d}`,
          onclick: () => {
            updateSettings({ boardTheme: b.id });
            sw.parentElement!.querySelectorAll('.swatch').forEach((x) => x.classList.toggle('on', x === sw));
          },
        }, h('i'), h('i'), h('i'), h('i'));
        return sw;
      }))), preview),
      segRow('Pieces', ['cburnett', 'merida'], s.pieceSet, (v) => updateSettings({ pieceSet: v as Settings['pieceSet'] }), { cburnett: 'Classic', merida: 'Merida' }),
      toggle('Show legal moves', 'Dots on squares you can move to', 'showDests'),
      toggle('Coordinates', 'Files and ranks on the board edge', 'coords'),
      toggle('Auto-queen', 'Skip the promotion picker', 'autoQueen'),
    ),
    sectionTitle('App'),
    h('div.list',
      segRow('Theme', ['dark', 'light', 'system'], s.theme, (v) => updateSettings({ theme: v as Settings['theme'] }), { dark: 'Dark', light: 'Light', system: 'Auto' }),
      toggle('Sounds', 'Move, capture and puzzle sounds', 'sound'),
      toggle('Haptics', 'Vibration feedback on moves', 'haptics'),
    ),
    sectionTitle('Lichess opening explorer'),
    h('div.list', h('div.setting', { style: { display: 'block' } },
      h('div.setting-label', 'Personal API token'),
      h('div.setting-sub', { style: { margin: '4px 0 10px', lineHeight: '1.4' } }, 'Optional. Unlocks live Masters and club-player stats in the Explorer and smarter opponents in lessons. Create one at lichess.org → Preferences → API access tokens (no scopes needed). Stored only on this device.'),
      tokenInput(s.explorerToken),
    )),
    sectionTitle('Your data'),
    h('div.list',
      h('button.list-item', { onclick: () => doExport() }, h('div.li-icon', icon('download', 'c-green')), h('div.li-main', h('div.li-title', 'Export backup'), h('div.li-sub', 'Save a JSON file (e.g. to iCloud Drive)'))),
      h('label.list-item', { style: { cursor: 'pointer' } }, h('div.li-icon', icon('upload', 'c-blue')), h('div.li-main', h('div.li-title', 'Import backup'), h('div.li-sub', 'Replaces all current progress')),
        h('input', { type: 'file', accept: 'application/json,.json', style: { display: 'none' }, onchange: (e: Event) => doImport(e) })),
    ),
    h('div.muted', { style: { fontSize: '12px', padding: '4px 20px 24px', lineHeight: '1.5' } },
      'iOS may clear website data for home-screen apps that go unused for a while. Export a backup regularly. ',
      'Puzzles and opening names from the Lichess open database (CC0). Engine: Stockfish (GPLv3). Board: chessground (GPLv3).'),
  );
}

function toggle(label: string, sub: string, key: 'sound' | 'haptics' | 'coords' | 'showDests' | 'autoQueen'): HTMLElement {
  const input = h('input', { type: 'checkbox', checked: settings()[key], onchange: (e: Event) => updateSettings({ [key]: (e.target as HTMLInputElement).checked }) });
  return h('div.setting', h('div', h('div.setting-label', label), h('div.setting-sub', sub)), h('label.toggle', input, h('span')));
}

function segRow(label: string, options: string[], value: string, onChange: (v: string) => void, labels: Record<string, string>): HTMLElement {
  const seg = h('div.segmented', { style: { width: '190px' } });
  for (const o of options) {
    const b = h(`button${o === value ? '.on' : ''}`, {
      onclick: () => {
        seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
        onChange(o);
      },
    }, labels[o] || o);
    seg.append(b);
  }
  return h('div.setting', h('div.setting-label', label), seg);
}

function tokenInput(value: string): HTMLElement {
  const input = h('input', { type: 'password', value, placeholder: 'lip_…', autocomplete: 'off', spellcheck: 'false' }) as HTMLInputElement;
  const btn = h('button.btn.green.small', {
    onclick: async () => {
      const token = input.value.trim();
      updateSettings({ explorerToken: token });
      if (!token) return toast('Token removed');
      try {
        const r = await fetch('https://explorer.lichess.ovh/masters?fen=rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR%20w%20KQkq%20-%200%201&moves=1&topGames=0', { headers: { Authorization: `Bearer ${token}` } });
        toast(r.ok ? 'Connected to Lichess explorer' : `Lichess rejected the token (${r.status})`, r.ok ? 'ok' : 'bad');
      } catch {
        toast('Saved. Could not reach Lichess right now.');
      }
    },
  }, 'Save');
  return h('div', { style: { display: 'flex', gap: '8px' } }, input, btn);
}

async function doExport() {
  const json = await exportAll();
  const name = `chess-trainer-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([json], name, { type: 'application/json' });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: 'Chess Trainer backup' });
      return;
    } catch {
      /* user cancelled share; fall back to download */
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup exported', 'ok');
}

async function doImport(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  if (!(await confirmSheet('Import backup?', 'This replaces all your current progress, ratings and repertoire.', 'Import'))) return;
  try {
    await importAll(await file.text());
    invalidateProfile();
    toast('Backup restored', 'ok');
    setTimeout(() => location.reload(), 600);
  } catch (err) {
    toast((err as Error).message || 'Import failed', 'bad');
  }
}
