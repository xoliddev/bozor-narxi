// The JS port of the core must give exactly what the Python core gives (shared/test_vectors.json).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import * as basket from '../shared/basket.js';
import * as clock from '../shared/clock.js';
import * as i18n from '../shared/i18n.js';
import * as prices from '../shared/prices.js';
import * as seedgen from '../shared/seedgen.js';
import * as text from '../shared/text.js';
import * as trust from '../shared/trust.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const V = read('../shared/test_vectors.json');
const products = read('../shared/data/products.json');
const bazaars = read('../shared/data/bazaars.json');
const names = read('../shared/data/names.json');
const pmap = Object.fromEntries(products.map((p) => [p.id, p]));
const bmap = Object.fromEntries(bazaars.map((b) => [b.id, b]));
const t = i18n.makeT({ uz: read('../shared/locales/uz.json'), ru: read('../shared/locales/ru.json') });
const digest = (x) => text.h32(JSON.stringify(x));

function res(fn) {
  try {
    return { ok: fn() ?? null };
  } catch (e) {
    if (e instanceof text.InputError) return { error: e.code };
    throw e;
  }
}

test('Tashkent calendar, FNV-1a, rounding', () => {
  for (const v of V.civil) {
    assert.deepEqual(clock.civil(v.day), v.out, String(v.day));
    assert.equal(clock.daysFromCivil(...v.out), v.back);
  }
  for (const v of V.minutes) assert.deepEqual([clock.localDay(v.ms), clock.localMinute(v.ms)], [v.day, v.min]);
  for (const v of V.h32) assert.equal(text.h32(v.in), v.out, v.in);
  for (const [a, b, out] of V.rdiv) assert.equal(trust.rdiv(a, b), out, `${a}/${b}`);
  for (const [x, u, out] of V.round_to) assert.equal(trust.roundTo(x, u), out);
});

test('trust: weights, weighted median, reference band, MAD outliers, verdicts', () => {
  for (const [g, f, h, b, out] of V.weight) assert.equal(trust.weightOf(g, f, h, b), out, `${g},${f},${h},${b}`);
  for (const [w, out] of V.trust_pct) assert.equal(trust.trustPct(w), out);
  for (const v of V.wmedian) assert.equal(trust.wmedian(v.in), v.out, JSON.stringify(v.in));
  for (const [xs, out] of V.median) assert.equal(trust.median(xs), out);
  for (const v of V.reference) assert.equal(trust.reference(v.rows, v.bazaar, v.day), v.out);
  for (const v of V.aggregate) {
    const [r, verdicts] = trust.aggregate(v.reports, v.ref, v.unit);
    assert.deepEqual([r, verdicts], v.out, JSON.stringify(v.reports));
  }
  for (const [n, out] of V.level) assert.equal(trust.level(n), out);
});

test('prices: typed prices, ranges, the one-line chart, savings, the digest', () => {
  for (const v of V.parse) assert.deepEqual(res(() => prices.parsePrice(v.in)), v.out, JSON.stringify(v.in));
  for (const v of V.check) assert.deepEqual(res(() => prices.checkPrice(pmap.kartoshka, v.in)), v.out, JSON.stringify(v.in));
  for (const v of V.spark) assert.equal(prices.sparkline(v.in), v.out);
  for (const [p, c, out] of V.saving) assert.deepEqual(prices.saving(p, c), out);
  for (const v of V.digest_in) assert.deepEqual(prices.digest(v.in), v.out);
});

test('the seeded city is the same world in both languages, on any day and time', () => {
  for (const [pid, bid, d, out] of V.center) assert.equal(seedgen.center(pmap[pid], bmap[bid], d), out, `${pid} ${bid} ${d}`);
  for (const v of V.world) {
    const w = seedgen.world(products, bazaars, names, v.today, v.minute);
    assert.deepEqual(Object.fromEntries(Object.entries(w).map(([k, x]) => [k, x.length])), v.sizes);
    assert.deepEqual(w.reports.slice(-3), v.reports);
    assert.deepEqual(w.daily.slice(-2), v.daily);
    assert.deepEqual(Object.fromEntries(Object.entries(w).map(([k, x]) => [k, digest(x)])), v.digest, `${v.today} ${v.minute}`);
  }
});

test('"qayerda arzon", the chart series, the weekly change and the shopping list', () => {
  const w = seedgen.world(products, bazaars, names, V.today, V.minute);
  const cells = prices.cells(w.daily, V.today);
  assert.equal(digest(cells), V.cells_digest);
  for (const p of products) {
    assert.deepEqual(prices.whereCheap(p.id, cells, bazaars, V.today), V.where[p.id], p.id);
    const s = prices.history(w.daily.filter((r) => r.product === p.id), V.today - 89, V.today);
    assert.deepEqual({ len: s.length, digest: digest(s), last: s.slice(-2) }, V.history[p.id], p.id);
    assert.equal(prices.weekChange(s, V.today), V.week[p.id], p.id);
    if (V.spark_seed[p.id] !== undefined) {
      const line = Array.from({ length: 14 }, (_, k) => s.find((x) => x.day === V.today - 13 + k)?.city ?? null);
      assert.equal(prices.sparkline(line), V.spark_seed[p.id]);
    }
  }
  assert.deepEqual(prices.digest(V.week), V.digest);
  const NOW = V.now;
  assert.deepEqual([prices.confidence(cells.chorsu.kartoshka, NOW, V.today), prices.confidence(cells.oloy.mol, NOW + 3 * 3_600_000, V.today + 1)], V.confidence);
  for (const v of V.basket) assert.deepEqual(basket.basket(v.items, cells, bazaars, V.today, v.here), v.out, JSON.stringify(v.items));
  for (const v of V.check_items) assert.deepEqual(res(() => basket.checkItems(v.in, pmap)), v.out, JSON.stringify(v.in));
  for (const [a, b, out] of V.distance) assert.equal(basket.distanceM(a, b), out);
  for (const [p, q, out] of V.item_total) assert.equal(basket.itemTotal(p, q), out);
});

test('sentences read the same as the bot in both languages', () => {
  for (const lang of ['uz', 'ru']) {
    const s = V.sentences[lang];
    const { kartoshka: kart, piyoz, tuxum, yog } = pmap;
    const row = V.where.kartoshka.rows[0];
    const confs = [{ n: 5, level: 'high', ago: 40, days: 0 }, { n: 1, level: 'low', ago: 0, days: 0 }, { n: 3, level: 'mid', ago: 135, days: 0 },
      { n: 2, level: 'mid', ago: 999, days: 1 }, { n: 1, level: 'low', ago: 0, days: 3 }];
    assert.deepEqual([0, 500, 4500, 112_000, 1_250_000].map((n) => i18n.money(t, lang, n)), s.money);
    assert.deepEqual([V.today, V.nye].map((d) => i18n.dateShort(t, lang, d)), s.date);
    assert.deepEqual([kart, yog, tuxum].map((p) => i18n.perUnit(t, lang, p, 16000)), s.per);
    assert.deepEqual([[kart, 15], [kart, 30], [yog, 10], [tuxum, 10], [tuxum, 30]].map(([p, q]) => i18n.amount(t, lang, p, q)), s.amount);
    assert.deepEqual(confs.map((c) => i18n.confText(t, lang, c)), s.conf);
    assert.deepEqual([13, 0, -4].map((pct) => i18n.savingText(t, lang, { pct })), s.saving);
    assert.deepEqual([13, 0, -4].map((pct) => i18n.shortSaving(t, lang, { pct })), s.short);
    assert.deepEqual([-12, 9, 0, null].map((p) => i18n.changeText(t, lang, p)), s.change);
    assert.deepEqual([-12, 9, 0].map(i18n.signed), s.signed);
    assert.equal(i18n.thanks(t, lang, bmap.chorsu, kart, { price: 4500, n: 5 }), s.thanks);
    assert.equal(i18n.cheapLine(t, lang, bmap[row.bazaar], kart, row), s.cheap);
    assert.deepEqual([i18n.bestText(t, lang, bmap.oloy, 287_000, 41_000), i18n.bestText(t, lang, bmap.oloy, 287_000, 0)], s.best);
    assert.deepEqual([0, 800, 1000, 3200, 12_400].map((m) => i18n.km(t, lang, m)), s.km);
    assert.equal(i18n.alertText(t, lang, piyoz, bmap.chorsu, 5800, 6000), s.alert);
    assert.equal(i18n.changeLine(lang, piyoz, -12), s.line);
  }
});
