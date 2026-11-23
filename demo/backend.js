// The demo's in-page backend: the same rules as the server's service (bozornarxi/*.py) on plain arrays and maps, using
// the very same core (shared/*.js): people, reports (one per person, bazaar, product and day), the day's price
// recomputed with the trust rules and the reporters' weights, the public views. Alerts, lists and moderation are in
// backend-more.js. Errors are Refused with the server's codes.
import { localDay, localMinute } from '../shared/clock.js';
import * as prices from '../shared/prices.js';
import { clean, InputError } from '../shared/text.js';
import * as trust from '../shared/trust.js';

export class Refused extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

export function checked(fn, ...args) {
  try {
    return fn(...args);
  } catch (e) {
    if (e instanceof InputError) throw new Refused(e.code);
    throw e;
  }
}

const key = (b, p, day) => `${b}:${p}:${day}`;

export class Backend {
  constructor({ data, now = () => Date.now(), moderators = [] }) {
    Object.assign(this, { clock: now, offset: 0, products: data.products, bazaars: data.bazaars });
    this.pmap = Object.fromEntries(data.products.map((p) => [p.id, p]));
    this.bmap = Object.fromEntries(data.bazaars.map((b) => [b.id, b]));
    this.moderators = new Set(moderators);
    this.users = new Map();
    this.reports = [];
    this.byPair = new Map();
    this.byUser = new Map();
    this.daily = new Map(this.products.map((p) => [p.id, new Map()]));
    this.alertList = [];
    this.lists = new Map();
    this.listeners = [];
    this.version = 0;
    this.cache = null;
  }

  on(fn) { this.listeners.push(fn); }
  emit(ev) { for (const fn of this.listeners) fn(ev); }
  notify(notes) { for (const note of notes) this.emit({ type: 'note', note }); }
  changed() { this.version += 1; this.emit({ type: 'changed' }); }
  nowMs() { return this.clock() + this.offset; }
  advance(ms) { this.offset += ms; this.changed(); }
  today() { return localDay(this.nowMs()); }
  minute() { return localMinute(this.nowMs()); }

  product(pid) {
    if (typeof pid !== 'string' || !Object.hasOwn(this.pmap, pid)) throw new Refused('not_found');
    return this.pmap[pid];
  }

  bazaar(bid) {
    if (typeof bid !== 'string' || !Object.hasOwn(this.bmap, bid)) throw new Refused('not_found');
    return this.bmap[bid];
  }

  /** The seeded city (shared/seedgen.js), already with the story's ids. */
  load(world) {
    for (const u of world.users) this.users.set(u.id, { ...u, lang: 'uz', digest: 1, pend: null });
    for (const r of world.reports) this.addReport({ ...r, photo: null });
    for (const d of world.daily) this.daily.get(d.product).set(key(d.bazaar, d.product, d.day), { ...d });
  }

  addReport(r) {
    this.reports.push(r);
    const k = key(r.bazaar, r.product, r.day);
    if (!this.byPair.has(k)) this.byPair.set(k, []);
    this.byPair.get(k).push(r);
    if (!this.byUser.has(r.user)) this.byUser.set(r.user, []);
    this.byUser.get(r.user).push(r);
  }

  // ── people ──
  touch(uid, name, lang = 'uz') {
    if (!this.users.has(uid)) this.users.set(uid, { id: uid, name: clean(name, 64) || 'Xaridor', created_day: this.today(), banned: 0, lang, digest: 1, pend: null });
    return this.users.get(uid);
  }

  user(uid) {
    const u = this.users.get(uid);
    if (!u) throw new Refused('auth');
    return u;
  }

  lang(uid) { return this.users.get(uid)?.lang ?? 'uz'; }

  setLang(uid, lang) {
    if (!['uz', 'ru'].includes(lang)) throw new Refused('generic');
    this.user(uid).lang = lang;
    return lang;
  }

  isMod(uid) { return this.moderators.has(uid); }
  needMod(uid) { if (!this.isMod(uid)) throw new Refused('forbidden'); }

  me(uid) {
    const u = this.user(uid);
    return { id: uid, name: u.name, lang: u.lang, mod: this.isMod(uid), digest: Boolean(u.digest), banned: Boolean(u.banned), today: this.today(), now: this.nowMs() };
  }

  setPending(uid, pend) { this.user(uid).pend = pend ? { ...pend, at: this.nowMs() } : null; }

  pending(uid) {
    const p = this.users.get(uid)?.pend;
    return p && this.nowMs() - p.at < 30 * 60_000 ? p : null;
  }

  // ── trust ──
  weights(users, day) {
    const out = {};
    for (const u of users) {
      let good = 0;
      let far = 0;
      let hid = 0;
      for (const r of this.byUser.get(u) ?? []) {
        if (r.hidden) hid += 1;
        else if (r.day < day && r.verdict === 'ok') good += 1;
        else if (r.day < day && r.verdict === 'far') far += 1;
      }
      out[u] = trust.weightOf(good, far, hid, Boolean(this.users.get(u)?.banned));
    }
    return out;
  }

  recompute(bazaar, product, day) {
    const rows = (this.byPair.get(key(bazaar, product, day)) ?? []).filter((r) => !r.hidden).sort((a, b) => a.id - b.id);
    const w = this.weights(new Set(rows.map((r) => r.user)), day);
    const input = rows.map((r) => ({ id: r.id, user: r.user, price: r.price, at: r.at, weight: w[r.user] }));
    const refRows = [...this.daily.get(product).values()].filter((d) => d.day >= day - trust.REF_DAYS && d.day <= day - 1);
    const [res, verdicts] = trust.aggregate(input, trust.reference(refRows, bazaar, day), this.pmap[product].round);
    for (const r of rows) if (r.id in verdicts) r.verdict = verdicts[r.id];
    const k = key(bazaar, product, day);
    if (res) this.daily.get(product).set(k, { bazaar, product, day, ...res });
    else this.daily.get(product).delete(k);
    return res;
  }

  cell(bazaar, product) {
    const today = this.today();
    for (let d = today; d >= today - prices.FRESH_DAYS; d--) {
      const row = this.daily.get(product).get(key(bazaar, product, d));
      if (row) return { price: row.price, n: row.n, users: row.users, last_at: row.last_at, day: row.day };
    }
    return null;
  }

  submit(uid, bazaar, product, price, confirm = false) {
    const b = this.bazaar(bazaar);
    const p = this.product(product);
    const n = checked(prices.checkPrice, p, price);
    const today = this.today();
    const u = this.user(uid);
    if (u.banned) throw new Refused('banned');
    const mine = this.byUser.get(uid) ?? [];
    const old = mine.find((r) => r.bazaar === b.id && r.product === p.id && r.day === today);
    if (!old && mine.filter((r) => r.day === today).length >= prices.MAX_REPORTS_PER_DAY) throw new Refused('daily_limit');
    let rep = old;
    if (old) Object.assign(old, { at: this.nowMs(), price: n, confirm: confirm ? 1 : 0, photo: null, hidden: 0, verdict: '' });
    else {
      rep = { id: this.reports.length + 1, user: uid, bazaar: b.id, product: p.id, day: today, at: this.nowMs(), price: n, confirm: confirm ? 1 : 0,
        photo: null, hidden: 0, verdict: '' };
      this.addReport(rep);
    }
    const res = this.recompute(b.id, p.id, today);
    const far = rep.verdict === 'far';
    const notes = far ? [...this.moderators].sort((x, y) => x - y).filter((m) => m !== uid).map((m) => ({ to: m, kind: 'mod', report: rep.id }))
      : res ? this.fireAlerts(p.id) : [];
    this.changed();
    return [{ status: far ? 'review' : 'ok', report: rep.id, replaced: Boolean(old), bazaar: b.id, product: p.id, price: n,
      cell: far || !res ? null : { ...res, day: today } }, notes];
  }

  confirm(uid, bazaar, product) {
    const b = this.bazaar(bazaar);
    const p = this.product(product);
    const cur = this.cell(b.id, p.id);
    if (!cur) throw new Refused('not_found');
    return this.submit(uid, b.id, p.id, cur.price, true);
  }

  setPhoto(uid, report, fileId) {
    const r = this.reports[report - 1];
    if (!r || r.user !== uid || r.day !== this.today()) throw new Refused('not_found');
    r.photo = String(fileId).slice(0, 200);
  }

  // ── public views ──
  dailyRows(first, last, product = null) {
    const out = [];
    for (const [pid, rows] of this.daily) {
      if (product && pid !== product) continue;
      for (const r of rows.values()) if (r.day >= first && r.day <= last) out.push(r);
    }
    return out.sort((a, b) => a.day - b.day || (a.bazaar < b.bazaar ? -1 : a.bazaar > b.bazaar ? 1 : 0) || (a.product < b.product ? -1 : 1));
  }

  cells() { return prices.cells(this.dailyRows(this.today() - prices.FRESH_DAYS, this.today()), this.today()); }

  week() {
    const today = this.today();
    return Object.fromEntries(this.products.map((p) => [p.id,
      prices.weekChange(prices.history(this.dailyRows(today - 13, today, p.id), today - 13, today), today)]));
  }

  snapshot() {
    const stamp = `${this.version}:${this.today()}`;
    if (this.cache?.stamp !== stamp) this.cache = { stamp, value: { today: this.today(), cells: this.cells(), week: this.week() } };
    return { ...this.cache.value, now: this.nowMs() };
  }

  history(product, days) {
    const p = this.product(product);
    if (![30, 90].includes(days)) throw new Refused('generic');
    const today = this.today();
    return { product: p.id, today, days, series: prices.history(this.dailyRows(today - days + 1, today, p.id), today - days + 1, today) };
  }
}
