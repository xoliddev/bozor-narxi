// This week against the last one: what got cheaper and what got dearer (the city price, the same numbers as the bot's
// weekly digest), every product with a bar.
import { changeLine } from '../shared/i18n.js';
import { digest } from '../shared/prices.js';
import { fill, h } from './util.js';

export function pageWeek(ctx) {
  const title = h('h1');
  const lead = h('p', { class: 'lead' });
  const cols = h('div', { class: 'week-cols' });
  const el = h('div', { class: 'page page-week', 'data-testid': 'week' }, h('section', { class: 'hero' }, title, lead), cols);
  function update() {
    const { snap } = ctx;
    title.textContent = ctx.P('site.week_title');
    lead.textContent = ctx.P('site.week_lead');
    const dg = digest(snap.week, ctx.products.length);
    const top = Math.max(1, ...Object.values(snap.week).filter((x) => x !== null).map(Math.abs));
    const col = (key, items, kind) => h('section', { class: `card wcol ${kind}`, 'data-testid': `week-${kind}` }, h('h2', {}, ctx.P(key)),
      items.length ? items.map(([pid, pct], i) => ctx.link(`p/${pid}`, { class: 'wrow', 'data-testid': `week-${kind}-${i}` },
        h('span', { class: 'wname' }, changeLine(ctx.lang, ctx.pmap[pid], pct)),
        h('span', { class: 'wbar' }, h('i', { style: { width: `${Math.max(6, (Math.abs(pct) / top) * 100)}%` } })))) : h('p', { class: 'empty' }, ctx.P('wk.none')));
    fill(cols, col('wk.down', dg.down, 'down'), col('wk.up', dg.up, 'up'));
  }
  return { el, update };
}
