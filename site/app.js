// The public website: today's prices, a product's "qayerda arzon?" with the price-change chart, a bazaar, the shopping
// list and the weekly view. mountSite() also runs inside the Mini App (without its own header, `chrome: false`) and in
// the demo's browser window (`memory: true`: links change the page without touching the address bar).
import * as I from '../shared/i18n.js';
import { pageBazaar, pageBazaars } from './p-bazaar.js';
import { pageList } from './p-list.js';
import { pageProduct } from './p-product.js';
import { pageToday } from './p-today.js';
import { pageWeek } from './p-week.js';
import { fill, h, makeText } from './util.js';

const LOGO = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 13h20l-2.2 11.2a3 3 0 0 1-3 2.4h-9.6a3 3 0 0 1-3-2.4z" fill="currentColor"/>'
  + '<path d="M11 13l4-7M21 13l-4-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/>'
  + '<path d="M12 18v4M16 18v4M20 18v4" stroke="#14532d" stroke-width="2" stroke-linecap="round"/></svg>';
const ROUTES = [[/^$/, pageToday], [/^p\/([a-z]{1,16})$/, pageProduct], [/^b\/([a-z]{1,16})$/, pageBazaar], [/^bazaars$/, pageBazaars],
  [/^list$/, pageList], [/^week$/, pageWeek]];

export function mountSite(root, opts) {
  const T = makeText(opts.catalogs);
  const ctx = {
    api: opts.api, products: opts.products, bazaars: opts.bazaars, catalogs: opts.catalogs, T, lang: opts.lang === 'ru' ? 'ru' : 'uz',
    pmap: Object.fromEntries(opts.products.map((p) => [p.id, p])), bmap: Object.fromEntries(opts.bazaars.map((b) => [b.id, b])),
    now: opts.now ?? (() => Date.now()), list: opts.list, geo: opts.geo, bot: opts.bot ?? '', snap: null, memory: Boolean(opts.memory),
    chrome: opts.chrome !== false, onAlert: opts.onAlert, root,
  };
  ctx.P = (key, params) => T(ctx.lang, key, params);
  ctx.name = (item) => I.name(ctx.lang, item);
  ctx.money = (n) => I.money(T, ctx.lang, n);
  ctx.per = (p, price) => I.perUnit(T, ctx.lang, p, price);
  ctx.link = (path, attrs, ...children) => h('a', { ...attrs, href: `#/${path}`, onclick: (e) => {
    if (ctx.memory) e.preventDefault();
    if (ctx.memory || window.location.hash === `#/${path}`) show(path);
  } }, ...children);
  let page = null;
  let path = null;
  const main = h('main', { class: 'site-main', 'data-testid': 'site-main' });
  const navLinks = [['', 'site.nav_today'], ['list', 'site.nav_list'], ['bazaars', 'site.nav_bazaars'], ['week', 'site.nav_week']]
    .map(([p, key]) => ({ p, key, el: ctx.link(p, { class: 'nav-a', 'data-testid': `nav-${p || 'today'}` }) }));
  const langBtn = h('button', { type: 'button', class: 'nav-lang', 'data-testid': 'site-lang', onclick: () => setLang(ctx.lang === 'uz' ? 'ru' : 'uz') });
  const brandText = h('span');
  const header = h('header', { class: 'site-head' }, h('div', { class: 'site-bar' },
    ctx.link('', { class: 'brand' }, h('span', { class: 'brand-mark', html: LOGO }), brandText),
    h('nav', { class: 'site-nav' }, navLinks.map((x) => x.el)), langBtn));
  const foot = h('footer', { class: 'site-foot' });
  const shell = h('div', { class: `site${ctx.chrome ? '' : ' bare'}`, 'data-testid': 'site' }, ctx.chrome ? header : null, main, ctx.chrome ? foot : null);
  fill(root, shell);
  ctx.scrollTop = () => (ctx.memory ? (root.closest('.win-body') ?? root) : document.scrollingElement)?.scrollTo?.({ top: 0 });

  function paintChrome() {
    brandText.textContent = ctx.P('site.title');
    langBtn.textContent = ctx.P('site.lang');
    for (const x of navLinks) {
      x.el.textContent = ctx.P(x.key);
      x.el.classList.toggle('on', x.p === '' ? path === '' || path?.startsWith('p/') : path?.startsWith(x.p) || (x.p === 'bazaars' && path?.startsWith('b/')));
    }
    foot.textContent = ctx.P('site.foot');
  }

  function show(next) {
    const clean = String(next ?? '').replace(/^#?\/?/, '');
    const hit = ROUTES.map(([rx, fn]) => [rx.exec(clean), fn]).find(([m]) => m) ?? [[''], pageToday];
    const [m, fn] = hit;
    if (clean === path && page) return page.ready;
    page?.destroy?.();
    path = m[0];
    page = fn(ctx, m[1]);
    fill(main, page.el);
    paintChrome();
    opts.onRoute?.(path);
    ctx.scrollTop();
    page.ready = ctx.snap ? Promise.resolve(page.update()) : refresh();
    return page.ready;
  }
  ctx.nav = show;

  async function refresh() {
    ctx.snap = await ctx.api.today();
    await page?.update();
  }

  function setLang(next) {
    if (next === ctx.lang) return;
    ctx.lang = next;
    document.documentElement.lang = ctx.memory ? document.documentElement.lang : next;
    const keep = path;
    path = null;
    show(keep);
    opts.onLang?.(next);
  }

  if (!ctx.memory) window.addEventListener('hashchange', () => show(window.location.hash));
  let timer = null;
  if (opts.poll) timer = setInterval(() => { refresh().catch(() => {}); }, opts.poll);
  const ready = show(ctx.memory ? (opts.start ?? '') : window.location.hash);
  return {
    ready, show, refresh, setLang, ctx,
    get path() { return path; },
    get page() { return page; },
    destroy() { clearInterval(timer); page?.destroy?.(); },
  };
}
