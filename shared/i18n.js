// JS port of bozornarxi/i18n.py: locale templates with escaped params and the sentences every screen needs, so the
// website, the Mini App and the demo's bot read exactly like the real bot ("Chorsuda kartoshka 4 500 so'm — shahar
// o'rtachasidan 13% arzon").
import { civil } from './clock.js';

export const MINUS = '−';

export class Raw {
  constructor(html) {
    this.html = String(html);
  }

  toString() {
    return this.html;
  }
}

export const escapeHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function render(template, params = {}) {
  return template.replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in params)) return m;
    const v = params[k];
    return v instanceof Raw ? v.html : escapeHtml(v);
  });
}

export const normLang = (code) => (code && String(code).slice(0, 2).toLowerCase() === 'ru' ? 'ru' : 'uz');

export function makeT(catalogs) {
  return (lang, key, params) => {
    const l = normLang(lang);
    const template = catalogs[l]?.[key] || catalogs.uz?.[key] || key;
    return render(template, params);
  };
}

export const cap = (s) => s.slice(0, 1).toUpperCase() + s.slice(1);
export const low = (s) => s.slice(0, 1).toLowerCase() + s.slice(1);

export function group(n) {
  let s = String(Math.abs(n));
  let out = '';
  while (s.length > 3) {
    out = ` ${s.slice(-3)}${out}`;
    s = s.slice(0, -3);
  }
  return (n < 0 ? '-' : '') + s + out;
}

export const money = (t, lang, n) => t(lang, 'fmt.money', { n: group(n) });

export function dateShort(t, lang, day) {
  const [, m, d] = civil(day);
  return t(lang, 'fmt.day', { d, month: t(lang, `month.${m}`) });
}

export const name = (lang, item) => (normLang(lang) === 'ru' ? item.ru : item.uz);
export const loc = (lang, bazaar) => (normLang(lang) === 'ru' ? bazaar.ru_loc : bazaar.uz_loc);
export const unit = (t, lang, product) => t(lang, `unit.${product.unit}`);
export const perUnit = (t, lang, product, price) => t(lang, 'fmt.per', { money: new Raw(money(t, lang, price)), unit: new Raw(unit(t, lang, product)) });

export function amount(t, lang, product, qty) {
  if (product.unit === 'ten') return t(lang, 'fmt.pieces', { n: qty });
  const whole = Math.floor(qty / 10);
  const tenth = qty % 10;
  return t(lang, 'fmt.amount', { n: tenth ? `${whole},${tenth}` : String(whole), unit: new Raw(unit(t, lang, product)) });
}

export function ago(t, lang, conf) {
  if (conf.days === 1) return t(lang, 'ago.yesterday');
  if (conf.days > 1) return t(lang, 'ago.days', { n: conf.days });
  if (conf.ago < 1) return t(lang, 'ago.now');
  if (conf.ago < 60) return t(lang, 'ago.min', { n: conf.ago });
  return t(lang, 'ago.hour', { n: Math.floor(conf.ago / 60) });
}

export const confText = (t, lang, conf) => t(lang, conf.level === 'low' ? 'conf.low' : 'conf.n', { n: conf.n, ago: new Raw(ago(t, lang, conf)) });

export function savingText(t, lang, s) {
  if (s.pct > 0) return t(lang, 'save.cheaper', { pct: s.pct });
  if (s.pct < 0) return t(lang, 'save.dearer', { pct: -s.pct });
  return t(lang, 'save.same');
}

export const signed = (pct) => (pct < 0 ? `${MINUS}${-pct}%` : pct > 0 ? `+${pct}%` : '0%');

export function changeText(t, lang, pct) {
  if (pct === null || pct === undefined) return '';
  if (pct === 0) return t(lang, 'chg.flat');
  return t(lang, pct < 0 ? 'chg.down' : 'chg.up', { pct: Math.abs(pct) });
}

export const thanks = (t, lang, bazaar, product, cell) => t(lang, 'say.thanks', { loc: new Raw(cap(loc(lang, bazaar))), product: low(name(lang, product)),
  price: new Raw(money(t, lang, cell.price)), n: cell.n });

export const cheapLine = (t, lang, bazaar, product, row) => cap(t(lang, 'say.cheap', { loc: new Raw(loc(lang, bazaar)), product: low(name(lang, product)),
  price: new Raw(money(t, lang, row.price)), saving: new Raw(savingText(t, lang, row)) }));

export const bestText = (t, lang, bazaar, total, saving) => cap(t(lang, saving > 0 ? 'say.best' : 'say.best_one', { loc: new Raw(loc(lang, bazaar)),
  total: new Raw(money(t, lang, total)), saving: new Raw(money(t, lang, saving)) }));

export function km(t, lang, metres) {
  if (metres < 1000) return t(lang, 'fmt.m', { n: metres });
  const whole = Math.floor(metres / 1000);
  const rest = metres % 1000;
  return t(lang, 'fmt.km', { n: rest ? `${whole},${Math.floor(rest / 100)}` : String(whole) });
}

export const alertText = (t, lang, product, bazaar, price, limit) => t(lang, 'say.alert', { product: name(lang, product), loc: new Raw(loc(lang, bazaar)),
  price: new Raw(perUnit(t, lang, product, price)), limit: new Raw(money(t, lang, limit)) });

export const changeLine = (lang, product, pct) => `${escapeHtml(low(name(lang, product)))} ${signed(pct)}`;

export function shortSaving(t, lang, s) {
  if (s.pct > 0) return t(lang, 'short.cheaper', { pct: s.pct });
  if (s.pct < 0) return t(lang, 'short.dearer', { pct: -s.pct });
  return t(lang, 'short.same');
}
