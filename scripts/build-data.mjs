// Builds the offline data bundled with Chess Trainer.
//
//   node scripts/build-data.mjs
//
// Inputs (downloaded into .cache/ if missing):
//   - Lichess puzzle database (CC0): https://database.lichess.org/lichess_db_puzzle.csv.zst
//   - Lichess opening names (CC0):   https://github.com/lichess-org/chess-openings (a-e.tsv)
//
// Outputs:
//   public/data/puzzles/index.json          bands, theme counts, totals
//   public/data/puzzles/r0600.json ...      one shard per 100-point rating band
//   public/data/puzzles/t-<theme>.json      per-theme sets spread across ratings
//   public/data/openings.json               named lines + position book keyed by EPD

import { spawn, execSync } from 'node:child_process';
import { createInterface } from 'node:readline';
import { existsSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { Chess } from 'chess.js';

const CACHE = '.cache';
const OUT = 'public/data';
const PUZZLE_URL = 'https://database.lichess.org/lichess_db_puzzle.csv.zst';
const OPENINGS_URL = 'https://raw.githubusercontent.com/lichess-org/chess-openings/master';

const MIN_RATING = 601; // anything 600 and below is excluded
const PER_BAND = 4500;
const PER_THEME = 600;
const MIN_POPULARITY = 85;
const MIN_PLAYS = 300;
const MAX_RD = 90;

// Themes that describe the game phase/length rather than a tactic are not offered as drill sets.
const SKIP_THEME_SETS = new Set(['short', 'long', 'veryLong', 'oneMove', 'master', 'masterVsMaster', 'superGM', 'crushing', 'advantage', 'equality']);

mkdirSync(CACHE, { recursive: true });
mkdirSync(`${OUT}/puzzles`, { recursive: true });

function download(url, dest) {
  if (existsSync(dest)) return;
  console.log(`downloading ${url}`);
  execSync(`curl -sSL -o "${dest}" "${url}"`, { stdio: 'inherit' });
}

function bandOf(rating) {
  // Very few puzzles above 2800 pass the quality filters, so they share the top band.
  return Math.min(Math.floor(rating / 100) * 100, 2800);
}

function bandKey(band) {
  return `r${String(band).padStart(4, '0')}`;
}

// Reservoir sampling keeps a uniform sample without holding millions of rows in memory.
class Reservoir {
  constructor(size) {
    this.size = size;
    this.items = [];
    this.seen = 0;
  }
  add(item) {
    this.seen++;
    if (this.items.length < this.size) this.items.push(item);
    else {
      const j = Math.floor(Math.random() * this.seen);
      if (j < this.size) this.items[j] = item;
    }
  }
}

async function buildPuzzles() {
  const zst = `${CACHE}/puzzles.csv.zst`;
  download(PUZZLE_URL, zst);

  const bands = new Map();
  const themes = new Map();
  const themeCounts = {};
  let total = 0;
  let kept = 0;

  const proc = spawn('zstd', ['-dc', zst]);
  const rl = createInterface({ input: proc.stdout, crlfDelay: Infinity });
  let header = true;
  for await (const line of rl) {
    if (header) {
      header = false;
      continue;
    }
    total++;
    const [id, fen, moves, ratingS, rdS, popS, playsS, themeStr, , openingTags] = line.split(',');
    const rating = +ratingS;
    if (rating < MIN_RATING || +popS < MIN_POPULARITY || +playsS < MIN_PLAYS || +rdS > MAX_RD) continue;
    kept++;
    const row = [id, fen, moves, rating, themeStr, openingTags || ''];
    const band = bandOf(rating);
    if (!bands.has(band)) bands.set(band, new Reservoir(PER_BAND));
    bands.get(band).add(row);
    for (const t of themeStr.split(' ')) {
      if (!t || SKIP_THEME_SETS.has(t)) continue;
      themeCounts[t] = (themeCounts[t] || 0) + 1;
      if (!themes.has(t)) themes.set(t, new Reservoir(PER_THEME * 4));
      themes.get(t).add(row);
    }
    if (total % 500000 === 0) console.log(`  scanned ${total.toLocaleString()} puzzles, ${kept.toLocaleString()} pass filters`);
  }

  for (const f of execSync(`ls ${OUT}/puzzles`).toString().split('\n').filter(Boolean)) rmSync(`${OUT}/puzzles/${f}`);

  const index = { generated: new Date().toISOString(), minRating: MIN_RATING, bands: [], themes: [], total: 0 };
  for (const band of [...bands.keys()].sort((a, b) => a - b)) {
    const rows = bands.get(band).items.sort((a, b) => a[3] - b[3]);
    writeFileSync(`${OUT}/puzzles/${bandKey(band)}.json`, JSON.stringify(rows));
    index.bands.push({ band, key: bandKey(band), count: rows.length });
    index.total += rows.length;
  }

  for (const [theme, res] of themes) {
    if (res.items.length < 40) continue;
    // Spread each theme set evenly across ratings so it works for every level.
    const sorted = res.items.sort((a, b) => a[3] - b[3]);
    const step = Math.max(1, sorted.length / PER_THEME);
    const picked = [];
    for (let i = 0; i < sorted.length && picked.length < PER_THEME; i += step) picked.push(sorted[Math.floor(i)]);
    writeFileSync(`${OUT}/puzzles/t-${theme}.json`, JSON.stringify(picked));
    index.themes.push({ theme, count: picked.length, available: themeCounts[theme] });
  }
  index.themes.sort((a, b) => b.available - a.available);
  writeFileSync(`${OUT}/puzzles/index.json`, JSON.stringify(index));
  console.log(`puzzles: scanned ${total.toLocaleString()}, eligible ${kept.toLocaleString()}, bundled ${index.total.toLocaleString()} in ${index.bands.length} bands + ${index.themes.length} theme sets`);
}

function epd(fen) {
  return fen.split(' ').slice(0, 4).join(' ');
}

function buildOpenings() {
  const lines = [];
  for (const f of ['a', 'b', 'c', 'd', 'e']) {
    const dest = `${CACHE}/${f}.tsv`;
    download(`${OPENINGS_URL}/${f}.tsv`, dest);
    const rows = readFileSync(dest, 'utf8').trim().split('\n').slice(1);
    for (const r of rows) {
      const [eco, name, pgn] = r.split('\t');
      const sans = pgn.replace(/\d+\.(\.\.)?/g, ' ').trim().split(/\s+/);
      lines.push({ eco, name, sans });
    }
  }

  // pos[epd] = [lineIndex of the named opening at this position or -1, "uci:weight ..." book continuations,
  // weight = number of named lines passing through the move, most common first]
  const named = new Map();
  const next = new Map();
  const outLines = [];
  for (const line of lines) {
    const chess = new Chess();
    const ucis = [];
    let ok = true;
    for (const san of line.sans) {
      const before = epd(chess.fen());
      let mv;
      try {
        mv = chess.move(san);
      } catch {
        ok = false;
        break;
      }
      const uci = mv.from + mv.to + (mv.promotion || '');
      ucis.push(uci);
      if (!next.has(before)) next.set(before, new Map());
      const counts = next.get(before);
      counts.set(uci, (counts.get(uci) || 0) + 1);
    }
    if (!ok) continue;
    const idx = outLines.length;
    outLines.push([line.eco, line.name, ucis.join(' '), line.sans.join(' ')]);
    const key = epd(chess.fen());
    // Keep the shortest line name for a position reached by transposition.
    if (!named.has(key) || outLines[named.get(key)][2].length > ucis.join(' ').length) named.set(key, idx);
  }

  const pos = {};
  for (const key of new Set([...named.keys(), ...next.keys()])) {
    const moves = next.has(key) ? [...next.get(key)].sort((a, b) => b[1] - a[1]).map(([u, c]) => `${u}:${c}`) : [];
    pos[key] = [named.has(key) ? named.get(key) : -1, moves.join(' ')];
  }
  writeFileSync(`${OUT}/openings.json`, JSON.stringify({ lines: outLines, pos }));
  console.log(`openings: ${outLines.length} named lines, ${Object.keys(pos).length} book positions`);
}

buildOpenings();
await buildPuzzles();
