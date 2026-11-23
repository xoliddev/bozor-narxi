// Today's prices: the three everyday products' cheapest bazaar, what got cheaper this week, and the table of every
// product (search and category) with the city median, the cheapest bazaar and the weekly change. A number that changed
// since the last refresh flashes once.
import { confText, changeText, dateShort, changeLine, shortSaving } from '../shared/i18n.js';
import { confidence, digest, whereCheap } from '../shared/prices.js';
import { fill, h } from './util.js';

const FEATURED = ['kartoshka', 'piyoz', 'mol'];
const CATS = ['all', 'gosht', 'sabzavot', 'meva', 'oziq'];

export function pageToday(ctx) {
  const state = { q: '', cat: 'all' };
  const prev = new Map();
  const title = h('h1');
  const lead = h('p', { class: 'lead', 'data-testid': 'site-lead' });
  const cards = h('div', { class: 'best-cards' });
  const strip = h('div', { class: 'week-strip' });
  const search = h('input', { type: 'search', class: 'search', 'data-testid': 'search', autocomplete: 'off', maxlength: 40,
    oninput: () => { state.q = search.value.trim().toLowerCase(); paintTable(); } });
  const chips = h('div', { class: 'chips', role: 'tablist' });
  const table = h('div', { class: 'ptable', 'data-testid': 'price-table' });
  const el = h('div', { class: 'page page-today' }, h('section', { class: 'hero' }, title, lead), cards, strip,
    h('div', { class: 'tools' }, search, chips), table);
  let rows = {};

  const flash = (node, key, value) => {
    if (prev.has(key) && prev.get(key) !== value) {
      node.classList.remove('flash');
      void node.offsetWidth; // restart the animation
      node.classList.add('flash');
    }
    prev.set(key, value);
  };

  function paintCards() {
    const { snap } = ctx;
    fill(cards, ...FEATURED.map((pid) => {
      const p = ctx.pmap[pid];
      const wc = rows[pid];
      const best = wc.rows[0];
      const card = ctx.link(`p/${pid}`, { class: 'best-card', 'data-testid': `best-${pid}` },
        h('span', { class: 'best-label' }, best ? ctx.P('say.best_at', { product: ctx.name(p), bazaar: ctx.name(ctx.bmap[best.bazaar]) }) : ctx.name(p)),
        h('b', { class: 'best-price', 'data-testid': `best-price-${pid}` }, best ? ctx.per(p, best.price) : ctx.P('site.no_data')),
        best ? h('span', { class: 'best-save' }, `${shortSaving(ctx.T, ctx.lang, best)} · ${ctx.P('site.col_city')}: ${ctx.money(wc.city)}`) : null,
        best ? h('span', { class: `conf lv-${best.level}`, 'data-testid': `best-conf-${pid}` }, confText(ctx.T, ctx.lang, confidence(best, ctx.now(), snap.today))) : null);
      if (best) flash(card, `card:${pid}`, `${best.bazaar}:${best.price}:${best.n}`);
      return card;
    }));
  }

  function paintTable() {
    const { snap } = ctx;
    const list = ctx.products.filter((p) => (state.cat === 'all' || p.cat === state.cat)
      && (!state.q || ctx.name(p).toLowerCase().includes(state.q) || p.uz.toLowerCase().includes(state.q)));
    const head = h('div', { class: 'prow head' }, ['site.col_product', 'site.col_city', 'site.col_best', 'site.col_week'].map((k) => h('span', {}, ctx.P(k))));
    fill(table, head, ...list.map((p) => {
      const wc = rows[p.id];
      const best = wc.rows[0];
      const pct = snap.week[p.id];
      const row = ctx.link(`p/${p.id}`, { class: 'prow', 'data-testid': `row-${p.id}` },
        h('span', { class: 'pname' }, h('b', {}, ctx.name(p)), h('small', {}, ctx.P(`unit_long.${p.unit}`))),
        h('span', { class: 'pcity', 'data-label': ctx.P('site.col_city') }, wc.city ? ctx.money(wc.city) : ctx.P('site.no_data')),
        h('span', { class: 'pbest', 'data-label': ctx.P('site.col_best'), 'data-testid': `row-best-${p.id}` },
          best ? [h('b', {}, ctx.money(best.price)), ' ', h('small', {}, ctx.name(ctx.bmap[best.bazaar]))] : '—'),
        h('span', { class: `pweek ${pct < 0 ? 'down' : pct > 0 ? 'up' : ''}`, 'data-label': ctx.P('site.col_week') }, changeText(ctx.T, ctx.lang, pct) || '—'));
      flash(row, `row:${p.id}`, `${wc.city}:${best?.price}`);
      return row;
    }), list.length ? null : h('p', { class: 'empty' }, ctx.P('site.nothing')));
  }

  function update() {
    const { snap } = ctx;
    rows = Object.fromEntries(ctx.products.map((p) => [p.id, whereCheap(p.id, snap.cells, ctx.bazaars, snap.today)]));
    title.textContent = ctx.P('site.tagline');
    lead.textContent = ctx.P('site.lead', { date: dateShort(ctx.T, ctx.lang, snap.today), n: ctx.bazaars.length });
    search.placeholder = ctx.P('site.search');
    fill(chips, ...CATS.map((c) => h('button', { type: 'button', class: `chip${state.cat === c ? ' on' : ''}`, 'data-testid': `cat-${c}`,
      onclick: () => { state.cat = c; update(); } }, ctx.P(`cat.${c}`))));
    const dg = digest(snap.week);
    fill(strip, dg.down.length ? ctx.link('week', { class: 'week-link', 'data-testid': 'week-strip' }, '📉 ',
      `${ctx.P('wk.down')}: ${dg.down.map(([pid, pct]) => changeLine(ctx.lang, ctx.pmap[pid], pct)).join(', ')}`) : '');
    paintCards();
    paintTable();
  }

  return { el, update };
}
