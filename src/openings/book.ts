// Offline opening book built by scripts/build-data.mjs from lichess-org/chess-openings (CC0).
export interface OpeningLine {
  idx: number;
  eco: string;
  name: string;
  family: string;
  variation: string;
  ucis: string[];
  sans: string[];
}

interface RawBook {
  lines: [eco: string, name: string, ucis: string, sans: string][];
  pos: Record<string, [lineIdx: number, next: string]>;
}

export interface Book {
  lines: OpeningLine[];
  families: Map<string, OpeningLine[]>;
  lookup(fen: string): { opening?: OpeningLine; next: BookMove[] };
}

export interface BookMove {
  uci: string;
  weight: number;
}

let bookP: Promise<Book> | null = null;

export function epd(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function loadBook(): Promise<Book> {
  if (!bookP) {
    bookP = fetch('/data/openings.json')
      .then((r) => r.json())
      .then((raw: RawBook) => {
        const lines: OpeningLine[] = raw.lines.map(([eco, name, ucis, sans], idx) => {
          const [family, ...rest] = name.split(':');
          return { idx, eco, name, family: family.trim(), variation: rest.join(':').trim(), ucis: ucis.split(' '), sans: sans.split(' ') };
        });
        const families = new Map<string, OpeningLine[]>();
        for (const l of lines) {
          if (!families.has(l.family)) families.set(l.family, []);
          families.get(l.family)!.push(l);
        }
        for (const list of families.values()) list.sort((a, b) => a.ucis.length - b.ucis.length);
        return {
          lines,
          families,
          lookup(fen: string) {
            const e = raw.pos[epd(fen)];
            if (!e) return { next: [] };
            const next = e[1]
              ? e[1].split(' ').map((s) => {
                  const [uci, w] = s.split(':');
                  return { uci, weight: +w || 1 };
                })
              : [];
            return { opening: e[0] >= 0 ? lines[e[0]] : undefined, next };
          },
        };
      });
  }
  return bookP;
}

// Name of the deepest named position along a sequence of FENs.
export function nameAlong(book: Book, fens: string[]): OpeningLine | undefined {
  for (let i = fens.length - 1; i >= 0; i--) {
    const o = book.lookup(fens[i]).opening;
    if (o) return o;
  }
  return undefined;
}

// Who "owns" a line: an opening ending on White's move is White's system, otherwise Black's defense.
export function lineSide(line: OpeningLine): 'white' | 'black' {
  if (/Defen[cs]e|Counter|Gambit Declined|Gambit Accepted|Sicilian|French|Caro|Pirc|Modern|Alekhine|Scandinavian|Dutch|Benoni|Benko|Gr[uü]nfeld|Nimzo-Indian|Queen's Indian|King's Indian Defense|Bogo|Philidor|Petrov|Russian|Owen|Nimzowitsch/i.test(line.family)) return 'black';
  if (/Opening|Game|Attack|System|Gambit/i.test(line.family)) return 'white';
  return line.ucis.length % 2 === 1 ? 'white' : 'black';
}

// Curated popular openings shown on the Learn hub; matched by exact family name.
export const FEATURED: { family: string; side: 'white' | 'black'; blurb: string }[] = [
  { family: 'Italian Game', side: 'white', blurb: 'Fast development and pressure on f7' },
  { family: 'Ruy Lopez', side: 'white', blurb: 'The classic: pressure on e5 for the long game' },
  { family: "Queen's Gambit Declined", side: 'black', blurb: 'Rock-solid answer to 1.d4 2.c4' },
  { family: "Queen's Gambit Accepted", side: 'black', blurb: 'Take the pawn, free your pieces' },
  { family: 'Sicilian Defense', side: 'black', blurb: 'The sharpest fighting reply to 1.e4' },
  { family: 'French Defense', side: 'black', blurb: 'Solid pawn chain, counterattack in the center' },
  { family: 'Caro-Kann Defense', side: 'black', blurb: 'Safe structure with a good light-squared bishop' },
  { family: 'London System', side: 'white', blurb: 'Same setup every game, easy to learn' },
  { family: "King's Indian Defense", side: 'black', blurb: 'Let White take the center, then strike' },
  { family: 'Scandinavian Defense', side: 'black', blurb: 'Hit the e4 pawn immediately' },
  { family: 'English Opening', side: 'white', blurb: 'Flexible flank control with 1.c4' },
  { family: 'Scotch Game', side: 'white', blurb: 'Open the center early with d4' },
  { family: 'Slav Defense', side: 'black', blurb: 'Support d5 with c6 against the Queen’s Gambit' },
  { family: 'Nimzo-Indian Defense', side: 'black', blurb: 'Pin the knight and fight for e4' },
  { family: 'Vienna Game', side: 'white', blurb: 'Nc3 then f4: aggressive and tricky' },
  { family: "King's Gambit", side: 'white', blurb: 'Sacrifice a pawn for a romantic attack' },
  { family: 'Pirc Defense', side: 'black', blurb: 'Hypermodern: fianchetto and counterpunch' },
  { family: 'Dutch Defense', side: 'black', blurb: 'Grab e4 with f5 and attack the kingside' },
  { family: 'Grünfeld Defense', side: 'black', blurb: 'Give White the center, then destroy it' },
  { family: 'Four Knights Game', side: 'white', blurb: 'Symmetrical, principled development' },
  { family: 'Petrov\'s Defense', side: 'black', blurb: 'Mirror White and stay solid' },
  { family: 'Alekhine Defense', side: 'black', blurb: 'Provoke pawns forward, then undermine them' },
  { family: 'Catalan Opening', side: 'white', blurb: 'Queen’s Gambit with a fianchettoed bishop' },
  { family: 'Queen\'s Gambit', side: 'white', blurb: 'Offer the c-pawn to win the center' },
];
