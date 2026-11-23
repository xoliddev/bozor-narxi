// JS port of bozornarxi/core/basket.py: the shopping list's total at every bazaar, the cheapest one, the saving and
// the items with no price. Amounts are tenths of a unit (15 = 1.5 kg; for eggs 10 = "10 ta").
import { fresh } from './prices.js';
import { InputError, whole } from './text.js';

export const MAX_ITEMS = 20;
export const MAX_QTY = 500;

export function checkItems(items, products) {
  if (!Array.isArray(items) || items.length > MAX_ITEMS) throw new InputError('list');
  const out = [];
  const seen = new Set();
  for (const it of items) {
    if (!it || typeof it !== 'object' || !Object.hasOwn(products, it.product) || seen.has(it.product)) throw new InputError('list');
    const qty = whole(it.qty, 1, MAX_QTY, 'qty');
    if (qty % products[it.product].step) throw new InputError('qty');
    seen.add(it.product);
    out.push({ product: it.product, qty });
  }
  return out;
}

export const itemTotal = (price, qty) => Math.floor((price * qty + 5) / 10);

export function distanceM(a, b) {
  const lat = ((a[0] + b[0]) / 2) * (Math.PI / 180);
  const dx = (b[1] - a[1]) * Math.cos(lat) * 111_320;
  const dy = (b[0] - a[0]) * 110_540;
  return Math.floor(Math.sqrt(dx * dx + dy * dy) / 100 + 0.5) * 100;
}

export function basket(items, cells, bazaars, today, here = null) {
  const full = [];
  const part = [];
  bazaars.forEach((b, i) => {
    const have = cells[b.id] ?? {};
    let total = 0;
    let priced = 0;
    const missing = [];
    for (const it of items) {
      const c = have[it.product];
      if (fresh(c, today)) {
        total += itemTotal(c.price, it.qty);
        priced += 1;
      } else missing.push(it.product);
    }
    if (!priced) return;
    const row = { bazaar: b.id, total, missing };
    if (here) row.dist = distanceM(here, [b.lat, b.lon]);
    (missing.length ? part : full).push([i, row]);
  });
  full.sort((a, b) => a[1].total - b[1].total || a[0] - b[0]);
  part.sort((a, b) => a[1].missing.length - b[1].missing.length || a[1].total - b[1].total || a[0] - b[0]);
  const best = full.length ? full[0][1] : null;
  const worst = full.length > 1 ? full[full.length - 1][1] : null;
  return { rows: [...full, ...part].map((x) => x[1]), best: best?.bazaar ?? null, worst: worst?.bazaar ?? null,
    best_total: best?.total ?? 0, saving: best && worst ? worst.total - best.total : 0, complete: full.length };
}
