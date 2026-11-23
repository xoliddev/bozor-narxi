// The bot, simulated in the page: the same callback data, screens and messages as bozornarxi/bot (sending a price with
// one-tap confirmation, qayerda arzon, the shopping list, alerts, the weekly view, the moderators' queue), and every
// message the real bot sends on its own. Messages are {id, from: 'bot' | 'me', html, kb, at}.
import * as I from '../shared/i18n.js';
import { confidence, sparkline, whereCheap } from '../shared/prices.js';
import { Refused } from './backend.js';

const strip = (html) => html.replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const ID = '([a-z]{1,16})';
const PATTERNS = [['menu', 'm'], ['lang', 'lang'], ['bazaars', 'r'], ['products', `r:${ID}`], ['ask', `r:${ID}:${ID}`], ['confirm', `ok:${ID}:${ID}`],
  ['cheapPick', 'c'], ['cheap', `c:${ID}`], ['list', 'l'], ['listPick', 'la'], ['listAmount', `la:${ID}`], ['listPut', `lq:${ID}:(\\d{1,3})`],
  ['listCalc', 'lc'], ['listClear', 'lx'], ['alerts', 'a'], ['alertPick', 'an'], ['alertAsk', `an:${ID}`], ['alertSet', `as:${ID}:(\\d{1,9})`],
  ['alertDel', 'ad:(\\d{1,12})'], ['digest', 'dg'], ['week', 'w'], ['queue', 'q'], ['hide', 'qh:(\\d{1,12})'], ['ban', 'qb:(-?\\d{1,15})']]
  .map(([n, rx]) => [n, new RegExp(`^${rx}$`)]);

export class BotSim {
  constructor(backend, uid, t, views, { onChange = () => {}, onAlert = () => {}, site = 'demo:' } = {}) {
    Object.assign(this, { b: backend, uid, t, v: views, onChange, onAlert, site });
    this.messages = [];
    this.ids = 1;
  }

  get lang() { return this.b.lang(this.uid); }

  push(screen, from = 'bot') {
    const msg = { id: this.ids++, from, html: screen.html, kb: screen.kb ?? [], at: this.b.nowMs() };
    this.messages.push(msg);
    this.onChange();
    return msg;
  }

  show(id, screen) {
    const msg = id && this.messages.find((m) => m.id === id);
    if (!msg) return this.push(screen);
    Object.assign(msg, { html: screen.html, kb: screen.kb ?? [] });
    this.onChange();
    return msg;
  }

  guard(fn) {
    try {
      return fn();
    } catch (e) {
      if (!(e instanceof Refused)) throw e;
      const key = this.t(this.lang, `err.${e.code}`) === `err.${e.code}` ? 'err.generic' : `err.${e.code}`;
      return { error: this.t(this.lang, key) };
    }
  }

  menuScreen() { return this.v.menu(this.lang, this.b.me(this.uid), this.b.today(), this.b.week(), this.b.products, this.site); }

  start() {
    this.b.setPending(this.uid, null);
    this.push({ html: '/start' }, 'me');
    const m = this.menuScreen();
    return this.push({ ...m, html: `${this.t(this.lang, 'bot.hello', { name: this.b.user(this.uid).name })}\n\n${m.html}` });
  }

  cheapScreen(pid) {
    const b = this.b;
    const p = b.product(pid);
    const today = b.today();
    const by = Object.fromEntries(b.history(p.id, 30).series.map((x) => [x.day, x.city]));
    const spark = sparkline(Array.from({ length: 14 }, (_, k) => by[today - 13 + k] ?? null));
    return this.v.cheap(this.lang, p, whereCheap(p.id, b.cells(), b.bazaars, today), b.week()[p.id], spark, b.bmap, this.site);
  }

  askScreen(bid, pid) {
    const b = this.b;
    const bz = b.bazaar(bid);
    const p = b.product(pid);
    b.setPending(this.uid, { kind: 'price', bazaar: bz.id, product: p.id });
    return this.v.askPrice(this.lang, bz, p, b.cell(bz.id, p.id), b.nowMs(), b.today());
  }

  queueScreen(head = '') {
    const q = this.b.queue(this.uid);
    const top = `${head ? `${head}\n\n` : ''}${this.t(this.lang, 'mod.title')}`;
    if (!q.length) return { html: `${top}\n\n${this.t(this.lang, 'mod.empty')}`, kb: [this.v.back(this.lang)] };
    const item = this.v.modItem(this.lang, q[0], this.b.pmap, this.b.bmap);
    return { html: `${top}\n\n${item.html}`, kb: [...item.kb, this.v.back(this.lang)] };
  }

  pairLine(res) {
    if (!res.cell) return '';
    const { t, lang, b } = this;
    const conf = I.confText(t, lang, confidence(res.cell, b.nowMs(), b.today()));
    return `${I.cap(I.loc(lang, b.bmap[res.bazaar]))} ${I.low(I.name(lang, b.pmap[res.product]))}: ${I.perUnit(t, lang, b.pmap[res.product], res.cell.price)} (${conf})`;
  }

  setAlert(pid, limit) {
    const { b, lang, t } = this;
    const [items, notes] = b.addAlert(this.uid, pid, limit);
    b.setPending(this.uid, null);
    const p = b.product(pid);
    const below = items.find((a) => a.product === p.id).below;
    const screen = this.v.alerts(lang, items, b.me(this.uid).digest, b.pmap);
    b.notify(notes);
    return { ...screen, html: `${t(lang, 'al.set', { product: I.low(I.name(lang, p)), limit: new I.Raw(I.money(t, lang, below)) })}\n\n${screen.html}` };
  }

  route(data) { // eslint-disable-line complexity
    const found = PATTERNS.map(([n, rx]) => [n, rx.exec(data)]).find(([, m]) => m);
    if (!found) return { error: this.t(this.lang, 'bot.stale') };
    const [kind, m] = found;
    const g = m.slice(1);
    const { b, v, uid, t } = this;
    const L = this.lang;
    switch (kind) {
      case 'menu': b.setPending(uid, null); return this.menuScreen();
      case 'lang': b.setLang(uid, L === 'uz' ? 'ru' : 'uz'); this.onLangChange?.(this.lang); return this.menuScreen();
      case 'bazaars': return v.pickBazaar(L, b.bazaars, 'r', t(L, 'rep.pick_bazaar'));
      case 'products': { const bz = b.bazaar(g[0]); return v.pickProduct(L, b.products, `r:${bz.id}`, t(L, 'rep.pick_product', { bazaar: I.name(L, bz) }), 'r', bz.none); }
      case 'ask': return this.askScreen(g[0], g[1]);
      case 'confirm': {
        const [out, notes] = b.confirm(uid, g[0], g[1]);
        b.setPending(uid, { kind: 'photo', report: out.report });
        b.notify(notes);
        return v.afterReport(L, out, b.bmap[out.bazaar], b.pmap[out.product]);
      }
      case 'cheapPick': return v.pickProduct(L, b.products, 'c', t(L, 'cheap.pick'));
      case 'cheap': return this.cheapScreen(g[0]);
      case 'listClear': b.setList(uid, []); return v.shopping(L, [], b.pmap);
      case 'list': return v.shopping(L, b.getList(uid), b.pmap);
      case 'listPick': return v.pickProduct(L, b.products, 'la', t(L, 'list.pick'), 'l');
      case 'listAmount': return v.listAmount(L, b.product(g[0]), b.getList(uid).find((x) => x.product === g[0])?.qty ?? null);
      case 'listPut': return v.shopping(L, b.listPut(uid, g[0], Number(g[1])), b.pmap);
      case 'listCalc': return v.listResult(L, b.basketFor(uid), b.pmap, b.bmap);
      case 'alertDel': b.removeAlert(uid, Number(g[0])); return v.alerts(L, b.alerts(uid), b.me(uid).digest, b.pmap);
      case 'digest': b.setDigest(uid, !b.me(uid).digest); return v.alerts(L, b.alerts(uid), b.me(uid).digest, b.pmap);
      case 'alerts': return v.alerts(L, b.alerts(uid), b.me(uid).digest, b.pmap);
      case 'alertPick': return v.pickProduct(L, b.products, 'an', t(L, 'al.pick'), 'a');
      case 'alertAsk': {
        const p = b.product(g[0]);
        b.setPending(uid, { kind: 'alert', product: p.id });
        return v.alertAsk(L, p, whereCheap(p.id, b.cells(), b.bazaars, b.today()), b.bmap);
      }
      case 'alertSet': return this.setAlert(g[0], Number(g[1]));
      case 'week': return v.week(L, b.week(), b.pmap, this.site);
      case 'queue': return this.queueScreen();
      case 'hide': {
        const [res, notes] = b.hide(uid, Number(g[0]));
        b.notify(notes);
        return this.queueScreen(t(L, 'mod.hidden', { who: res.who, before: res.before, after: res.after, line: new I.Raw(I.escapeHtml(this.pairLine(res))) }));
      }
      default: {
        const [res, notes] = b.ban(uid, Number(g[0]));
        b.notify(notes);
        return this.queueScreen(t(L, 'mod.banned', { who: res.who, n: res.n }));
      }
    }
  }

  press(id, data) {
    const s = String(data).slice(0, 64);
    const keep = s.startsWith('+'); // a receipt's button ("Rahmat!" stays): answer with a new message, don't edit it
    const screen = this.guard(() => this.route(keep ? s.slice(1) : s));
    if (screen?.error) this.onAlert(strip(screen.error));
    else if (screen) {
      if (keep) this.push(screen);
      else this.show(id, screen);
    }
  }

  /** A typed message: a price or an alert's limit when the bot has just asked for one, otherwise a gentle hint. */
  type(text) {
    this.push({ html: I.escapeHtml(text) }, 'me');
    const { b, uid, v } = this;
    const pend = b.pending(uid);
    const screen = this.guard(() => {
      if (pend?.kind === 'price') {
        const [out, notes] = b.submit(uid, pend.bazaar, pend.product, text.slice(0, 40));
        b.setPending(uid, { kind: 'photo', report: out.report });
        b.notify(notes);
        return v.afterReport(this.lang, out, b.bmap[out.bazaar], b.pmap[out.product]);
      }
      if (pend?.kind === 'alert') return this.setAlert(pend.product, text.slice(0, 40));
      const m = this.menuScreen();
      return { ...m, html: `${this.t(this.lang, 'bot.unknown')}\n\n${m.html}` };
    });
    if (screen?.error) return this.push({ html: screen.error });
    return this.push(screen);
  }

  /** The price tag's photo, right after a report. */
  photo() {
    const pend = this.b.pending(this.uid);
    this.push({ html: '📷' }, 'me');
    if (pend?.kind !== 'photo') return this.push(this.menuScreen());
    this.b.setPhoto(this.uid, pend.report, 'demo-photo');
    this.b.setPending(this.uid, null);
    return this.push({ html: this.t(this.lang, 'rep.photo_ok'), kb: [[{ text: this.t(this.lang, 'btn.again'), data: '+r' }, { text: this.t(this.lang, 'btn.menu'), data: '+m' }]] });
  }

  /** A message the bot sends on its own (a note from the backend). */
  deliver(note) {
    const { b, t } = this;
    const L = this.lang;
    if (note.kind === 'alert') {
      const p = b.pmap[note.product];
      return this.push({ html: I.alertText(t, L, p, b.bmap[note.bazaar], note.price, note.below),
        kb: [[{ text: t(L, 'btn.cheap'), data: `c:${p.id}` }], [{ text: t(L, 'btn.menu'), data: 'm' }]] });
    }
    if (note.kind === 'mod') {
      const r = b.reportView(note.report);
      if (!r || r.hidden || r.banned) return null;
      const item = this.v.modItem(L, r, b.pmap, b.bmap);
      return this.push({ html: `🛡 ${item.html}`, kb: item.kb });
    }
    return null;
  }
}
