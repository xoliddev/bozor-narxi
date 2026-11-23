// JS port of bozornarxi/bot/views.py: the bot's screens as {html, kb} so the simulated bot in the demo reads and
// behaves exactly like the real one (the same texts, buttons and callback data).
import { hhmm, localMinute } from '../shared/clock.js';
import * as I from '../shared/i18n.js';
import { confidence, digest } from '../shared/prices.js';
import { roundTo } from '../shared/trust.js';

const { Raw } = I;
const AMOUNTS = { kg: [5, 10, 15, 20, 30, 50], l: [10, 20, 30, 50], ten: [10, 20, 30, 50] };
const grid = (items, per = 2) => Array.from({ length: Math.ceil(items.length / per) }, (_, i) => items.slice(i * per, i * per + per));

export function makeViews(t) {
  const back = (lang, data = 'm') => [{ text: t(lang, 'btn.back'), data }];
  const money = (lang, n) => I.money(t, lang, n);
  return {
    back,
    menu(lang, me, today, week, products, site = '', app = true) {
      const dg = digest(week);
      const pmap = Object.fromEntries(products.map((p) => [p.id, p]));
      const best = dg.down.length ? `${t(lang, 'wk.down')}: ${dg.down.map(([pid, pct]) => I.changeLine(lang, pmap[pid], pct)).join(', ')}` : '';
      const kb = [[{ text: t(lang, 'btn.report'), data: 'r' }], [{ text: t(lang, 'btn.cheap'), data: 'c' }, { text: t(lang, 'btn.list'), data: 'l' }],
        [{ text: t(lang, 'btn.alerts'), data: 'a' }, { text: t(lang, 'btn.week'), data: 'w' }]];
      if (app) kb.push([{ text: t(lang, 'btn.app'), app: '' }]);
      if (site) kb.push([{ text: t(lang, 'btn.site'), url: site }]);
      if (me.mod) kb.push([{ text: t(lang, 'btn.mod'), data: 'q' }]);
      kb.push([{ text: t(lang, 'btn.lang'), data: 'lang' }]);
      return { html: t(lang, 'bot.menu', { date: I.dateShort(t, lang, today), best: new Raw(best) }), kb };
    },
    pickBazaar(lang, bazaars, prefix, title) {
      return { html: title, kb: [...grid(bazaars.map((b) => ({ text: I.name(lang, b), data: `${prefix}:${b.id}` }))), back(lang)] };
    },
    pickProduct(lang, products, prefix, title, backTo = 'm', skip = []) {
      return { html: title, kb: [...grid(products.filter((p) => !skip.includes(p.id)).map((p) => ({ text: I.name(lang, p), data: `${prefix}:${p.id}` }))),
        back(lang, backTo)] };
    },
    askPrice(lang, b, p, cell, now, today) {
      const head = { bazaar: I.name(lang, b), product: I.name(lang, p), unit: t(lang, `unit_long.${p.unit}`), example: cell ? cell.price : p.base };
      if (!cell) return { html: t(lang, 'rep.ask_none', head), kb: [back(lang, `r:${b.id}`)] };
      const html = t(lang, 'rep.ask', { ...head, price: new Raw(I.perUnit(t, lang, p, cell.price)), conf: new Raw(I.confText(t, lang, confidence(cell, now, today))) });
      return { html, kb: [[{ text: t(lang, 'btn.confirm', { price: new Raw(money(lang, cell.price)) }), data: `ok:${b.id}:${p.id}` }], back(lang, `r:${b.id}`)] };
    },
    afterReport(lang, out, b, p) {
      const kb = [[{ text: t(lang, 'btn.again'), data: `+r:${b.id}` }, { text: t(lang, 'btn.menu'), data: '+m' }]];
      if (out.status === 'review') return { html: t(lang, 'say.review'), kb };
      const lines = [I.thanks(t, lang, b, p, out.cell)];
      if (out.replaced) lines.push(t(lang, 'rep.replaced'));
      lines.push(t(lang, 'rep.photo_hint'));
      return { html: lines.join('\n\n'), kb };
    },
    cheap(lang, p, wc, change, spark, bmap, site = '') {
      const kb = [[{ text: t(lang, 'btn.alert_this'), data: `an:${p.id}` }]];
      if (site) kb.push([{ text: t(lang, 'btn.chart'), url: `${site}#/p/${p.id}` }]);
      kb.push(back(lang, 'c'));
      if (!wc.rows.length) return { html: `<b>${I.escapeHtml(I.name(lang, p))}</b>\n${t(lang, 'cheap.none')}`, kb };
      const head = t(lang, 'cheap.title', { product: I.name(lang, p), unit: t(lang, `unit_long.${p.unit}`), city: new Raw(money(lang, wc.city)),
        change: new Raw(I.changeText(t, lang, change) || '—') });
      const best = wc.rows[0];
      const lines = [head, '', `✅ ${I.cheapLine(t, lang, bmap[best.bazaar], p, best)}`, '',
        ...wc.rows.map((r, i) => t(lang, 'cheap.row', { i: i + 1, bazaar: I.name(lang, bmap[r.bazaar]), price: new Raw(money(lang, r.price)),
          short: new Raw(I.shortSaving(t, lang, r)) }))];
      if (spark) lines.push('', t(lang, 'cheap.spark', { line: spark }));
      return { html: lines.join('\n'), kb };
    },
    shopping(lang, items, pmap) {
      const lines = [t(lang, 'list.title'), '', ...items.map((x) => t(lang, 'list.item', { product: I.name(lang, pmap[x.product]),
        amount: new Raw(I.amount(t, lang, pmap[x.product], x.qty)) }))];
      if (!items.length) lines.push(t(lang, 'list.empty'));
      const kb = [[{ text: t(lang, 'btn.add'), data: 'la' }]];
      if (items.length) {
        kb[0].push({ text: t(lang, 'btn.calc'), data: 'lc' });
        kb.push([{ text: t(lang, 'btn.clear'), data: 'lx' }]);
      }
      kb.push(back(lang));
      return { html: lines.join('\n'), kb };
    },
    listAmount(lang, p, current) {
      const opts = AMOUNTS[p.unit].filter((q) => q % p.step === 0);
      const kb = grid(opts.map((q) => ({ text: (q === current ? '• ' : '') + I.amount(t, lang, p, q), data: `lq:${p.id}:${q}` })), 3);
      if (current) kb.push([{ text: t(lang, 'btn.remove'), data: `lq:${p.id}:0` }]);
      kb.push(back(lang, 'la'));
      return { html: t(lang, 'list.amount', { product: I.name(lang, p) }), kb };
    },
    listResult(lang, res, pmap, bmap) {
      const lines = [t(lang, 'list.result', { count: res.items.length }), '',
        res.best ? `✅ ${I.bestText(t, lang, bmap[res.best], res.best_total, res.saving)}` : t(lang, 'list.no_best'), ''];
      res.rows.forEach((r, i) => {
        let line = t(lang, 'list.row', { i: i + 1, bazaar: I.name(lang, bmap[r.bazaar]), total: new Raw(money(lang, r.total)) });
        if ('dist' in r) line += ` · ${I.km(t, lang, r.dist)}`;
        if (r.missing.length) line += `\n    ⚠️ ${t(lang, 'list.missing', { items: r.missing.map((x) => I.name(lang, pmap[x]).toLowerCase()).join(', ') })}`;
        lines.push(line);
      });
      return { html: lines.join('\n'), kb: [[{ text: t(lang, 'btn.list'), data: 'l' }], back(lang, 'l')] };
    },
    alerts(lang, items, digestOn, pmap) {
      const open = items.filter((a) => !a.fired_at);
      const lines = [t(lang, 'al.title'), '', ...open.map((a) => t(lang, 'al.item', { product: I.name(lang, pmap[a.product]), limit: new Raw(money(lang, a.below)) }))];
      if (!open.length) lines.push(t(lang, 'al.none'));
      const kb = [...open.map((a) => [{ text: t(lang, 'btn.unalert', { product: I.name(lang, pmap[a.product]) }), data: `ad:${a.id}` }]),
        [{ text: t(lang, 'btn.new_alert'), data: 'an' }], [{ text: t(lang, digestOn ? 'btn.digest_on' : 'btn.digest_off'), data: 'dg' }], back(lang)];
      return { html: lines.join('\n'), kb };
    },
    alertAsk(lang, p, wc, bmap) {
      const best = wc.rows[0] ?? null;
      const line = best ? I.cheapLine(t, lang, bmap[best.bazaar], p, best) : t(lang, 'cheap.none');
      const top = best ? best.price : p.base;
      const opts = [...new Set([95, 90, 85].map((k) => roundTo(Math.floor((top * k) / 100), p.round)))].filter((x) => x !== top).sort((a, b) => b - a);
      return { html: t(lang, 'al.ask', { product: I.name(lang, p), best: new Raw(line) }),
        kb: [opts.map((x) => ({ text: t(lang, 'al.btn', { price: new Raw(money(lang, x)) }), data: `as:${p.id}:${x}` })), back(lang, 'an')] };
    },
    week(lang, changes, pmap, site = '') {
      const dg = digest(changes, 5);
      const lines = [`📊 <b>${t(lang, 'site.week_title')}</b>`, t(lang, 'wk.note'), ''];
      for (const [k, items] of [['wk.down', dg.down], ['wk.up', dg.up]]) {
        if (items.length) lines.push(`${k === 'wk.down' ? '⬇️' : '⬆️'} <b>${t(lang, k)}</b>`, ...items.map(([pid, pct]) => I.changeLine(lang, pmap[pid], pct)), '');
      }
      if (!dg.down.length && !dg.up.length) lines.push(t(lang, 'wk.none'));
      return { html: lines.join('\n').trim(), kb: [...(site ? [[{ text: t(lang, 'btn.site'), url: `${site}#/week` }]] : []), back(lang)] };
    },
    modItem(lang, r, pmap, bmap) {
      const p = pmap[r.product];
      const html = t(lang, 'mod.item', { bazaar: I.name(lang, bmap[r.bazaar]), product: I.name(lang, p), price: new Raw(I.perUnit(t, lang, p, r.price)),
        ref: new Raw(r.ref ? money(lang, r.ref) : '—'), who: r.who, trust: r.trust, time: hhmm(localMinute(r.at)) });
      return { html, kb: [[{ text: t(lang, 'btn.hide'), data: `qh:${r.id}` }, { text: t(lang, 'btn.ban'), data: `qb:${r.user}` }]] };
    },
  };
}
