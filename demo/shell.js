// Demo page: Dilshod's phone (bot + Mini App), the website in a browser window and Gulnora's phone, all on the in-page
// backend; the guided story (in order, all at once, or out of order) with a caption for every step, the demo clock, the
// language switch. On narrow screens one frame at a time, with a tab switcher.
import { localDay, localMinute } from '../shared/clock.js';
import { dateShort, makeT } from '../shared/i18n.js';
import { mountSite } from '../site/app.js';
import { h, loadShared, makeText, store } from '../site/util.js';
import { mountApp } from '../webapp/ui.js';
import { apiFor, memoryList, pubApi } from './api.js';
import { BotSim } from './bot.js';
import { makeViews } from './bot-views.js';
import { createPhone } from './phone.js';
import { createDemo, DILSHOD, GULNORA, GULNORA_HOME, MALIKA, SHERZOD, TROLL } from './seed.js';
import { runStep, STEPS } from './story.js';
import { makeUi } from './story-ui.js';
import { createWindow } from './window.js';

const shared = await loadShared(new URL('../shared/', import.meta.url), true);
const t = makeT(shared.catalogs);
const T = makeText(shared.catalogs);
let lang = store.get('bozornarxi.lang') === 'ru' ? 'ru' : 'uz';
const P = (key, params) => T(lang, key, params);
const backend = createDemo({ data: shared, lang });
const views = makeViews(t);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const SHOWN = [DILSHOD, GULNORA];
const people = { [DILSHOD]: { who: 'dilshod', role: 'demo.role_dilshod' }, [GULNORA]: { who: 'gulnora', role: 'demo.role_gulnora' } };
const phones = {};
const bots = {};
const apps = {};
const pub = pubApi(backend);
let site = null;

const narrow = () => window.matchMedia('(max-width: 760px)').matches;
function focus(who, pane) {
  if (who !== 'site') phones[who].show(pane);
  if (narrow()) pick(who);
}
async function openSite(url) {
  focus('site');
  await site.show(String(url).replace(/^demo:#?\/?/, ''));
}
async function openApp(uid) {
  focus(uid, 'app');
  await apps[uid].ready;
}

for (const uid of [DILSHOD, GULNORA, TROLL, MALIKA, SHERZOD]) {
  bots[uid] = new BotSim(backend, uid, t, views, { onChange: () => phones[uid]?.renderChat(), onAlert: (x) => phones[uid]?.alert(x) });
  bots[uid].onLangChange = (l) => setLang(l);
}
for (const uid of SHOWN) {
  phones[uid] = createPhone({ who: people[uid].who, label: '', role: people[uid].role, bot: bots[uid], texts: { P }, now: () => backend.nowMs(),
    onOpenApp: () => openApp(uid), onShowApp: () => apps[uid]?.refresh(), onUrl: (u) => openSite(u) });
  const home = uid === GULNORA ? GULNORA_HOME : [41.3270, 69.2370];
  apps[uid] = mountApp(phones[uid].appRoot, { ...shared, api: apiFor(backend, uid), pub, lang, now: () => backend.nowMs(), geo: async () => home,
    onLang: (l) => setLang(l) });
}
const win = createWindow({ P });
site = mountSite(win.root, { ...shared, api: pub, lang, memory: true, now: () => backend.nowMs(), list: memoryList(), geo: async () => GULNORA_HOME,
  onRoute: (path) => win.paint(path), onLang: (l) => setLang(l) });

let pending = false;
backend.on((ev) => {
  if (ev.type === 'note') {
    const msg = bots[ev.note.to]?.deliver(ev.note);
    if (msg && phones[ev.note.to]) phones[ev.note.to].ping(msg.html);
  }
  if (ev.type === 'changed' && !pending) {
    pending = true;
    queueMicrotask(async () => {
      pending = false;
      await Promise.all([site.refresh(), ...SHOWN.map((uid) => apps[uid].refresh())]).catch((e) => console.warn(e)); // eslint-disable-line no-console
      paintClock();
    });
  }
});

// ── page ──
const timeEl = h('span', { class: 'demo-date', 'data-testid': 'demo-time' });
const badgeText = h('span');
const langBtn = h('button', { class: 'demo-btn', type: 'button', 'data-testid': 'demo-lang', onclick: () => setLang(lang === 'uz' ? 'ru' : 'uz') });
const page = `${window.location.origin}${window.location.pathname.replace(/index\.html$/, '')}`;
const resetBtn = h('button', { class: 'demo-btn', type: 'button', onclick: () => window.location.assign(page) });
const playBtn = h('button', { class: 'demo-btn solid', type: 'button', 'data-testid': 'play', onclick: () => play() });
const MARK = '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M6 13h20l-2.2 11.2a3 3 0 0 1-3 2.4h-9.6a3 3 0 0 1-3-2.4z" fill="currentColor"/>'
  + '<path d="M11 13l4-7M21 13l-4-7" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>';
const bar = h('header', { class: 'demo-bar' },
  h('a', { class: 'demo-logo', href: page }, h('span', { class: 'demo-mark', html: MARK }), 'Bozor Narxi'),
  h('span', { class: 'demo-badge', 'data-testid': 'demo-badge' }, h('span', { class: 'dot' }), badgeText),
  h('span', { class: 'demo-time' }, timeEl),
  h('div', { class: 'demo-tools' }, playBtn, langBtn, resetBtn,
    h('a', { class: 'demo-btn gh', href: 'https://github.com/xoliddev/bozor-narxi', target: '_blank', rel: 'noopener' }, 'GitHub')));
const title = h('h1');
const lead = h('p');
const caption = h('p', { class: 'story-cap', 'data-testid': 'story-caption', 'aria-live': 'polite' });
const foot = h('p', { class: 'demo-foot' });
const env = { backend, bots, wait, focus, done: new Set(), visible: (uid) => Boolean(phones[uid]) };
env.ui = makeUi({ phones, apps, site, wait });
let running = false;
let current = 0;
async function step(i) {
  if (running) return;
  running = true;
  current = i + 1;
  paintStory();
  try {
    await runStep(i + 1, env);
  } catch (err) {
    console.warn(err); // eslint-disable-line no-console
  }
  running = false;
  paintStory();
}
async function play() {
  for (let i = 0; i < STEPS.length; i++) if (!env.done.has(i + 1)) await step(i);
}
const storyBtns = STEPS.map((_, i) => h('button', { class: 'story-btn', type: 'button', 'data-testid': `story-${i + 1}`, onclick: () => step(i) },
  h('b', {}, String(i + 1)), h('span')));
function paintStory() {
  const next = STEPS.findIndex((_, i) => !env.done.has(i + 1));
  storyBtns.forEach((b, i) => {
    b.lastChild.textContent = P(`demo.step_${i + 1}`);
    b.classList.toggle('done', env.done.has(i + 1));
    b.classList.toggle('next', i === next && !running);
    b.classList.toggle('now', running && i + 1 === current);
    b.disabled = running;
  });
  playBtn.disabled = running || next < 0;
  caption.textContent = current ? P(`demo.cap_${current}`) : P('demo.cap_0');
}
const WHO = [DILSHOD, 'site', GULNORA];
const whoBtns = WHO.map((w) => h('button', { type: 'button', 'data-testid': `switch-${w === 'site' ? 'site' : people[w].who}`, onclick: () => pick(w) }));
const sides = () => [phones[DILSHOD].side, win.side, phones[GULNORA].side];
function pick(w) {
  whoBtns.forEach((b, i) => b.classList.toggle('on', WHO[i] === w));
  sides().forEach((s, i) => s.classList.toggle('show', WHO[i] === w));
}
const paintClock = () => {
  const m = localMinute(backend.nowMs());
  timeEl.textContent = P('demo.time', { date: dateShort(T, lang, localDay(backend.nowMs())), time: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` });
};
function paintTexts() {
  document.documentElement.lang = lang;
  badgeText.textContent = P('demo.badge');
  langBtn.textContent = lang === 'uz' ? 'RU' : 'UZ';
  resetBtn.textContent = P('demo.reset');
  playBtn.textContent = P('demo.play');
  title.textContent = P('demo.title');
  lead.textContent = P('demo.lead');
  foot.textContent = P('demo.foot');
  whoBtns.forEach((b, i) => { b.textContent = P(WHO[i] === 'site' ? 'demo.site' : `demo.${people[WHO[i]].who}`); });
  paintStory();
  paintClock();
  for (const uid of SHOWN) {
    phones[uid].renderLabels();
    phones[uid].side.querySelector('.side-label').replaceChildren(h('b', {}, P(`demo.${people[uid].who}`)), h('span', {}, P(people[uid].role)));
  }
  win.paint(site.path);
}
function setLang(next) {
  if (next === lang) return;
  lang = next;
  store.set('bozornarxi.lang', lang);
  for (const uid of [DILSHOD, GULNORA, TROLL, MALIKA, SHERZOD]) backend.setLang(uid, lang);
  for (const uid of SHOWN) apps[uid].setLang(lang);
  site.setLang(lang);
  paintTexts();
}
setInterval(() => { paintClock(); for (const uid of SHOWN) phones[uid].tick(); }, 10_000);

document.body.append(bar, h('section', { class: 'demo-intro' }, title, lead), h('nav', { class: 'story', 'aria-label': 'story' }, storyBtns), caption,
  h('div', { class: 'who-switch', role: 'tablist' }, whoBtns), h('main', { class: 'demo-stage' }, sides()), foot);
for (const uid of SHOWN) {
  bots[uid].start();
  phones[uid].show('chat');
}
pick('site');
paintTexts();
await Promise.all([site.ready, ...SHOWN.map((uid) => apps[uid].ready)]);
document.body.dataset.ready = '1';
