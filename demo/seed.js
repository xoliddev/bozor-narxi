// The demo's world: the same invented city as the server's seed (shared/seedgen.js), relative to the demo's "today",
// with the clock at 10:40 Tashkent time (every one of today's seeded reports is in). The story's people get positive
// ids like real Telegram users: Dilshod is the seed's most trusted reporter (and a moderator), Malika and Sherzod are
// two more regular reporters, Gulnora and "Tez narx" are new accounts.
import { atLocal, localDay } from '../shared/clock.js';
import { world } from '../shared/seedgen.js';
import './backend-more.js';
import { Backend } from './backend.js';

export const DILSHOD = 1;
export const MALIKA = 2;
export const SHERZOD = 3;
export const GULNORA = 100_002;
export const TROLL = 100_003;
export const START = 10 * 60 + 40;
/** Gulnora's home for the shopping list's distances: a street near Oloy bazaar. */
export const GULNORA_HOME = [41.3110, 69.2797];

export function createDemo({ data, now = () => Date.now(), lang = 'uz' }) {
  const b = new Backend({ data, now, moderators: [DILSHOD] });
  const today = localDay(b.nowMs());
  b.offset = atLocal(today, START) + 5_000 - b.clock();
  const w = world(data.products, data.bazaars, data.names, today, START);
  const flip = { [-1]: DILSHOD, [-2]: MALIKA, [-3]: SHERZOD };
  for (const u of w.users) u.id = flip[u.id] ?? u.id;
  for (const r of w.reports) r.user = flip[r.user] ?? r.user;
  b.load(w);
  b.users.get(DILSHOD).name = data.names.story.dilshod;
  b.users.get(MALIKA).name = data.names.story.confirm[0];
  b.users.get(SHERZOD).name = data.names.story.confirm[1];
  b.touch(GULNORA, data.names.story.gulnora);
  b.touch(TROLL, data.names.story.troll);
  for (const uid of [DILSHOD, MALIKA, SHERZOD, GULNORA, TROLL]) b.setLang(uid, lang);
  return b;
}
