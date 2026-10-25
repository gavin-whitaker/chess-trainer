import { h, icon, ICONS } from './dom';
import { goBack } from '../router';

export function header(title: string, opts: { back?: string; actions?: HTMLElement[]; sub?: string } = {}): HTMLElement {
  return h(
    'header.top',
    opts.back !== undefined ? h('button.icon-btn', { onclick: () => goBack(opts.back!), 'aria-label': 'Back' }, icon('back')) : h('div.icon-spacer'),
    h('div.top-title', h('div', title), opts.sub ? h('div.top-sub', opts.sub) : null),
    h('div.top-actions', ...(opts.actions || [])),
  );
}

export function actionBar(...buttons: HTMLElement[]): HTMLElement {
  return h('div.action-bar', ...buttons);
}

export function actionBtn(name: keyof typeof ICONS, label: string, onclick: () => void, cls = ''): HTMLElement {
  return h(`button.action${cls ? '.' + cls : ''}`, { onclick }, icon(name), h('span', label));
}

export function card(...children: (HTMLElement | string | null)[]): HTMLElement {
  return h('div.card', ...children);
}

export function sectionTitle(text: string): HTMLElement {
  return h('div.section-title', text);
}

export function listItem(opts: { icon?: HTMLElement; title: string; sub?: string; right?: HTMLElement | string; onclick?: () => void; cls?: string }): HTMLElement {
  return h(
    `button.list-item${opts.cls ? '.' + opts.cls : ''}`,
    { onclick: opts.onclick },
    opts.icon ? h('div.li-icon', opts.icon) : null,
    h('div.li-main', h('div.li-title', opts.title), opts.sub ? h('div.li-sub', opts.sub) : null),
    opts.right !== undefined ? h('div.li-right', opts.right) : h('div.li-chev', icon('next')),
  );
}

// Standard full-screen board page: header, optional strip, board (+ eval bar), scrollable panel, action bar.
export function boardLayout(root: HTMLElement, opts: { header: HTMLElement; board: HTMLElement; above?: HTMLElement; evalBar?: HTMLElement }): { under: HTMLElement; bar: HTMLElement } {
  const under = h('div.under-board');
  const bar = h('div.action-bar');
  root.append(
    h('div.board-screen', opts.header, opts.above || null, h('div.board-area', opts.evalBar || null, opts.board), under, bar),
  );
  return { under, bar };
}

// Status line above/below the board, Chess.com style ("White to move", "Correct!", ...).
export class StatusPanel {
  readonly el: HTMLElement;
  private dot: HTMLElement;
  private text: HTMLElement;
  private sub: HTMLElement;
  constructor() {
    this.dot = h('div.status-dot');
    this.text = h('div.status-text');
    this.sub = h('div.status-sub');
    this.el = h('div.status-panel', this.dot, h('div.status-body', this.text, this.sub));
  }
  set(text: string, kind: 'white' | 'black' | 'ok' | 'bad' | 'info' = 'info', sub = ''): void {
    this.el.className = `status-panel ${kind}`;
    this.text.textContent = text;
    this.sub.textContent = sub;
    this.el.classList.remove('pop');
    void this.el.offsetWidth;
    this.el.classList.add('pop');
  }
}
