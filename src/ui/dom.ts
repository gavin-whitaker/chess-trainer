type Child = Node | string | number | null | undefined | false | Child[];
type Attrs = Record<string, unknown> & { style?: string | Partial<CSSStyleDeclaration> };

// h('div.card.big', { onclick }, 'text', child)
export function h<K extends keyof HTMLElementTagNameMap>(sel: K | string, attrs?: Attrs | Child, ...children: Child[]): HTMLElement {
  const [tag, ...classes] = sel.split('.');
  const el = document.createElement(tag || 'div');
  if (classes.length) el.className = classes.join(' ');
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) {
    children.unshift(attrs as Child);
  } else if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'class') el.className += ' ' + v;
      else if (k === 'html') el.innerHTML = String(v);
      else if (k in el && typeof v !== 'string') (el as unknown as Record<string, unknown>)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  append(el, children);
  return el;
}

function append(el: HTMLElement, children: Child[]): void {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else el.append(c instanceof Node ? c : String(c));
  }
}

export function icon(name: keyof typeof ICONS, cls = ''): HTMLElement {
  const span = document.createElement('span');
  span.className = 'ic ' + cls;
  span.innerHTML = ICONS[name];
  return span;
}

const svg = (p: string, vb = '0 0 24 24') => `<svg viewBox="${vb}" fill="currentColor" aria-hidden="true">${p}</svg>`;

export const ICONS = {
  home: svg('<path d="M12 3 2 12h3v8h5v-5h4v5h5v-8h3z"/>'),
  puzzle: svg('<path d="M20.5 11H19V7a2 2 0 0 0-2-2h-4V3.5a2.5 2.5 0 0 0-5 0V5H4a2 2 0 0 0-2 2v3.8h1.5a2.7 2.7 0 0 1 0 5.4H2V20a2 2 0 0 0 2 2h3.8v-1.5a2.7 2.7 0 0 1 5.4 0V22H17a2 2 0 0 0 2-2v-4h1.5a2.5 2.5 0 0 0 0-5z"/>'),
  learn: svg('<path d="M12 3 1 9l11 6 9-4.9V17h2V9zM5 13.2v4L12 21l7-3.8v-4L12 17z"/>'),
  analyze: svg('<path d="M3 3h2v16h16v2H3zm4 12 4-5 3 3 5-7 1.6 1.2-6.4 9-3-3-2.6 3.2z"/>'),
  profile: svg('<path d="M12 12a5 5 0 1 0 0-10 5 5 0 0 0 0 10zm0 2c-5 0-9 2.5-9 5.5V22h18v-2.5C21 16.5 17 14 12 14z"/>'),
  back: svg('<path d="M15.4 4.6 14 3.2 5.2 12l8.8 8.8 1.4-1.4L8 12z"/>'),
  next: svg('<path d="M8.6 4.6 10 3.2l8.8 8.8-8.8 8.8-1.4-1.4L16 12z"/>'),
  first: svg('<path d="M6 4h2v16H6zm12.4.6L17 3.2 8.2 12l8.8 8.8 1.4-1.4L11 12z"/>'),
  last: svg('<path d="M16 4h2v16h-2zM5.6 4.6 7 3.2l8.8 8.8L7 20.8l-1.4-1.4L13 12z"/>'),
  flip: svg('<path d="M7 3 3 7h3v10h2V7h3zm10 18 4-4h-3V7h-2v10h-3z"/>'),
  hint: svg('<path d="M9 21h6v-1H9zm3-19a7 7 0 0 0-4 12.7V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.3A7 7 0 0 0 12 2z"/>'),
  retry: svg('<path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/>'),
  check: svg('<path d="M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"/>'),
  close: svg('<path d="M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z"/>'),
  bolt: svg('<path d="M7 2v11h3v9l7-12h-4l4-8z"/>'),
  fire: svg('<path d="M13.5.7s.7 2.6.7 4.8c0 2-1.4 3.7-3.4 3.7S7.3 7.6 7.3 5.5l.1-.4A13 13 0 0 0 4 14a8 8 0 0 0 16 0c0-5.4-2.6-10.2-6.5-13.3zM11.7 19a3.3 3.3 0 0 1-3.3-3.3c0-1.7 1-2.9 2.9-3.2 1.9-.4 3.8-1.3 4.9-2.8.4 1.4.6 2.9.6 4.4a4.9 4.9 0 0 1-5 4.9z"/>'),
  book: svg('<path d="M18 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V4a2 2 0 0 0-2-2zM6 4h5v8l-2.5-1.5L6 12z"/>'),
  target: svg('<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8zm0-14a6 6 0 1 0 6 6 6 6 0 0 0-6-6zm0 10a4 4 0 1 1 4-4 4 4 0 0 1-4 4zm0-6a2 2 0 1 0 2 2 2 2 0 0 0-2-2z"/>'),
  repeat: svg('<path d="M7 7h10v3l4-4-4-4v3H5v6h2zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2z"/>'),
  settings: svg('<path d="M19.1 12.9a7 7 0 0 0 0-1.8l2.1-1.6-2-3.4-2.4 1a7 7 0 0 0-1.6-.9L14.9 3h-4l-.3 2.6a7 7 0 0 0-1.6.9l-2.4-1-2 3.4 2.1 1.6a7 7 0 0 0 0 1.8l-2.1 1.6 2 3.4 2.4-1a7 7 0 0 0 1.6.9l.3 2.6h4l.3-2.6a7 7 0 0 0 1.6-.9l2.4 1 2-3.4zM12.9 15.5a3.5 3.5 0 1 1 3.5-3.5 3.5 3.5 0 0 1-3.5 3.5z"/>'),
  search: svg('<path d="M15.5 14h-.8l-.3-.3A6.5 6.5 0 1 0 14 15.5l.3.3v.8l5 5 1.5-1.5zm-6 0A4.5 4.5 0 1 1 14 9.5 4.5 4.5 0 0 1 9.5 14z"/>'),
  plus: svg('<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6z"/>'),
  trash: svg('<path d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6zM19 4h-3.5l-1-1h-5l-1 1H5v2h14z"/>'),
  engine: svg('<path d="M7 2h10v2h-2v2.1A7 7 0 0 1 19 13v3l2 2v2H3v-2l2-2v-3a7 7 0 0 1 4-6.9V4H7zm5 16a2 2 0 0 1-2 2h4a2 2 0 0 1-2-2z"/>'),
  trophy: svg('<path d="M19 4V2H5v2H2v3a4 4 0 0 0 4 4h.3A6 6 0 0 0 11 14.9V18H8v2h8v-2h-3v-3.1A6 6 0 0 0 17.7 11H18a4 4 0 0 0 4-4V4zM4 7V6h1v3a2 2 0 0 1-1-2zm16 0a2 2 0 0 1-1 2V6h1z"/>'),
  clock: svg('<path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm4.2 14.2L11 13V7h1.5v5.2l4.5 2.7z"/>'),
  heart: svg('<path d="m12 21.4-1.5-1.3C5.4 15.4 2 12.3 2 8.5A5.5 5.5 0 0 1 7.5 3 6 6 0 0 1 12 5.1 6 6 0 0 1 16.5 3 5.5 5.5 0 0 1 22 8.5c0 3.8-3.4 6.9-8.5 11.6z"/>'),
  star: svg('<path d="m12 17.3 6.2 3.7-1.6-7L22 9.2l-7.2-.6L12 2 9.2 8.6 2 9.2 7.4 14l-1.6 7z"/>'),
  more: svg('<path d="M6 10a2 2 0 1 0 2 2 2 2 0 0 0-2-2zm6 0a2 2 0 1 0 2 2 2 2 0 0 0-2-2zm6 0a2 2 0 1 0 2 2 2 2 0 0 0-2-2z"/>'),
  play: svg('<path d="M8 5v14l11-7z"/>'),
  dice: svg('<path d="M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2zM7.5 18A1.5 1.5 0 1 1 9 16.5 1.5 1.5 0 0 1 7.5 18zm0-9A1.5 1.5 0 1 1 9 7.5 1.5 1.5 0 0 1 7.5 9zm4.5 4.5a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5zm4.5 4.5a1.5 1.5 0 1 1 1.5-1.5 1.5 1.5 0 0 1-1.5 1.5zm0-9A1.5 1.5 0 1 1 18 7.5 1.5 1.5 0 0 1 16.5 9z"/>'),
  download: svg('<path d="M19 9h-4V3H9v6H5l7 7zM5 18v2h14v-2z"/>'),
  upload: svg('<path d="M9 16h6v-6h4l-7-7-7 7h4zm-4 2h14v2H5z"/>'),
};

export function clear(el: HTMLElement): void {
  el.replaceChildren();
}

export function toast(msg: string, kind: 'ok' | 'bad' | '' = ''): void {
  const t = h(`div.toast${kind ? '.' + kind : ''}`, msg);
  document.body.append(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => {
    t.classList.remove('show');
    setTimeout(() => t.remove(), 300);
  }, 2200);
}

// Bottom sheet modal, Chess.com style.
export function sheet(title: string, content: HTMLElement, opts: { onClose?: () => void } = {}): { close: () => void } {
  const backdrop = h('div.sheet-backdrop');
  const panel = h('div.sheet', h('div.sheet-grip'), title ? h('div.sheet-title', title) : null, content);
  const close = () => {
    backdrop.classList.remove('open');
    panel.classList.remove('open');
    setTimeout(() => {
      backdrop.remove();
      panel.remove();
    }, 250);
    opts.onClose?.();
  };
  backdrop.addEventListener('click', close);
  let startY = 0;
  let dy = 0;
  panel.addEventListener('touchstart', (e) => {
    if (panel.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    dy = 0;
  }, { passive: true });
  panel.addEventListener('touchmove', (e) => {
    if (!startY) return;
    dy = Math.max(0, e.touches[0].clientY - startY);
    panel.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  panel.addEventListener('touchend', () => {
    panel.style.transform = '';
    if (dy > 90) close();
    startY = 0;
  });
  document.body.append(backdrop, panel);
  requestAnimationFrame(() => {
    backdrop.classList.add('open');
    panel.classList.add('open');
  });
  return { close };
}

export function confirmSheet(title: string, message: string, okLabel = 'OK'): Promise<boolean> {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v: boolean) => {
      if (done) return;
      done = true;
      resolve(v);
      s.close();
    };
    const s = sheet(
      title,
      h('div.sheet-body', h('p.muted', message), h('div.btn-row', h('button.btn.gray', { onclick: () => finish(false) }, 'Cancel'), h('button.btn.green', { onclick: () => finish(true) }, okLabel))),
      { onClose: () => finish(false) },
    );
  });
}

export function fmtTime(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function shuffle<T>(arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
