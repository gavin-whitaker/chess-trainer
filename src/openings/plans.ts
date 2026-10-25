// Short, practical plans shown at the end of a guided lesson.
const PLANS: Record<string, { white: string[]; black: string[] }> = {
  'Italian Game': {
    white: ['Build the c3 + d4 center, or play slowly with d3, a4 and Re1.', 'Aim pieces at f7: Bc4, Ng5 ideas, and a later Qb3.', 'Reroute the b1-knight via d2-f1-g3 to join a kingside attack.'],
    black: ['Mirror development with ...Bc5/...Nf6 and castle quickly.', 'Break with ...d5 when White plays slowly.', 'Watch f7: never leave it defended only by the king early.'],
  },
  'Ruy Lopez': {
    white: ['Keep pressure on e5 and prepare d4 with c3 and Re1.', 'Retreat the bishop to c2 and use the Nbd2-f1-g3 maneuver.', 'Play on the kingside once the center is fixed.'],
    black: ['Hold e5 solidly; ...a6 and ...b5 kick the bishop.', 'Typical breaks: ...d5 (Marshall-style) or ...c5 on the queenside.', 'Reroute pieces: ...Re8, ...Bf8, ...g6 for a solid setup.'],
  },
  'Sicilian Defense': {
    white: ['Open the center with d4 and use your lead in development.', 'Castle opposite sides and launch the kingside pawns (f4, g4).', 'Watch the d5 square: a knight landing there is often crushing.'],
    black: ['Use the half-open c-file: rooks to c8, pressure on c3.', 'Prepare the ...d5 break: when it works, you equalize.', 'Counterattack on the queenside with ...b5-b4 instead of passive defense.'],
  },
  'French Defense': {
    white: ['Gain space with e5 and attack on the kingside.', 'Support the d4-e5 chain with c3 and Nf3.', 'Look for the Bxh7+ "Greek gift" when Black castles early.'],
    black: ['Attack the base of White\'s chain with ...c5 and ...f6.', 'Pressure d4 with ...Nc6, ...Qb6 and ...Nf5.', 'Solve the c8-bishop: ...b6 and ...Ba6, or ...Bd7-e8-h5.'],
  },
  'Caro-Kann Defense': {
    white: ['Gain space with e5 (Advance) or develop fast (Classical).', 'Use the extra space to attack on the kingside.', 'Exchange Black\'s good light bishop when possible.'],
    black: ['Develop the light bishop outside the chain first (...Bf5/...Bg4).', 'Then ...e6, ...Nd7, ...Ngf6 and a solid castle.', 'Strike with ...c5 to challenge the center.'],
  },
  "Queen's Gambit Declined": {
    white: ['Pressure d5 with Bg5, Nc3 and cxd5.', 'Plan the minority attack: b4-b5 to create a weak c6 pawn.', 'Or build the center with e4 after f3.'],
    black: ['Keep the strong point on d5 and finish development.', 'Free your game with ...c5 or ...e5 at the right moment.', 'Activate the c8-bishop via ...b6/...Bb7 or after ...dxc4.'],
  },
  "Queen's Gambit Accepted": {
    white: ['Regain the c4 pawn with e3 and Bxc4.', 'Use the central majority: aim for e4 and d5.', 'Develop quickly and target the isolated pawn if Black plays ...c5.'],
    black: ['Don\'t hold the pawn: return it for quick development.', 'Strike with ...c5 and ...a6/...b5 for queenside space.', 'Blockade d5 if White gets an isolated d-pawn.'],
  },
  "Queen's Gambit": {
    white: ['Use c4 to undermine d5 and win the center.', 'Develop Nc3, Bg5/Bf4, e3, and castle.', 'If Black takes on c4, regain it calmly with e3 and Bxc4.'],
    black: ['Choose a structure: ...e6 (Declined), ...c6 (Slav), or ...dxc4.', 'Keep the d5 strongpoint until development is done.', 'Break with ...c5 or ...e5 to free your pieces.'],
  },
  'Slav Defense': {
    white: ['Fight for e4 with Nc3, Qc2 or f3.', 'If Black takes c4, regain with a4 and e3.', 'Keep the bind on the center and play against the light squares.'],
    black: ['Develop the c8-bishop outside before ...e6.', 'Hold d5 with ...c6 and take on c4 if it wins time.', 'Free your game with ...c5 or ...e5 later.'],
  },
  'London System': {
    white: ['Same setup every time: d4, Bf4, e3, Nf3, c3, Nbd2, Bd3.', 'Plant a knight on e5 and push for a kingside attack (h4, Qf3).', 'If Black plays ...c5, keep the pawn chain and recapture toward the center.'],
    black: ['Hit b2 and d4 early with ...c5 and ...Qb6.', 'Trade off White\'s dark bishop with ...Nh5 or ...Bd6.', 'Aim for ...e5 to break the bind.'],
  },
  "King's Indian Defense": {
    white: ['Take the big center (c4, d4, e4) and expand on the queenside (c5, b4).', 'Close the center with d5 and attack where you have space.', 'Never ignore Black\'s kingside pawn storm.'],
    black: ['Fianchetto, castle, then strike with ...e5 or ...c5.', 'After d5 closes the center, storm the kingside with ...f5-f4-g5.', 'Your g7-bishop becomes a monster once the long diagonal opens.'],
  },
  'Scandinavian Defense': {
    white: ['Gain time hitting the queen with Nc3 and d4.', 'Develop fast and castle; use the extra central control.', 'Aim for d5 or a kingside attack while Black develops.'],
    black: ['Choose a safe square: ...Qa5 or ...Qd6 (or ...Qd8).', 'Develop ...c6, ...Bf5/...Bg4, ...e6 for a Caro-Kann-like setup.', 'Your structure is solid; play for equality and outplay later.'],
  },
  'English Opening': {
    white: ['Control d5 with c4, Nc3, g3 and Bg2.', 'Expand on the queenside with Rb1 and b4-b5.', 'Play like a reversed Sicilian with an extra tempo.'],
    black: ['Take the center with ...e5 or a symmetrical ...c5.', 'Fight for d4 and keep the g2-bishop blunted.', 'Look for ...d5 to equalize in the center.'],
  },
  'Scotch Game': {
    white: ['Open the center early with d4 and centralize your knight.', 'Develop quickly and target Black\'s weaknesses after exchanges.', 'In the main lines, e5 gains space and kicks the f6-knight.'],
    black: ['Hit the d4 knight with ...Bc5 or ...Nf6.', 'Accept doubled c-pawns for open lines and the bishop pair.', 'Break with ...d5 to free your position.'],
  },
  'Nimzo-Indian Defense': {
    white: ['Keep the bishop pair and open the position.', 'Build the center with f3 and e4.', 'Avoid doubled pawns with Qc2 or accept them for the center.'],
    black: ['Pin with ...Bb4 and fight for e4.', 'Trade on c3 to double White\'s pawns, then blockade.', 'Use ...c5, ...d6, ...e5 to keep the position closed for the knights.'],
  },
  'Vienna Game': {
    white: ['Prepare f4 to open the f-file.', 'Bc4 aims at f7; combine with Qh5 tricks.', 'Castle and pile up on the kingside.'],
    black: ['Strike in the center with ...d5 when possible.', 'Develop ...Nf6 and ...Bc5 actively.', 'Don\'t let White\'s f-file attack build up.'],
  },
  "King's Gambit": {
    white: ['Sacrifice f4 for a fast open f-file and center.', 'Develop Nf3, Bc4, castle, and aim everything at f7.', 'Regain the pawn on f4 when it is safe.'],
    black: ['Accept and hold the pawn with ...g5, or return it with ...d5.', 'Develop quickly and keep your king safe.', 'Counterattack the center instead of only defending.'],
  },
  'Pirc Defense': {
    white: ['Build a big center and attack with f4, or Be3/Qd2/h4.', 'Castle queenside for an opposite-wing race.', 'Push e5 when it disrupts Black\'s knights.'],
    black: ['Fianchetto and wait for the right moment to hit the center.', 'Break with ...e5 or ...c5.', 'Counterattack on the queenside if White castles long.'],
  },
  'Dutch Defense': {
    white: ['Fianchetto and play e4 to challenge the f5 pawn.', 'Exploit the e6 and e5 weaknesses.', 'Watch out for Black\'s kingside attack.'],
    black: ['Control e4 with ...f5 and ...Nf6.', 'Attack the kingside with ...Qe8-h5 (Stonewall/Leningrad ideas).', 'Keep your e6 pawn and dark squares covered.'],
  },
  'Grünfeld Defense': {
    white: ['Build the big center with e4 and Nc3; keep it supported.', 'Push d5 to cramp Black.', 'Defend d4 carefully: it is Black\'s main target.'],
    black: ['Let White take the center, then hit it with ...c5 and ...Bg7.', 'Pile on d4 with ...Nc6 and ...Qa5/...Rd8.', 'Your queenside majority often wins the endgame.'],
  },
  'Four Knights Game': {
    white: ['Develop symmetrically and prepare d4.', 'Bb5 pressure (Spanish Four Knights) on the e5 pawn.', 'Keep the game balanced and outplay your opponent later.'],
    black: ['Mirror with care: ...Bb4 and ...d6 are solid.', 'The Rubinstein ...Nd4 is an aggressive alternative.', 'Watch for d4-d5 ideas that kick your knight.'],
  },
  "Petrov's Defense": {
    white: ['Gain a small lead in development and keep the queens on.', 'Use the e-file and pressure on e5.', 'Aim for c4 to undermine Black\'s centralized knight.'],
    black: ['Counter-attack e4 instead of defending e5.', 'Don\'t copy White too long: ...d6 before ...Nxe4.', 'Equalize solidly and keep a symmetrical structure.'],
  },
  'Alekhine Defense': {
    white: ['Grab space with e5, c4 and d4, but don\'t overextend.', 'Keep the center supported with Nf3 and Be2.', 'Use your space to cramp Black\'s knights.'],
    black: ['Provoke White\'s pawns forward, then attack them.', 'Strike with ...d6 and ...c5.', 'Use the outposts left behind the advanced pawns.'],
  },
  'Catalan Opening': {
    white: ['Fianchetto the light bishop to pressure d5 and b7.', 'Regain c4 with Qa4 or Qc2.', 'Use the long diagonal for queenside pressure in the endgame.'],
    black: ['Take on c4 and try to hold with ...b5 or return it smartly.', 'Free your game with ...c5.', 'Neutralize the g2-bishop with ...Bb7 or ...Bd7-c6.'],
  },
};

export function plansFor(family: string, side: 'white' | 'black'): string[] {
  const key = Object.keys(PLANS).find((k) => family === k || family.startsWith(k));
  if (key) return PLANS[key][side];
  return side === 'white'
    ? ['Finish developing your minor pieces before moving any piece twice.', 'Castle and connect your rooks.', 'Put your rooks on open files and look for a central break.']
    : ['Develop with tempo and challenge White\'s center with a pawn break.', 'Castle quickly and keep your king safe.', 'Trade your worst piece and activate the rest.'];
}
