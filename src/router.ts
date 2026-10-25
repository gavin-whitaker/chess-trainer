export interface ScreenCtx {
  root: HTMLElement;
  params: URLSearchParams;
  path: string;
}

export type Cleanup = void | (() => void);
export type Screen = (ctx: ScreenCtx) => Cleanup | Promise<Cleanup>;

interface Route {
  screen: () => Promise<Screen>;
  tab: string;
  // Full-screen board views hide the bottom tab bar.
  full?: boolean;
}

const routes: Record<string, Route> = {};
let cleanup: Cleanup;
let renderId = 0;
let depth = 0;

export function route(path: string, r: Route): void {
  routes[path] = r;
}

export function navigate(path: string, opts: { replace?: boolean } = {}): void {
  const hash = '#/' + path.replace(/^\/+/, '');
  if (opts.replace) location.replace(hash);
  else location.hash = hash;
}

export function goBack(fallback: string): void {
  if (depth > 0 && history.length > 1) history.back();
  else navigate(fallback, { replace: true });
}

function parse(): { path: string; params: URLSearchParams } {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  return { path: path || 'home', params: new URLSearchParams(query || '') };
}

export function startRouter(view: HTMLElement, onTab: (tab: string, full: boolean) => void): void {
  let first = true;
  const render = async () => {
    const id = ++renderId;
    const { path, params } = parse();
    const r = routes[path] || routes['home'];
    if (typeof cleanup === 'function') cleanup();
    cleanup = undefined;
    if (!first) depth++;
    first = false;
    onTab(r.tab, !!r.full);
    const screen = await r.screen();
    if (id !== renderId) return;
    const root = document.createElement('div');
    root.className = 'screen' + (r.full ? ' full' : '');
    view.replaceChildren(root);
    view.scrollTop = 0;
    window.scrollTo(0, 0);
    const c = await screen({ root, params, path });
    if (id !== renderId) {
      if (typeof c === 'function') c();
      return;
    }
    cleanup = c;
  };
  window.addEventListener('hashchange', render);
  void render();
}
