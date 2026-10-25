import { h } from '../ui/dom';
import { fmtScore, winChance, type EngineLine } from './stockfish';

export class EvalBar {
  readonly el: HTMLElement;
  private fill: HTMLElement;
  private label: HTMLElement;
  private flipped = false;

  constructor() {
    this.fill = h('div.eval-fill');
    this.label = h('div.eval-label', '0.0');
    this.el = h('div.eval-bar', this.fill, this.label);
  }

  setFlipped(black: boolean): void {
    this.flipped = black;
    this.el.classList.toggle('flipped', black);
  }

  update(line: Pick<EngineLine, 'cp' | 'mate'> | undefined): void {
    const w = winChance(line);
    this.fill.style.height = `${w * 100}%`;
    this.label.textContent = fmtScore(line).replace('+', '');
    const whiteAhead = w >= 0.5;
    this.label.classList.toggle('on-white', whiteAhead);
    this.label.classList.toggle('at-bottom', whiteAhead !== this.flipped);
  }
}
