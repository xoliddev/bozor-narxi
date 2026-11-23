// Bozorlik ro'yxati: pick products and amounts, see the total at every bazaar today, the cheapest one and the saving
// against the dearest, how far each is (with the reader's location, if they allow it), and honestly which items have
// no price at a bazaar. The same core function as the bot (shared/basket.js).
import { basket } from '../shared/basket.js';
import { amount, bestText, km } from '../shared/i18n.js';
import { h, toast } from './util.js';

const DEFAULT_QTY = { kg: 10, l: 10, ten: 10 };

export function pageList(ctx) {
  const state = { items: [], here: null, loaded: false, locating: false, note: '' };
  const title = h('h1');
  const lead = h('p', { class: 'lead' });
  const box = h('div', { class: 'litems', 'data-testid': 'list-items' });
  const addTitle = h('h2');
  const add = h('div', { class: 'ladd', 'data-testid': 'list-add' });
  const result = h('section', { class: 'card lresult', 'data-testid': 'list-result' });
  const el = h('div', { class: 'page page-list' }, h('section', { class: 'hero' }, title, lead),
    h('div', { class: 'list-grid' }, h('section', { class: 'card' }, box, addTitle, add), result));

  async function save() {
    try {
      state.items = await ctx.list.save(state.items);
    } catch (e) {
      toast(ctx.root, ctx.P('err.list'), 'bad');
    }
  }

  function setQty(pid, qty) {
    const p = ctx.pmap[pid];
    const q = Math.max(0, Math.min(500, qty));
    state.items = q ? state.items.map((x) => (x.product === pid ? { ...x, qty: q - (q % p.step) } : x)) : state.items.filter((x) => x.product !== pid);
    paint();
    save();
  }

  function paintItems() {
    box.replaceChildren(...state.items.map((it) => {
      const p = ctx.pmap[it.product];
      return h('div', { class: 'litem', 'data-testid': `item-${p.id}` }, h('span', { class: 'lname' }, ctx.name(p)),
        h('span', { class: 'stepper' },
          h('button', { type: 'button', 'aria-label': ctx.P('site.less'), 'data-testid': `less-${p.id}`, onclick: () => setQty(p.id, it.qty - p.step) }, '−'),
          h('b', { 'data-testid': `qty-${p.id}` }, amount(ctx.T, ctx.lang, p, it.qty)),
          h('button', { type: 'button', 'aria-label': ctx.P('site.more'), 'data-testid': `more-${p.id}`, onclick: () => setQty(p.id, it.qty + p.step) }, '+')),
        h('button', { type: 'button', class: 'lremove', 'aria-label': ctx.P('site.remove'), onclick: () => setQty(p.id, 0) }, '×'));
    }), state.items.length ? null : h('p', { class: 'empty' }, ctx.P('site.list_empty')));
    const have = new Set(state.items.map((x) => x.product));
    addTitle.textContent = ctx.P('site.list_add');
    add.replaceChildren(...ctx.products.filter((p) => !have.has(p.id)).map((p) => h('button', { type: 'button', class: 'chip', 'data-testid': `add-${p.id}`,
      disabled: state.items.length >= 20, onclick: () => {
        state.items = [...state.items, { product: p.id, qty: DEFAULT_QTY[p.unit] }];
        paint();
        save();
      } }, `+ ${ctx.name(p)}`)));
  }

  function paintResult() {
    const { snap } = ctx;
    const res = basket(state.items, snap.cells, ctx.bazaars, snap.today, state.here);
    const locate = ctx.geo || navigator.geolocation ? h('button', { type: 'button', class: 'btn ghost', 'data-testid': 'locate', disabled: state.locating,
      onclick: locateMe }, state.here ? ctx.P('site.located') : state.locating ? ctx.P('site.locating') : ctx.P('site.locate')) : null;
    if (!state.items.length) {
      result.replaceChildren(h('h2', {}, ctx.P('site.list_where')), h('p', { class: 'empty' }, ctx.P('site.list_empty')));
      return;
    }
    const row = (r, i, top) => h('div', { class: `lrow${top ? ' top' : ''}`, 'data-testid': `total-${r.bazaar}` },
      h('span', { class: 'ri' }, String(i + 1)), ctx.link(`b/${r.bazaar}`, { class: 'rname' }, ctx.name(ctx.bmap[r.bazaar])),
      h('b', {}, ctx.money(r.total)), 'dist' in r ? h('span', { class: 'ldist' }, km(ctx.T, ctx.lang, r.dist)) : null,
      r.missing.length ? h('small', { class: 'lmiss' }, `⚠️ ${ctx.P('site.list_missing', { items: r.missing.map((x) => ctx.name(ctx.pmap[x]).toLowerCase()).join(', ') })}`) : null);
    const full = res.rows.filter((r) => !r.missing.length);
    const part = res.rows.filter((r) => r.missing.length);
    result.replaceChildren(h('h2', {}, ctx.P('site.list_where')),
      res.best ? h('p', { class: 'lbest', 'data-testid': 'list-best' }, `✅ ${bestText(ctx.T, ctx.lang, ctx.bmap[res.best], res.best_total, res.saving)}`)
        : h('p', { class: 'lbest none', 'data-testid': 'list-best' }, ctx.P('list.no_best')),
      locate, state.note ? h('p', { class: 'muted' }, state.note) : null,
      h('div', { class: 'lrows' }, full.map((r, i) => row(r, i, r.bazaar === res.best))),
      part.length ? h('p', { class: 'lpart' }, ctx.P('site.list_partial')) : null,
      part.length ? h('div', { class: 'lrows part', 'data-testid': 'list-partial' }, part.map((r, i) => row(r, full.length + i, false))) : null);
  }

  async function locateMe() {
    state.locating = true;
    state.note = '';
    paintResult();
    try {
      state.here = ctx.geo ? await ctx.geo() : await new Promise((ok, fail) => navigator.geolocation.getCurrentPosition(
        (pos) => ok([pos.coords.latitude, pos.coords.longitude]), fail, { timeout: 8000, maximumAge: 600_000 }));
    } catch {
      state.note = ctx.P('site.locate_fail');
    }
    state.locating = false;
    paintResult();
  }

  function paint() {
    title.textContent = ctx.P('site.list_title');
    lead.textContent = ctx.P('site.list_lead');
    paintItems();
    paintResult();
  }

  async function update() {
    if (!state.loaded) {
      state.items = await ctx.list.load();
      state.loaded = true;
    }
    paint();
  }

  return { el, update, setItems: async (items) => { state.items = items; await save(); paint(); }, get items() { return state.items; } };
}
