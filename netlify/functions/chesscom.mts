// Fetches a Chess.com game by id and returns its moves as UCI.
// Chess.com's game endpoint has no CORS headers, so the app can't call it from the browser.

const TCN = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=';
const PIECES = 'qnrbkp';

// Chess.com tags ordinary games with SetUp "1" and the normal starting FEN, so only a different FEN counts as custom.
const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq -';

function isStandardStart(fen: string): boolean {
  return fen.trim().split(/\s+/).slice(0, 4).join(' ') === START;
}

function square(i: number): string {
  return 'abcdefgh'[i % 8] + (Math.floor(i / 8) + 1);
}

// Chess.com stores moves in "TCN": two characters per move.
function decodeTcn(s: string): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < s.length; i += 2) {
    const from = TCN.indexOf(s[i]);
    let to = TCN.indexOf(s[i + 1]);
    let promo = '';
    if (to > 63) {
      promo = PIECES[Math.floor((to - 64) / 3)];
      to = from + (from < 16 ? -8 : 8) + ((to - 1) % 3) - 1;
    }
    out.push(square(from) + square(to) + promo);
  }
  return out;
}

async function fetchGame(kind: string, id: string) {
  const res = await fetch(`https://www.chess.com/callback/${kind}/game/${id}`, {
    headers: { 'User-Agent': 'Mozilla/5.0 (chess-trainer review import)', Accept: 'application/json' },
  });
  if (!res.ok) return null;
  const data = await res.json();
  return data?.game?.moveList ? data.game : null;
}

export default async (req: Request) => {
  const url = new URL(req.url);
  const id = url.searchParams.get('id') || '';
  const kind = url.searchParams.get('kind');
  if (!/^\d+$/.test(id)) return Response.json({ error: 'Invalid game id' }, { status: 400 });

  const kinds = kind === 'daily' ? ['daily', 'live'] : ['live', 'daily'];
  let game = null;
  for (const k of kinds) {
    try {
      game = await fetchGame(k, id);
    } catch {
      game = null;
    }
    if (game) break;
  }
  if (!game) return Response.json({ error: 'Game not found' }, { status: 404 });

  const headers = game.pgnHeaders || {};
  return Response.json(
    {
      white: headers.White || 'White',
      black: headers.Black || 'Black',
      result: headers.Result || '*',
      fen: headers.SetUp === '1' && headers.FEN && !isStandardStart(headers.FEN) ? headers.FEN : undefined,
      ucis: decodeTcn(game.moveList),
    },
    { headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
};

export const config = { path: '/api/chesscom' };
