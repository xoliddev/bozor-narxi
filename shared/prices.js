// JS port of bozornarxi/core/prices.py: a typed price, "qayerda arzon?", the chart's series, the weekly change, the
// digest and the bot's one-line chart.
import { InputError } from './text.js';
import { fdiv, level, median, rdiv, roundTo } from './trust.js';

const WORDS = /(so['‘’`]?m|сум|sum)\.?/giu;
const LEAD = /^[^0-9]*?\s(?=[0-9])/u;
const GROUPED = /^[0-9]{1,3}(?:[ .,'’][0-9]{3})+$/;
const PLAIN = /^[0-9]{1,9}$/;
export const FRESH_DAYS = 1;
export const MAX_REPORTS_PER_DAY = 40;

export function parsePrice(text) {
  if (typeof text !== 'string') throw new InputError('price_format');
  let s = text.trim().replace(WORDS, '').trim().replace(LEAD, '');
  if (GROUPED.test(s)) s = s.replace(/[^0-9]/g, '');
  if (!PLAIN.test(s)) throw new InputError('price_format');
  return Number(s);
}

export function checkPrice(product, value) {
  if (typeof value === 'boolean' || !(typeof value === 'string' || Number.isInteger(value))) throw new InputError('price_format');
  const n = typeof value === 'string' ? parsePrice(value) : value;
  if (n < product.min || n > product.max) throw new InputError('price_range');
  return n;
}

export const fresh = (cell, today) => cell != null && cell.day >= today - FRESH_DAYS;

export function rank(product, cells, bazaars, today) {
  const out = [];
  bazaars.forEach((b, i) => {
    const c = cells[b.id]?.[product];
    if (fresh(c, today)) out.push([c.price, i, { bazaar: b.id, ...c }]);
  });
  return out.sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((x) => x[2]);
}

export function cityMedian(prices) {
  const m = median(prices);
  return m === null ? null : roundTo(m, 100);
}

export const saving = (price, city) => ({ pct: rdiv((city - price) * 100, city), som: city - price });

export function whereCheap(product, cells, bazaars, today) {
  const ranked = rank(product, cells, bazaars, today);
  const city = cityMedian(ranked.map((r) => r.price));
  const rows = city ? ranked.map((r) => ({ ...r, ...saving(r.price, city), level: level(r.n) })) : [];
  return { product, city, rows, best: rows.length ? rows[0].bazaar : null, spread: rows.length ? rows[rows.length - 1].price - rows[0].price : 0 };
}

export const confidence = (cell, now, today) => ({ n: cell.n, level: level(cell.n), ago: Math.max(0, fdiv(now - cell.last_at, 60_000)), days: today - cell.day });

export function history(rows, first, last) {
  const days = new Map();
  for (const r of rows) {
    if (r.day < first || r.day > last) continue;
    if (!days.has(r.day)) days.set(r.day, {});
    days.get(r.day)[r.bazaar] = r.price;
  }
  return [...days.keys()].sort((a, b) => a - b).map((d) => {
    const by = days.get(d);
    const vals = Object.values(by);
    const sorted = Object.fromEntries(Object.keys(by).sort().map((k) => [k, by[k]]));
    return { day: d, city: cityMedian(vals), lo: Math.min(...vals), hi: Math.max(...vals), by: sorted };
  });
}

export function weekChange(series, today) {
  const pick = (a, b) => series.filter((p) => p.day >= a && p.day <= b).map((p) => p.city);
  const now = pick(today - 6, today);
  const prev = pick(today - 13, today - 7);
  if (!now.length || !prev.length) return null;
  const sum = (xs) => xs.reduce((s, x) => s + x, 0);
  const a = fdiv(sum(now), now.length);
  const b = fdiv(sum(prev), prev.length);
  return rdiv((a - b) * 100, b);
}

export function digest(changes, top = 3) {
  const items = Object.entries(changes).map(([pid, pct], i) => [pct, i, pid]).filter((x) => x[0] !== null && x[0] !== undefined);
  const down = [...items].sort((a, b) => a[0] - b[0] || a[1] - b[1]).filter((x) => x[0] <= -1).slice(0, top).map((x) => [x[2], x[0]]);
  const up = [...items].sort((a, b) => b[0] - a[0] || a[1] - b[1]).filter((x) => x[0] >= 1).slice(0, top).map((x) => [x[2], x[0]]);
  return { down, up };
}

const BARS = '▁▂▃▄▅▆▇█';

export function sparkline(values) {
  const known = values.filter((v) => v !== null && v !== undefined);
  if (!known.length) return '';
  const lo = Math.min(...known);
  const span = Math.max(...known) - lo;
  return values.map((v) => (v === null || v === undefined ? '·' : BARS[span ? fdiv((v - lo) * 7, span) : 3])).join('');
}

export function cells(rows, today) {
  const out = {};
  for (const r of rows) {
    if (r.day < today - FRESH_DAYS || r.day > today) continue;
    out[r.bazaar] ??= {};
    const cur = out[r.bazaar][r.product];
    if (!cur || r.day > cur.day) out[r.bazaar][r.product] = { price: r.price, n: r.n, users: r.users, last_at: r.last_at, day: r.day };
  }
  return out;
}
