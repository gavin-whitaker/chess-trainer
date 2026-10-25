// Generates app icons: a white pawn on a Chess.com-green rounded tile.
import { PNG } from 'pngjs';
import { writeFileSync, mkdirSync } from 'node:fs';

mkdirSync('public/icons', { recursive: true });

function inPawn(x, y) {
  // Coordinates normalized to 0..1
  const head = (x - 0.5) ** 2 + (y - 0.3) ** 2 < 0.095 ** 2;
  const collar = y > 0.4 && y < 0.45 && Math.abs(x - 0.5) < 0.13;
  const t = (y - 0.43) / (0.72 - 0.43);
  const body = y >= 0.43 && y < 0.72 && Math.abs(x - 0.5) < 0.07 + t * 0.12;
  const base = y >= 0.7 && y < 0.8 && Math.abs(x - 0.5) < 0.24;
  return head || collar || body || base;
}

function render(size, rounded) {
  const png = new PNG({ width: size, height: size });
  const r = rounded ? size * 0.22 : 0;
  const ss = 3;
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      let cover = 0;
      let pawn = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const x = px + (sx + 0.5) / ss;
          const y = py + (sy + 0.5) / ss;
          const cx = Math.min(Math.max(x, r), size - r);
          const cy = Math.min(Math.max(y, r), size - r);
          if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) cover++;
          if (inPawn(x / size, y / size)) pawn++;
        }
      }
      const n = ss * ss;
      const p = pawn / n;
      const i = (py * size + px) * 4;
      png.data[i] = Math.round(0x81 * (1 - p) + 255 * p);
      png.data[i + 1] = Math.round(0xb6 * (1 - p) + 255 * p);
      png.data[i + 2] = Math.round(0x4c * (1 - p) + 255 * p);
      png.data[i + 3] = Math.round((cover / n) * 255);
    }
  }
  return PNG.sync.write(png);
}

writeFileSync('public/icons/icon-192.png', render(192, false));
writeFileSync('public/icons/icon-512.png', render(512, false));
writeFileSync('public/icons/apple-touch-icon-180.png', render(180, false));
writeFileSync('public/icons/favicon-64.png', render(64, true));
console.log('icons written');
