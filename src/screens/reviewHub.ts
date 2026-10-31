import { Chess } from 'chess.js';
import { h, icon, sheet, toast } from '../ui/dom';
import { listItem, sectionTitle } from '../ui/layout';
import { navigate } from '../router';
import { reviewUrl, type Outcome } from '../review/analysis';
import type { ScreenCtx } from '../router';

interface ImportedGame {
  white: string;
  black: string;
  result: string;
  ucis: string[];
}

interface RecentReview extends ImportedGame {
  side: 'white' | 'black';
  at: number;
}

const NAME_KEY = 'ct-my-name';
const RECENT_KEY = 'ct-recent-reviews';

function recentReviews(): RecentReview[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveRecent(g: ImportedGame, side: 'white' | 'black') {
  const key = g.ucis.join(',');
  const list = recentReviews().filter((r) => r.ucis.join(',') !== key);
  list.unshift({ ...g, side, at: Date.now() });
  localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 10)));
}

function outcomeFor(result: string, side: 'white' | 'black'): Outcome | null {
  if (result === '1/2-1/2') return 'draw';
  if (result === '1-0') return side === 'white' ? 'win' : 'loss';
  if (result === '0-1') return side === 'black' ? 'win' : 'loss';
  return null;
}

function parsePgn(text: string): ImportedGame {
  const c = new Chess();
  c.loadPgn(text.trim());
  const hdr = c.getHeaders();
  if (hdr.SetUp === '1' || hdr.FEN) throw new Error('Games from a custom starting position can’t be reviewed yet.');
  const ucis = c.history({ verbose: true }).map((m) => m.from + m.to + (m.promotion || ''));
  if (!ucis.length) throw new Error('That PGN has no moves.');
  return { white: hdr.White || 'White', black: hdr.Black || 'Black', result: hdr.Result || '*', ucis };
}

async function fetchChessCom(kind: string | null, id: string): Promise<ImportedGame> {
  const res = await fetch(`/api/chesscom?id=${id}${kind ? `&kind=${kind}` : ''}`);
  const data = await res.json().catch(() => null);
  if (!res.ok || !data) throw new Error(data?.error === 'Game not found' ? 'Couldn’t find that Chess.com game.' : 'Couldn’t load that Chess.com game.');
  if (data.fen) throw new Error('Games from a custom starting position can’t be reviewed yet.');
  // Replay through chess.js so a bad decode fails here, not in the review.
  const c = new Chess();
  for (const u of data.ucis as string[]) c.move({ from: u.slice(0, 2), to: u.slice(2, 4), promotion: u[4] });
  return { white: data.white, black: data.black, result: data.result, ucis: data.ucis };
}

async function fetchLichess(id: string): Promise<ImportedGame> {
  const res = await fetch(`https://lichess.org/game/export/${id}?clocks=false&evals=false&literate=false`, { headers: { Accept: 'application/x-chess-pgn' } });
  if (!res.ok) throw new Error('Couldn’t find that Lichess game.');
  return parsePgn(await res.text());
}

function loadFromLink(raw: string): Promise<ImportedGame> {
  const text = raw.trim();
  const cc = text.match(/chess\.com\/(?:game\/(live|daily)\/|(live|daily)\/game\/|game\/)(\d+)/i);
  if (cc) return fetchChessCom((cc[1] || cc[2] || '').toLowerCase() || null, cc[3]);
  const li = text.match(/lichess\.org\/([a-zA-Z0-9]{8})/);
  if (li) return fetchLichess(li[1]);
  return Promise.reject(new Error('Paste a Chess.com or Lichess game link.'));
}

export function reviewHub({ root }: ScreenCtx) {
  const linkInput = h('input', { type: 'url', placeholder: 'https://www.chess.com/game/live/…', autocomplete: 'off', autocapitalize: 'off' }) as HTMLInputElement;
  const pgnInput = h('textarea.pgn-input', { rows: 5, placeholder: '[Event "Live Chess"]\n1. e4 e5 2. Nf3 …', spellcheck: false }) as HTMLTextAreaElement;
  const fileInput = h('input', { type: 'file', accept: '.pgn,.txt,text/plain,application/x-chess-pgn', style: { display: 'none' } }) as HTMLInputElement;

  const linkBtn = h('button.btn.green', { onclick: () => void fromLink() }, 'Review game');
  const pgnBtn = h('button.btn.green', { onclick: () => fromPgn(pgnInput.value) }, 'Review PGN');

  fileInput.addEventListener('change', async () => {
    const f = fileInput.files?.[0];
    fileInput.value = '';
    if (!f) return;
    const text = await f.text();
    pgnInput.value = text;
    fromPgn(text);
  });

  async function fromLink() {
    if (!linkInput.value.trim()) return toast('Paste a game link first');
    linkBtn.setAttribute('disabled', '');
    linkBtn.textContent = 'Loading…';
    try {
      chooseSide(await loadFromLink(linkInput.value));
    } catch (e) {
      toast((e as Error).message || 'Couldn’t load that game', 'bad');
    } finally {
      linkBtn.removeAttribute('disabled');
      linkBtn.textContent = 'Review game';
    }
  }

  function fromPgn(text: string) {
    if (!text.trim()) return toast('Paste or upload a PGN first');
    try {
      chooseSide(parsePgn(text));
    } catch (e) {
      const msg = (e as Error).message;
      toast(msg && !msg.startsWith('Invalid') && !msg.includes('move') ? msg : 'That PGN couldn’t be read', 'bad');
    }
  }

  function start(g: ImportedGame, side: 'white' | 'black') {
    localStorage.setItem(NAME_KEY, side === 'white' ? g.white : g.black);
    saveRecent(g, side);
    const opp = side === 'white' ? g.black : g.white;
    navigate(`${reviewUrl(g.ucis, side, opp, outcomeFor(g.result, side))}&back=reviews`);
  }

  // Review from the player's side; remember their username so the next import skips this step.
  function chooseSide(g: ImportedGame) {
    const me = (localStorage.getItem(NAME_KEY) || '').toLowerCase();
    if (me && g.white.toLowerCase() === me) return start(g, 'white');
    if (me && g.black.toLowerCase() === me) return start(g, 'black');
    const pick = (side: 'white' | 'black') => {
      s.close();
      start(g, side);
    };
    const s = sheet(
      'Which side were you?',
      h('div.sheet-body',
        h('div.side-pick',
          h('button.side-btn', { onclick: () => pick('white') }, h('span.side-box.white'), h('span', g.white)),
          h('button.side-btn', { onclick: () => pick('black') }, h('span.side-box.black'), h('span', g.black)),
        ),
      ),
    );
  }

  const recent = recentReviews();
  root.append(
    h('div.page-title', h('span', 'Game Review')),
    h('div.card.import-card',
      h('div.import-title', icon('search', 'c-green'), 'Chess.com or Lichess link'),
      linkInput,
      linkBtn,
    ),
    h('div.card.import-card',
      h('div.import-title', icon('upload', 'c-blue'), 'PGN'),
      pgnInput,
      h('div.btn-row',
        h('button.btn.gray', { onclick: () => fileInput.click() }, icon('upload'), 'Upload file'),
        pgnBtn,
      ),
      fileInput,
    ),
    ...(!recent.length ? [] : [
          sectionTitle('Recent reviews'),
          h('div.list', ...recent.map((r) => {
            const opp = r.side === 'white' ? r.black : r.white;
            const outcome = outcomeFor(r.result, r.side);
            return listItem({
              title: `vs ${opp}`,
              sub: `${outcome === 'win' ? 'Won' : outcome === 'loss' ? 'Lost' : outcome === 'draw' ? 'Draw' : 'Unfinished'} · ${Math.ceil(r.ucis.length / 2)} moves · ${new Date(r.at).toLocaleDateString()}`,
              icon: h(`span.side-box.${r.side}`),
              onclick: () => start(r, r.side),
            });
          })),
        ]),
    sectionTitle('Tools'),
    h('div.list',
      listItem({ title: 'Analysis Board', sub: 'Set up any position and ask Stockfish', icon: icon('analyze', 'c-blue'), onclick: () => navigate('analyze') }),
    ),
  );
}
