// JS port of bozornarxi/core/seedgen.py: the same invented city (reporters, ~90 days of reports with their verdicts,
// the daily shown prices), relative to "today". shared/test_vectors.json checks both build the very same world.
import { atLocal } from './clock.js';
import { h32 } from './text.js';
import { aggregate, fdiv, reference, roundTo, weightOf } from './trust.js';

export const DAYS = 90;
const POPULAR = ['mol', 'kartoshka', 'piyoz', 'sabzi', 'pomidor', 'tuxum'];
const COUNTS = { true: [0, 1, 1, 2, 2, 3, 4], false: [0, 0, 1, 1, 1, 2, 3] };
export const OPEN = 6 * 60 + 30;
export const NEWBIE = -40;
const PINS = { 'chorsu:kartoshka': [4900, 9 * 60 + 55], 'chorsu:piyoz': [6200, 9 * 60 + 50] };

export function center(p, b, d) {
  const drift = fdiv(-p.trend * Math.min(d, 14), 14);
  const t = (d + p.phase) % 120;
  const tri = fdiv(Math.abs(2 * t - 120) * 2000, 120) - 1000;
  const c = fdiv(p.base * (1000 + drift + fdiv(p.wave * tri, 1000)), 1000);
  return fdiv(c * b.level[p.cat], 1000);
}

const clamp = (p, price) => Math.max(p.min, Math.min(p.max, roundTo(price, p.round)));

export function people(names, today) {
  const users = names.reporters.map((n, i) => ({ id: -(i + 1), name: n, created_day: today - 400 + i * 5, banned: 0 }));
  names.trolls.forEach((n, j) => users.push({ id: -(31 + j), name: n, created_day: today - 50 + j * 7, banned: j === 2 ? 1 : 0 }));
  users.push({ id: NEWBIE, name: 'Nigora', created_day: today - 2, banned: 0 });
  return users;
}

export function rawReports(products, bazaars, today, minute) {
  const out = [];
  const add = (user, b, p, d, m, price, hidden = 0) => {
    out.push({ id: out.length + 1, user, bazaar: b.id, product: p.id, day: today - d, at: atLocal(today - d, m), price, confirm: 0, hidden,
      verdict: hidden ? 'far' : '' });
  };
  for (let d = DAYS - 1; d >= 0; d--) {
    for (const b of bazaars) {
      for (const p of products) {
        if (b.none.includes(p.id)) continue;
        const key = `${d}:${b.id}:${p.id}`;
        const pin = d === 0 ? PINS[`${b.id}:${p.id}`] : null;
        if (pin) {
          if (minute > OPEN) add(NEWBIE, b, p, 0, Math.min(minute - 1, pin[1]), pin[0]);
          continue;
        }
        const c = center(p, b, d);
        const n = COUNTS[POPULAR.includes(p.id)][h32(`n:${key}`) % 7];
        const hb = h32(`u:${key}`) % 60;
        const first = hb < 30 ? hb % 6 : hb - 30;
        for (let k = 0; k < n; k++) {
          const h = h32(`r:${key}:${k}`);
          const m = OPEN + (h % 240);
          if (d === 0 && m >= minute) continue;
          add(-(((first + k * 7) % 30) + 1), b, p, d, m, clamp(p, fdiv(c * (1000 + ((h >>> 8) % 61) - 30), 1000)));
        }
        const ht = h32(`t:${key}`);
        const m = OPEN + ((ht >>> 4) % 240);
        if (ht % 89 === 0 && !(d === 0 && m >= minute)) {
          const factor = (ht >>> 12) % 2 ? 12 : 380;
          add(-(31 + ((ht >>> 8) % 3)), b, p, d, m, clamp(p, fdiv(c * factor, 100)), (ht >>> 16) % 3 === 0 ? 1 : 0);
        }
      }
    }
  }
  return out;
}

export function world(products, bazaars, names, today, minute) {
  const users = people(names, today);
  const banned = new Set(users.filter((u) => u.banned).map((u) => u.id));
  const reports = rawReports(products, bazaars, today, minute);
  const hidden = new Map();
  const good = new Map();
  const far = new Map();
  const inc = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const r of reports) if (r.hidden) inc(hidden, r.user);
  const units = Object.fromEntries(products.map((p) => [p.id, p.round]));
  const byDay = new Map();
  for (const r of reports) {
    if (r.hidden) continue;
    if (!byDay.has(r.day)) byDay.set(r.day, new Map());
    const key = `${r.bazaar}:${r.product}`;
    const m = byDay.get(r.day);
    if (!m.has(key)) m.set(key, []);
    m.get(key).push(r);
  }
  const last = Object.fromEntries(products.map((p) => [p.id, new Map()]));
  const daily = [];
  for (let day = today - DAYS + 1; day <= today; day++) {
    const done = [];
    const pairs = byDay.get(day) ?? new Map();
    for (const b of bazaars) {
      for (const p of products) {
        const rows = pairs.get(`${b.id}:${p.id}`);
        if (!rows) continue;
        const input = rows.map((r) => ({ ...r, weight: weightOf(good.get(r.user) ?? 0, far.get(r.user) ?? 0, hidden.get(r.user) ?? 0, banned.has(r.user)) }));
        const [res, verdicts] = aggregate(input, reference([...last[p.id].values()], b.id, day), units[p.id]);
        for (const r of rows) r.verdict = verdicts[r.id];
        if (res) {
          const row = { bazaar: b.id, product: p.id, day, ...res };
          daily.push(row);
          done.push(row);
        }
      }
    }
    for (const row of done) last[row.product].set(row.bazaar, { bazaar: row.bazaar, day: row.day, price: row.price });
    for (const rows of pairs.values()) {
      for (const r of rows) {
        if (r.verdict === 'ok') inc(good, r.user);
        else if (r.verdict === 'far') inc(far, r.user);
      }
    }
  }
  return { users, reports, daily };
}
