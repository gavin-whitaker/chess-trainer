// Glicko-2 for a single game (user vs puzzle), as used by puzzle trainers.
export interface GlickoRating {
  rating: number;
  rd: number;
  vol: number;
}

const SCALE = 173.7178;
const TAU = 0.5;

export function glickoUpdate(player: GlickoRating, opponentRating: number, opponentRd: number, score: 0 | 1): GlickoRating {
  const mu = (player.rating - 1500) / SCALE;
  const phi = player.rd / SCALE;
  const muJ = (opponentRating - 1500) / SCALE;
  const phiJ = opponentRd / SCALE;
  const g = 1 / Math.sqrt(1 + (3 * phiJ * phiJ) / (Math.PI * Math.PI));
  const E = 1 / (1 + Math.exp(-g * (mu - muJ)));
  const v = 1 / (g * g * E * (1 - E));
  const delta = v * g * (score - E);

  const a = Math.log(player.vol * player.vol);
  const f = (x: number) => {
    const ex = Math.exp(x);
    return (ex * (delta * delta - phi * phi - v - ex)) / (2 * Math.pow(phi * phi + v + ex, 2)) - (x - a) / (TAU * TAU);
  };
  let A = a;
  let B: number;
  if (delta * delta > phi * phi + v) B = Math.log(delta * delta - phi * phi - v);
  else {
    let k = 1;
    while (f(a - k * TAU) < 0) k++;
    B = a - k * TAU;
  }
  let fA = f(A);
  let fB = f(B);
  for (let i = 0; i < 100 && Math.abs(B - A) > 1e-6; i++) {
    const C = A + ((A - B) * fA) / (fB - fA);
    const fC = f(C);
    if (fC * fB <= 0) {
      A = B;
      fA = fB;
    } else fA /= 2;
    B = C;
    fB = fC;
  }
  const vol = Math.exp(A / 2);
  const phiStar = Math.sqrt(phi * phi + vol * vol);
  const newPhi = 1 / Math.sqrt(1 / (phiStar * phiStar) + 1 / v);
  const newMu = mu + newPhi * newPhi * g * (score - E);
  return {
    rating: Math.max(400, Math.round(newMu * SCALE + 1500)),
    rd: Math.max(45, Math.min(350, newPhi * SCALE)),
    vol: Math.min(0.1, vol),
  };
}
