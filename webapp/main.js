// Mini App entry. Inside Telegram it passes the signed initData along (the server checks it on every call). Outside
// Telegram it only asks to open it there.
import { normLang } from '../shared/i18n.js';
import { publicApi } from '../site/api.js';
import { h, loadShared } from '../site/util.js';
import { httpApi } from './api.js';
import { mountApp } from './ui.js';

const tg = window.Telegram?.WebApp;
const root = document.getElementById('app');
const shared = await loadShared();

if (!tg?.initData) {
  root.replaceChildren(h('p', { class: 'g-outside' }, shared.catalogs.uz['app.open_in_telegram']),
    h('p', { class: 'g-outside' }, shared.catalogs.ru['app.open_in_telegram']));
} else {
  tg.ready();
  tg.expand();
  const lang = normLang(tg.initDataUnsafe?.user?.language_code);
  const app = mountApp(root, { ...shared, api: httpApi(tg.initData), pub: publicApi(), tg, lang, poll: 30_000,
    onLang: (l) => { document.documentElement.lang = l; } });
  await app.ready;
}
document.body.dataset.ready = '1';
