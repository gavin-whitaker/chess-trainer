import { h } from '../ui/dom';
import { DEPTHS, estimateLabel, reviewDepth, setReviewDepth } from './analysis';

// Compact "Depth" dropdown; each option shows a rough iPhone time for a game of this length.
export function depthSelect(positions: number, onChange: (depth: number) => void, current = reviewDepth()): HTMLElement {
  const select = h('select.depth-select', {
    'aria-label': 'Analysis depth',
    onchange: () => {
      const d = Number(select.value);
      setReviewDepth(d);
      onChange(d);
    },
  }, ...DEPTHS.map((d) => h('option', { value: String(d), selected: d === current }, `Depth ${d}${d === 14 ? ' (default)' : ''} · ${estimateLabel(d, positions)}`))) as HTMLSelectElement;
  return h('label.depth-row', h('span', 'Analysis depth', h('small', ' · time on iPhone')), select);
}
