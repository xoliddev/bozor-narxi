// The Mini App: the website's pages (prices, a product with its chart, the shopping list kept on the server and shared
// with the bot) plus alerts and, for moderators, the queue of shubhali reports. Tabs at the bottom, like an app.
import { cheapLine, money, name, perUnit } from '../shared/i18n.js';
import { whereCheap } from '../shared/prices.js';
import { hhmm, localMinute } from '../shared/clock.js';
import { mountSite } from '../site/app.js';
import { errText, fill, h, makeText, toast } from '../site/util.js';

export function mountApp(root, opts) {
  const T = makeText(opts.catalogs);
  const pmap = Object.fromEntries(opts.products.map((p) => [p.id, p]));
  const bmap = Object.fromEntries(opts.bazaars.map((b) => [b.id, b]));
  const state = { lang: opts.lang === 'ru' ? 'ru' : 'uz', me: null, tab: 'prices', alertFor: 'piyoz', alerts: [], queue: [] };
  const P = (k, p) => T(state.lang, k, p);
  const api = opts.api;
  const hello = h('b', { class: 'mapp-hello', 'data-testid': 'app-hello' });
  const langBtn = h('button', { type: 'button', class: 'mapp-lang', 'data-testid': 'app-lang', onclick: () => setLang(state.lang === 'uz' ? 'ru' : 'uz') });
  const sitePane = h('div', { class: 'mapp-pane on', 'data-testid': 'pane-site' });
  const alertPane = h('div', { class: 'mapp-pane', 'data-testid': 'pane-alerts' });
  const modPane = h('div', { class: 'mapp-pane', 'data-testid': 'pane-mod' });
  const body = h('div', { class: 'mapp-body' }, sitePane, alertPane, modPane);
  const tabs = h('nav', { class: 'mapp-tabs', role: 'tablist' });
  const shell = h('div', { class: 'mapp', 'data-testid': 'mapp' }, h('header', { class: 'mapp-head' }, hello, langBtn), body, tabs);
  fill(root, shell);
  const list = { load: async () => (await api.getList()).items, save: async (items) => (await api.putList(items)).items };
  let site = null;

  function paintTabs() {
    const names = [['prices', 'app.tab_prices', '🏷'], ['list', 'app.tab_list', '🧺'], ['alerts', 'app.tab_alerts', '🔔']];
    if (state.me?.mod) names.push(['mod', 'app.tab_mod', '🛡']);
    fill(tabs, ...names.map(([key, label, icon]) => h('button', { type: 'button', class: `mtab${state.tab === key ? ' on' : ''}`,
      'data-testid': `tab-${key}`, onclick: () => switchTab(key) }, h('span', { class: 'mtab-i' }, icon), P(label))));
    hello.textContent = P('app.hello', { name: state.me?.name ?? '' });
    langBtn.textContent = P('site.lang');
  }

  async function switchTab(key) {
    state.tab = key;
    sitePane.classList.toggle('on', key === 'prices' || key === 'list');
    alertPane.classList.toggle('on', key === 'alerts');
    modPane.classList.toggle('on', key === 'mod');
    if (key === 'prices' && site.path === 'list') await site.show('');
    if (key === 'list') await site.show('list');
    if (key === 'alerts') await paintAlerts(true);
    if (key === 'mod') await paintMod(true);
    paintTabs();
    body.scrollTo?.({ top: 0 });
  }

  async function paintAlerts(reload = false) {
    if (reload || !state.snap) {
      state.alerts = (await api.alerts()).items;
      state.snap = await opts.pub.today();
    }
    const snap = state.snap;
    const p = pmap[state.alertFor];
    const wc = whereCheap(p.id, snap.cells, opts.bazaars, snap.today);
    const best = wc.rows[0];
    const select = h('select', { 'data-testid': 'alert-product', onchange: () => { state.alertFor = select.value; paintAlerts(); } },
      opts.products.map((x) => h('option', { value: x.id, selected: x.id === p.id }, name(state.lang, x))));
    const limit = h('input', { inputmode: 'numeric', maxlength: 12, 'data-testid': 'alert-limit', placeholder: best ? String(best.price - (best.price % 1000)) : '' });
    const add = h('button', { type: 'button', class: 'btn', 'data-testid': 'alert-add', onclick: async () => {
      try {
        const res = await api.addAlert({ product: p.id, below: limit.value.replace(/\s/g, '') });
        state.alerts = res.items;
        toast(root, P('app.alert_saved'));
        paintAlerts();
      } catch (e) {
        toast(root, errText(T, state.lang, e), 'bad');
      }
    } }, P('app.alert_add'));
    const items = state.alerts.map((a) => h('div', { class: `arow${a.fired_at ? ' fired' : ''}`, 'data-testid': `alert-${a.product}` },
      h('span', {}, h('b', {}, name(state.lang, pmap[a.product])), ` — ${P('app.alert_row', { limit: money(T, state.lang, a.below) })}`),
      h('small', {}, a.fired_at ? P('app.alert_fired', { when: `${name(state.lang, bmap[a.bazaar])}, ${perUnit(T, state.lang, pmap[a.product], a.price)}, ${hhmm(localMinute(a.fired_at))}` })
        : P('app.alert_wait')),
      a.fired_at ? null : h('button', { type: 'button', class: 'lremove', 'aria-label': P('site.remove'), onclick: async () => {
        state.alerts = (await api.removeAlert(a.id)).items;
        paintAlerts();
      } }, '×')));
    const digest = h('label', { class: 'adigest' }, h('input', { type: 'checkbox', checked: state.me.digest, onchange: async (e) => {
      state.me.digest = (await api.setDigest(e.target.checked)).digest;
    } }), P('app.digest'));
    fill(alertPane, h('section', { class: 'card' }, h('h2', {}, P('app.alerts_title')), h('p', { class: 'muted' }, P('app.alerts_lead')),
      h('label', { class: 'field' }, h('span', {}, P('app.alert_product')), select),
      best ? h('p', { class: 'anow', 'data-testid': 'alert-now' }, P('app.alert_now', { line: cheapLine(T, state.lang, bmap[best.bazaar], p, best) })) : null,
      h('label', { class: 'field' }, h('span', {}, P('app.alert_limit')), limit), add),
    h('section', { class: 'card', 'data-testid': 'alert-list' }, items.length ? items : h('p', { class: 'empty' }, P('al.none'))), digest);
  }

  async function paintMod(reload = false) {
    if (reload) state.queue = (await api.queue()).items;
    fill(modPane, h('section', { class: 'card' }, h('h2', {}, P('app.tab_mod')), h('p', { class: 'muted' }, P('app.mod_lead')),
      state.queue.length ? state.queue.map((r) => h('div', { class: 'qrow', 'data-testid': `queue-${r.id}` },
        h('b', {}, `${name(state.lang, bmap[r.bazaar])} · ${name(state.lang, pmap[r.product])}: ${perUnit(T, state.lang, pmap[r.product], r.price)}`),
        h('small', {}, P('app.mod_row', { ref: r.ref ? money(T, state.lang, r.ref) : '—', who: r.who, trust: r.trust, time: hhmm(localMinute(r.at)) })),
        h('span', { class: 'qbtns' }, h('button', { type: 'button', class: 'btn', 'data-testid': `hide-${r.id}`, onclick: async () => {
          await api.hide(r.id);
          toast(root, P('app.hidden_ok'));
          await paintMod(true);
        } }, P('btn.hide')), h('button', { type: 'button', class: 'btn ghost', onclick: async () => {
          await api.ban(r.user);
          await paintMod(true);
        } }, P('btn.ban'))))) : h('p', { class: 'empty' }, P('mod.empty'))));
  }

  async function setLang(next) {
    state.lang = next;
    await api.setLang(next).catch(() => {});
    site.setLang(next);
    paintTabs();
    if (state.tab === 'alerts') paintAlerts();
    if (state.tab === 'mod') paintMod();
    opts.onLang?.(next);
  }

  async function start() {
    state.me = await api.me();
    state.lang = state.me.lang ?? state.lang;
    site = mountSite(sitePane, { ...opts, api: opts.pub, lang: state.lang, memory: true, chrome: false, list, poll: opts.poll,
      onAlert: (pid) => { state.alertFor = pid; switchTab('alerts'); } });
    await site.ready;
    paintTabs();
  }
  const ready = start();
  return {
    ready, switchTab,
    get tab() { return state.tab; },
    get site() { return site; },
    async refresh() {
      await site?.refresh();
      if (state.tab === 'alerts') await paintAlerts(true);
      if (state.tab === 'mod') await paintMod(true);
    },
    setLang,
  };
}
