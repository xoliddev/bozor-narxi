// The demo backend's alerts (each fired once), the shopping list and moderation (hide, ban): the same rules as
// bozornarxi/alerts.py and bozornarxi/moderation.py, mixed into Backend.
import { basket, checkItems } from '../shared/basket.js';
import * as prices from '../shared/prices.js';
import * as trust from '../shared/trust.js';
import { Backend, checked, Refused } from './backend.js';

const MAX_ALERTS = 10;
const ALERT_MIN_N = 2;
const isInt = (v) => Number.isInteger(v) && typeof v !== 'boolean';

Object.assign(Backend.prototype, {
  fireAlerts(product) {
    const today = this.today();
    const order = Object.fromEntries(this.bazaars.map((b, i) => [b.id, i]));
    const rows = [...this.daily.get(product).values()].filter((d) => d.day === today && d.n >= ALERT_MIN_N);
    if (!rows.length) return [];
    const best = rows.sort((a, b) => a.price - b.price || order[a.bazaar] - order[b.bazaar])[0];
    const notes = [];
    for (const a of this.alertList.filter((x) => x.product === product && !x.fired_at && x.below > best.price).sort((x, y) => x.id - y.id)) {
      Object.assign(a, { fired_at: this.nowMs(), bazaar: best.bazaar, price: best.price });
      notes.push({ to: a.user, kind: 'alert', product, bazaar: best.bazaar, price: best.price, below: a.below });
    }
    return notes;
  },

  alerts(uid) {
    const since = this.nowMs() - 7 * 86_400_000;
    return this.alertList.filter((a) => a.user === uid && (!a.fired_at || a.fired_at > since))
      .sort((a, b) => Number(Boolean(a.fired_at)) - Number(Boolean(b.fired_at)) || a.id - b.id)
      .map((a) => ({ id: a.id, product: a.product, below: a.below, fired_at: a.fired_at, bazaar: a.bazaar, price: a.price }));
  },

  addAlert(uid, product, below) {
    const p = this.product(product);
    const limit = checked(prices.checkPrice, p, below);
    this.alertList = this.alertList.filter((a) => !(a.user === uid && a.product === p.id && !a.fired_at));
    if (this.alertList.filter((a) => a.user === uid && !a.fired_at).length >= MAX_ALERTS) throw new Refused('alerts_full');
    this.alertSeq = (this.alertSeq ?? 0) + 1;
    this.alertList.push({ id: this.alertSeq, user: uid, product: p.id, below: limit, created_at: this.nowMs(), fired_at: null, bazaar: null, price: null });
    const notes = this.fireAlerts(p.id);
    return [this.alerts(uid), notes];
  },

  removeAlert(uid, id) {
    if (!isInt(id)) throw new Refused('not_found');
    this.alertList = this.alertList.filter((a) => !(a.id === id && a.user === uid));
    return this.alerts(uid);
  },

  setDigest(uid, on) {
    if (typeof on !== 'boolean') throw new Refused('generic');
    this.user(uid).digest = on ? 1 : 0;
    return on;
  },

  getList(uid) { return (this.lists.get(uid) ?? []).map((x) => ({ ...x })); },

  setList(uid, items) {
    this.lists.set(uid, checked(checkItems, items, this.pmap));
    return this.getList(uid);
  },

  listPut(uid, product, qty) {
    const p = this.product(product);
    const items = this.getList(uid).filter((x) => x.product !== p.id);
    if (qty !== 0) items.push({ product: p.id, qty });
    return this.setList(uid, items);
  },

  basketFor(uid, here = null) {
    const items = this.getList(uid);
    return { items, ...basket(items, this.cells(), this.bazaars, this.today(), here) };
  },

  // ── moderation ──
  trustOf(uid) { return trust.trustPct(this.weights([uid], this.today())[uid]); },

  reportView(id) {
    const r = this.reports[id - 1];
    if (!r) return null;
    const u = this.users.get(r.user);
    const refs = [...this.daily.get(r.product).values()].filter((d) => d.day >= r.day - trust.REF_DAYS && d.day <= r.day - 1);
    return { id: r.id, bazaar: r.bazaar, product: r.product, price: r.price, at: r.at, day: r.day, user: r.user, who: u?.name ?? '?',
      trust: this.trustOf(r.user), ref: trust.reference(refs, r.bazaar, r.day), hidden: Boolean(r.hidden), banned: Boolean(u?.banned), verdict: r.verdict };
  },

  queue(uid) {
    this.needMod(uid);
    const since = this.today() - 1;
    return this.reports.filter((r) => r.day >= since && r.verdict === 'far' && !r.hidden && !this.users.get(r.user)?.banned)
      .sort((a, b) => b.at - a.at || b.id - a.id).slice(0, 20).map((r) => this.reportView(r.id));
  },

  refreshUser(uid, since) {
    const notes = [];
    const pairs = new Map();
    for (const r of this.byUser.get(uid) ?? []) if (r.day >= since) pairs.set(`${r.day}:${r.bazaar}:${r.product}`, r);
    for (const r of [...pairs.values()].sort((a, b) => a.day - b.day || (a.bazaar < b.bazaar ? -1 : 1) || (a.product < b.product ? -1 : 1))) {
      const res = this.recompute(r.bazaar, r.product, r.day);
      if (res && r.day === this.today()) notes.push(...this.fireAlerts(r.product));
    }
    return notes;
  },

  hide(mod, report) {
    this.needMod(mod);
    const r = isInt(report) ? this.reports[report - 1] : null;
    if (!r) throw new Refused('not_found');
    const before = this.trustOf(r.user);
    r.hidden = 1;
    const res = this.recompute(r.bazaar, r.product, r.day);
    const notes = this.refreshUser(r.user, this.today());
    if (res && r.day === this.today()) notes.push(...this.fireAlerts(r.product));
    const out = { report: r.id, user: r.user, who: this.users.get(r.user)?.name ?? '?', before, after: this.trustOf(r.user), bazaar: r.bazaar,
      product: r.product, cell: this.cell(r.bazaar, r.product) };
    this.changed();
    return [out, notes];
  },

  ban(mod, user) {
    this.needMod(mod);
    if (!isInt(user) || user === mod || this.isMod(user)) throw new Refused('forbidden');
    const u = this.users.get(user);
    if (!u) throw new Refused('not_found');
    u.banned = 1;
    const n = (this.byUser.get(user) ?? []).filter((r) => !r.hidden).length;
    const notes = this.refreshUser(user, this.today() - 1);
    this.changed();
    return [{ user, who: u.name, n }, notes];
  },
});

export { Backend };
