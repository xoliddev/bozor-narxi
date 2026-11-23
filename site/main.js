// Website entry: today's prices from the public API, refreshed every 30 seconds; the shopping list stays in this
// browser; the language is remembered here too.
import { normLang } from '../shared/i18n.js';
import { localList, publicApi } from './api.js';
import { mountSite } from './app.js';
import { loadShared, store } from './util.js';

const shared = await loadShared();
const api = publicApi();
const lang = normLang(store.get('bozornarxi.lang') ?? navigator.language);
document.documentElement.lang = lang;
const config = await api.config().catch(() => ({ bot: '' }));
const site = mountSite(document.getElementById('site'), { ...shared, api, lang, poll: 30_000, list: localList(store), bot: config.bot,
  onLang: (l) => { store.set('bozornarxi.lang', l); document.documentElement.lang = l; } });
await site.ready;
document.body.dataset.ready = '1';
