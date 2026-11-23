// JS port of bozornarxi/core/trust.py: reference band, weighted median, MAD outliers, reporter weights. Whole numbers
// only, so the browser shows exactly the price the server shows.
export const W_NEW = 300;
export const W_GOOD = 50;
export const W_FAR = 150;
export const W_HIDDEN = 400;
export const W_MIN = 50;
export const W_MAX = 1500;
export const K_MAD = 3;
export const TOL_PCT = 12;
export const REF_LO = 55;
export const REF_HI = 180;
export const GOOD_PCT = 8;
export const SHOCK_USERS = 3;
export const REF_DAYS = 7;
export const fdiv = (a, b) => Math.floor(a / b);

export function rdiv(a, b) {
  const q = fdiv(Math.abs(a) * 2 + b, 2 * b);
  return a >= 0 || q === 0 ? q : -q;
}

export const roundTo = (x, unit) => fdiv(x + fdiv(unit, 2), unit) * unit;

export function weightOf(good, far, hidden, banned = false) {
  if (banned) return 0;
  return Math.max(W_MIN, Math.min(W_MAX, W_NEW + W_GOOD * good - W_FAR * far - W_HIDDEN * hidden));
}

export const trustPct = (weight) => rdiv(weight * 100, W_MAX);

const byValueId = (a, b) => a[0] - b[0] || a[2] - b[2];

export function wmedian(items) {
  const s = [...items].sort(byValueId);
  const total = s.reduce((acc, x) => acc + x[1], 0);
  let acc = 0;
  for (let i = 0; i < s.length; i++) {
    acc += s[i][1];
    if (acc * 2 > total) return s[i][0];
    if (acc * 2 === total) return fdiv(s[i][0] + s[i + 1][0], 2);
  }
  return s[s.length - 1][0];
}

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const n = s.length;
  return n % 2 ? s[fdiv(n, 2)] : fdiv(s[n / 2 - 1] + s[n / 2], 2);
}

export function reference(rows, bazaar, day) {
  const latest = new Map();
  for (const r of rows) {
    if (r.day >= day - REF_DAYS && r.day < day && (!latest.has(r.bazaar) || r.day > latest.get(r.bazaar)[0])) latest.set(r.bazaar, [r.day, r.price]);
  }
  if (latest.has(bazaar)) return latest.get(bazaar)[1];
  return median([...latest.values()].map((x) => x[1]));
}

export function aggregate(reports, ref, unit = 100) {
  const verdicts = {};
  for (const r of reports) if (r.weight <= 0) verdicts[r.id] = 'off';
  const live = reports.filter((r) => r.weight > 0);
  if (!live.length) return [null, verdicts];
  let near = live;
  if (ref) {
    const lo = fdiv(ref * REF_LO, 100);
    const hi = fdiv(ref * REF_HI, 100);
    near = live.filter((r) => lo <= r.price && r.price <= hi);
    if (!near.length && new Set(live.map((r) => r.user)).size >= SHOCK_USERS) near = live;
  }
  if (!near.length) {
    for (const r of live) verdicts[r.id] = 'far';
    return [null, verdicts];
  }
  const m0 = wmedian(near.map((r) => [r.price, r.weight, r.id]));
  const mad = wmedian(near.map((r) => [Math.abs(r.price - m0), r.weight, r.id]));
  const tol = Math.max(K_MAD * mad, fdiv(m0 * TOL_PCT, 100));
  const kept = near.filter((r) => Math.abs(r.price - m0) <= tol);
  const price = roundTo(wmedian(kept.map((r) => [r.price, r.weight, r.id])), unit);
  const keptIds = new Set(kept.map((r) => r.id));
  for (const r of live) {
    if (!keptIds.has(r.id)) verdicts[r.id] = 'far';
    else verdicts[r.id] = Math.abs(r.price - price) * 100 <= price * GOOD_PCT ? 'ok' : 'near';
  }
  const res = { price, n: kept.length, users: new Set(kept.map((r) => r.user)).size, last_at: Math.max(...kept.map((r) => r.at)) };
  return [res, verdicts];
}

export const level = (n) => (n <= 1 ? 'low' : n <= 3 ? 'mid' : 'high');
