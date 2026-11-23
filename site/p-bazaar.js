// The bazaars: a list with how many prices each has today, and one bazaar's prices against the city median.
import { confText, shortSaving } from '../shared/i18n.js';
import { confidence, fresh, whereCheap } from '../shared/prices.js';
import { fill, h } from './util.js';

export function pageBazaars(ctx) {
  const title = h('h1');
  const lead = h('p', { class: 'lead' });
  const grid = h('div', { class: 'bgrid' });
  const el = h('div', { class: 'page page-bazaars' }, h('section', { class: 'hero' }, title, lead), grid);
  function update() {
    const { snap } = ctx;
    title.textContent = ctx.P('site.bazaars_title');
    lead.textContent = ctx.P('site.bazaars_lead');
    fill(grid, ...ctx.bazaars.map((b) => {
      const n = ctx.products.filter((p) => fresh(snap.cells[b.id]?.[p.id], snap.today)).length;
      const cheapest = ctx.products.filter((p) => whereCheap(p.id, snap.cells, ctx.bazaars, snap.today).best === b.id).map((p) => ctx.name(p).toLowerCase());
      return ctx.link(`b/${b.id}`, { class: 'bcard', 'data-testid': `bazaar-${b.id}` }, h('b', {}, ctx.name(b)),
        h('span', {}, ctx.P('site.bazaar_count', { n })),
        cheapest.length ? h('small', {}, `${ctx.P('site.col_best')}: ${cheapest.slice(0, 4).join(', ')}`) : null);
    }));
  }
  return { el, update };
}

export function pageBazaar(ctx, bid) {
  const b = ctx.bmap[bid];
  if (!b) return { el: h('p', { class: 'empty' }, ctx.P('err.not_found')), update: () => {} };
  const back = ctx.link('bazaars', { class: 'back' });
  const title = h('h1');
  const lead = h('p', { class: 'lead' });
  const list = h('div', { class: 'rank', 'data-testid': 'bazaar-prices' });
  const el = h('div', { class: 'page page-bazaar' }, back, h('section', { class: 'hero' }, title, lead), h('section', { class: 'card' }, list));
  function update() {
    const { snap } = ctx;
    back.textContent = `⬅️ ${ctx.P('site.nav_bazaars')}`;
    title.textContent = ctx.P('site.bazaar_title', { bazaar: ctx.name(b) });
    lead.textContent = ctx.P('site.bazaar_lead');
    fill(list, ...ctx.products.map((p) => {
      const wc = whereCheap(p.id, snap.cells, ctx.bazaars, snap.today);
      const r = wc.rows.find((x) => x.bazaar === bid);
      return h('div', { class: `rrow${wc.best === bid ? ' top' : ''}`, 'data-testid': `bp-${p.id}` },
        ctx.link(`p/${p.id}`, { class: 'rname' }, ctx.name(p)),
        h('b', { class: 'rprice' }, r ? ctx.per(p, r.price) : ctx.P('site.no_data')),
        h('span', { class: `rsave ${r?.pct > 0 ? 'down' : r?.pct < 0 ? 'up' : ''}` }, r ? shortSaving(ctx.T, ctx.lang, r) : ''),
        h('span', { class: `conf lv-${r?.level ?? 'low'}` }, r ? confText(ctx.T, ctx.lang, confidence(r, ctx.now(), snap.today)) : ''));
    }));
  }
  return { el, update };
}
