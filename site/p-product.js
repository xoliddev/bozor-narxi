// One product: "qayerda arzon?" (today's price at every bazaar, ranked, against the city median, with how sure we
// are), the price-change chart for 30 or 90 days with any bazaar switched on, and the alert button.
import { changeText, cheapLine, confText, shortSaving } from '../shared/i18n.js';
import { confidence, whereCheap } from '../shared/prices.js';
import { chart } from './chart.js';
import { COLORS, fill, h } from './util.js';

export function pageProduct(ctx, pid) {
  const p = ctx.pmap[pid];
  if (!p) return { el: h('p', { class: 'empty' }, ctx.P('err.not_found')), update: () => {} };
  const state = { days: 30, sel: null, series: null };
  const head = h('div', { class: 'phead' });
  const headline = h('p', { class: 'headline', 'data-testid': 'product-headline' });
  const stats = h('div', { class: 'stats' });
  const chartBox = h('div', { class: 'chart-box' });
  const toggles = h('div', { class: 'btoggles', role: 'group' });
  const range = h('div', { class: 'seg', role: 'tablist' });
  const legend = h('div', { class: 'legend' });
  const chartTitle = h('h2');
  const rankTitle = h('h2');
  const rank = h('div', { class: 'rank', 'data-testid': 'rank' });
  const cta = h('div', { class: 'cta' });
  const el = h('div', { class: 'page page-product', 'data-testid': `product-${pid}` }, ctx.link('', { class: 'back' }, ''), head, headline, stats,
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, rankTitle), rank, cta),
    h('section', { class: 'card' }, h('div', { class: 'card-head' }, chartTitle, range), legend, chartBox, toggles));

  async function loadSeries() {
    const res = await ctx.api.history(pid, state.days);
    state.series = res.series;
    return res;
  }

  function paintChart(wc, today) {
    if (state.sel === null) state.sel = wc.best ? [wc.best] : [];
    const first = today - state.days + 1;
    fill(chartBox, chart({ series: state.series, first, last: today, sel: state.sel, P: ctx.P, lang: ctx.lang, money: ctx.money,
      bname: (b) => ctx.name(ctx.bmap[b]) }));
    fill(range, ...[30, 90].map((d) => h('button', { type: 'button', class: state.days === d ? 'on' : '', 'data-testid': `days-${d}`,
      onclick: async () => { state.days = d; await update(); } }, ctx.P(`site.days${d}`))));
    fill(legend, h('span', { class: 'lg city' }, ctx.P('site.city_line')), h('span', { class: 'lg band' }, ctx.P('site.band')));
    fill(toggles, h('span', { class: 'btoggle-title' }, ctx.P('site.toggle')), ...ctx.bazaars.filter((b) => !b.none.includes(pid)).map((b) => {
      const on = state.sel.includes(b.id);
      return h('button', { type: 'button', class: `btoggle${on ? ' on' : ''}`, 'aria-pressed': String(on), 'data-testid': `toggle-${b.id}`,
        style: { '--c': COLORS[b.id] }, onclick: () => {
          state.sel = on ? state.sel.filter((x) => x !== b.id) : [...state.sel, b.id];
          paintChart(wc, today);
        } }, h('i'), ctx.name(b));
    }));
  }

  async function update() {
    const { snap } = ctx;
    const today = snap.today;
    const wc = whereCheap(pid, snap.cells, ctx.bazaars, today);
    await loadSeries();
    el.firstChild.textContent = ctx.P('site.back');
    fill(head, h('h1', {}, ctx.name(p)), h('span', { class: 'unit' }, ctx.P(`unit_long.${p.unit}`)));
    const best = wc.rows[0];
    headline.textContent = best ? `✅ ${cheapLine(ctx.T, ctx.lang, ctx.bmap[best.bazaar], p, best)}` : ctx.P('cheap.none');
    const pct = snap.week[pid];
    fill(stats, 
      h('div', { class: 'stat' }, h('span', {}, ctx.P('site.col_city')), h('b', { 'data-testid': 'city' }, wc.city ? ctx.money(wc.city) : '—')),
      h('div', { class: 'stat' }, h('span', {}, ctx.P('site.col_best')), h('b', { 'data-testid': 'best' }, best ? ctx.money(best.price) : '—')),
      h('div', { class: `stat ${pct < 0 ? 'down' : pct > 0 ? 'up' : ''}` }, h('span', {}, ctx.P('site.col_week')),
        h('b', { 'data-testid': 'week' }, changeText(ctx.T, ctx.lang, pct) || '—')));
    rankTitle.textContent = ctx.P('site.where');
    chartTitle.textContent = ctx.P('site.chart');
    fill(rank, ...wc.rows.map((r, i) => h('div', { class: `rrow${i === 0 ? ' top' : ''}`, 'data-testid': `rank-${r.bazaar}` },
      h('span', { class: 'ri' }, String(i + 1)),
      ctx.link(`b/${r.bazaar}`, { class: 'rname' }, ctx.name(ctx.bmap[r.bazaar])),
      h('b', { class: 'rprice', 'data-testid': `price-${r.bazaar}` }, ctx.per(p, r.price)),
      h('span', { class: `rsave ${r.pct > 0 ? 'down' : r.pct < 0 ? 'up' : ''}` }, shortSaving(ctx.T, ctx.lang, r)),
      h('span', { class: `conf lv-${r.level}`, 'data-testid': `conf-${r.bazaar}` }, confText(ctx.T, ctx.lang, confidence(r, ctx.now(), today))))),
    wc.rows.length ? null : h('p', { class: 'empty' }, ctx.P('cheap.none')));
    const alertText = ctx.P('btn.alert_this');
    fill(cta, ctx.onAlert ? h('button', { type: 'button', class: 'btn', 'data-testid': 'alert-this', onclick: () => ctx.onAlert(pid) }, alertText)
      : ctx.bot ? h('a', { class: 'btn', href: `https://t.me/${ctx.bot}?start=al_${pid}`, target: '_blank', rel: 'noopener' }, alertText) : '');
    paintChart(wc, today);
  }

  return { el, update };
}
