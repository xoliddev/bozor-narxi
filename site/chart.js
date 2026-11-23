// The price-change chart, drawn as SVG in code: the city median as a thick line, the band between the cheapest and the
// dearest bazaar, any bazaars the reader switched on as thin coloured lines, a marker on today's price, and a tooltip
// that follows the finger or the mouse.
import { civil } from '../shared/clock.js';
import { group } from '../shared/i18n.js';
import { COLORS, fill, h, s } from './util.js';

const W = 640;
const H = 250;
const PAD = { l: 54, r: 16, t: 16, b: 28 };
const STEPS = [100, 200, 250, 500, 1000, 2000, 2500, 5000, 10_000, 20_000, 25_000, 50_000];

function niceTicks(lo, hi) {
  const step = STEPS.find((x) => (hi - lo) / x <= 5) ?? 100_000;
  const out = [];
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v);
  return out;
}

const pathOf = (pts) => pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('');

/** `series`: [{day, city, lo, hi, by}], `sel`: bazaar ids to draw, `P`: plain texts, `money`: formatter. */
export function chart({ series, first, last, sel, P, lang, money, bname }) {
  const box = h('div', { class: 'chart', 'data-testid': 'chart' });
  if (!series.length) return box;
  const vals = series.flatMap((x) => [x.lo, x.hi, ...sel.map((b) => x.by[b]).filter(Boolean)]);
  let lo = Math.min(...vals);
  let hi = Math.max(...vals);
  const pad = Math.max(100, Math.round((hi - lo) * 0.12));
  lo = Math.max(0, lo - pad);
  hi += pad;
  const X = (day) => PAD.l + ((day - first) / Math.max(1, last - first)) * (W - PAD.l - PAD.r);
  const Y = (v) => PAD.t + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - PAD.t - PAD.b);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'chart-svg', role: 'img', 'aria-label': P('site.chart') });
  for (const v of niceTicks(lo, hi)) {
    svg.append(s('line', { x1: PAD.l, x2: W - PAD.r, y1: Y(v), y2: Y(v), class: 'grid' }),
      s('text', { x: PAD.l - 8, y: Y(v) + 4, class: 'ylab', 'text-anchor': 'end' }, group(v)));
  }
  const span = last - first;
  const every = span > 60 ? 21 : span > 20 ? 7 : 2;
  for (let d = last; d >= first; d -= every) {
    const [, m, dd] = civil(d);
    svg.append(s('text', { x: X(d), y: H - 8, class: 'xlab', 'text-anchor': 'middle' }, `${dd} ${P(`mon.${m}`)}`));
  }
  const band = [...series.map((x) => [X(x.day), Y(x.hi)]), ...[...series].reverse().map((x) => [X(x.day), Y(x.lo)])];
  svg.append(s('path', { d: `${pathOf(band)}Z`, class: 'band' }));
  for (const b of sel) {
    const pts = series.filter((x) => x.by[b]).map((x) => [X(x.day), Y(x.by[b])]);
    if (pts.length) svg.append(s('path', { d: pathOf(pts), class: 'bline', stroke: COLORS[b] ?? '#555', 'data-bazaar': b }));
  }
  const city = series.map((x) => [X(x.day), Y(x.city)]);
  svg.append(s('path', { d: pathOf(city), class: 'cline' }));
  const end = series[series.length - 1];
  svg.append(s('circle', { cx: X(end.day), cy: Y(end.city), r: 4.5, class: 'cdot' }));
  for (const b of sel) {
    if (end.by[b]) svg.append(s('circle', { cx: X(end.day), cy: Y(end.by[b]), r: 4, fill: COLORS[b] ?? '#555', class: 'bdot', 'data-testid': `dot-${b}` }));
  }
  const rule = s('line', { y1: PAD.t, y2: H - PAD.b, class: 'rule', visibility: 'hidden' });
  const tip = h('div', { class: 'chart-tip', hidden: true });
  const hit = s('rect', { x: PAD.l, y: PAD.t, width: W - PAD.l - PAD.r, height: H - PAD.t - PAD.b, fill: 'transparent' });
  const near = (evt) => {
    const r = svg.getBoundingClientRect();
    const x = ((evt.clientX - r.left) / r.width) * W;
    return series.reduce((a, p) => (Math.abs(X(p.day) - x) < Math.abs(X(a.day) - x) ? p : a), series[0]);
  };
  hit.addEventListener('pointermove', (evt) => {
    const p = near(evt);
    rule.setAttribute('x1', X(p.day));
    rule.setAttribute('x2', X(p.day));
    rule.setAttribute('visibility', 'visible');
    const [, m, dd] = civil(p.day);
    const extra = sel.filter((b) => p.by[b]).map((b) => `${bname(b)}: ${money(p.by[b])}`);
    fill(tip, h('b', {}, `${dd}-${P(`month.${m}`)}`), h('span', {}, `${P('site.city_line')}: ${money(p.city)}`),
      h('span', { class: 'muted' }, `${money(p.lo)} – ${money(p.hi)}`), ...extra.map((x) => h('span', {}, x)));
    tip.hidden = false;
    tip.style.left = `${Math.min(70, Math.max(0, (X(p.day) / W) * 100 - 15))}%`;
  });
  hit.addEventListener('pointerleave', () => {
    rule.setAttribute('visibility', 'hidden');
    tip.hidden = true;
  });
  svg.append(rule, hit);
  box.append(svg, tip);
  box.dataset.lang = lang;
  box.dataset.last = String(end.city);
  return box;
}
