// The demo's story headless: the in-page backend runs the server's rules, steps work in order and out of order, on any
// day (30 days in a row, across New Year), and the simulated bots get the same messages the real bot sends.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { atLocal, daysFromCivil } from '../shared/clock.js';
import { makeT } from '../shared/i18n.js';
import { whereCheap } from '../shared/prices.js';
import { apiFor, pubApi } from '../demo/api.js';
import { BotSim } from '../demo/bot.js';
import { makeViews } from '../demo/bot-views.js';
import { createDemo, DILSHOD, GULNORA, GULNORA_HOME, MALIKA, SHERZOD, TROLL } from '../demo/seed.js';
import { runStep, STEPS } from '../demo/story.js';

const read = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url), 'utf8'));
const data = { products: read('../shared/data/products.json'), bazaars: read('../shared/data/bazaars.json'), names: read('../shared/data/names.json') };
const t = makeT({ uz: read('../shared/locales/uz.json'), ru: read('../shared/locales/ru.json') });

function world(day = daysFromCivil(2026, 11, 18)) {
  const real = atLocal(day, 8 * 60);
  const started = Date.now();
  const backend = createDemo({ data, now: () => real + (Date.now() - started) });
  const views = makeViews(t);
  const bots = Object.fromEntries([DILSHOD, GULNORA, TROLL, MALIKA, SHERZOD].map((uid) => [uid, new BotSim(backend, uid, t, views)]));
  backend.on((ev) => { if (ev.type === 'note') bots[ev.note.to]?.deliver(ev.note); });
  bots[DILSHOD].start();
  bots[GULNORA].start();
  return { backend, bots, env: { backend, bots, done: new Set() } };
}
const texts = (bot) => bot.messages.map((m) => m.html).join('\n');
const last = (bot) => bot.messages[bot.messages.length - 1].html;
const kart = (b) => whereCheap('kartoshka', b.cells(), b.bazaars, b.today());

test('the whole story in order: the report, the live price, the troll, confirmations, the list, the alert, the moderator, the week', async () => {
  const { backend: b, bots, env } = world();
  assert.match(texts(bots[DILSHOD]), /Bu hafta arzonladi: piyoz −12%/);
  assert.deepEqual([kart(b).best, kart(b).rows[0].price, kart(b).rows[0].n], ['chorsu', 4900, 1]);
  await runStep(1, env);
  await runStep(2, env);
  assert.match(last(bots[DILSHOD]), /^Rahmat! Chorsuda kartoshka: bugun 4 500 so'm \(2 ta xabar\)/);
  await runStep(3, env);
  assert.deepEqual([kart(b).rows[0].price, kart(b).rows[0].n], [4500, 2]);
  await runStep(4, env);
  assert.match(last(bots[TROLL]), /^Tekshiruvga yuborildi/);
  assert.match(last(bots[DILSHOD]), /^🛡 <b>Chorsu · Kartoshka: 500 so'm\/kg<\/b>\nOdatdagi narx: 5 000 so'm\nYuborgan: Tez narx \(ishonch 20%\)/);
  assert.equal(kart(b).rows[0].price, 4500, 'the troll does not move the price');
  await runStep(5, env);
  assert.deepEqual([kart(b).rows[0].price, kart(b).rows[0].n, kart(b).rows[0].level], [4500, 4, 'high']);
  await runStep(6, env);
  const basket = b.basketFor(GULNORA, GULNORA_HOME);
  assert.equal(basket.best, 'oloy');
  assert.ok(basket.saving > 0 && basket.rows.every((r) => r.dist > 0));
  assert.deepEqual(basket.rows.filter((r) => r.missing.length).map((r) => r.bazaar).sort(), ['parkent', 'yunusobod']);
  await runStep(7, env);
  assert.equal(b.alerts(GULNORA)[0].fired_at, null);
  await runStep(8, env);
  assert.match(last(bots[GULNORA]), /^🔔 Piyoz Chorsuda 5 800 so'm\/kg — siz kutgan 6 000 so'mdan arzon\./);
  await runStep(9, env);
  assert.match(last(bots[DILSHOD]), /🙈 Yashirildi\. Tez narx: ishonch 20% → 3%\.\nChorsuda kartoshka: 4 500 so'm\/kg \(4 ta xabar/);
  assert.equal(b.queue(DILSHOD).some((q) => q.user === TROLL), false);
  await runStep(10, env);
  assert.equal(b.week().piyoz, -12);
  assert.equal(kart(b).rows[0].price, 4500, 'the story ends with the honest price');
});

test('steps clicked out of order quietly do what they need first', async () => {
  for (const n of [10, 4, 8, 9, 6]) {
    const { backend: b, bots, env } = world();
    await runStep(n, env);
    assert.deepEqual([...env.done].sort((x, y) => x - y), Array.from({ length: n }, (_, i) => i + 1));
    if (n >= 2) assert.equal(kart(b).rows[0].price, 4500);
    if (n >= 8) assert.match(texts(bots[GULNORA]), /🔔 Piyoz Chorsuda 5 800/);
  }
});

test('the story on 30 days in a row and across New Year', async () => {
  const days = [...Array.from({ length: 30 }, (_, k) => daysFromCivil(2026, 12, 10) + k), daysFromCivil(2027, 1, 1)];
  for (const day of days) {
    const { backend: b, bots, env } = world(day);
    for (let n = 1; n <= STEPS.length; n++) await runStep(n, env);
    assert.equal(b.today(), day);
    assert.equal(kart(b).rows[0].price, 4500, String(day));
    assert.match(last(bots[GULNORA]), /🔔 Piyoz/, String(day));
    assert.equal(b.week().piyoz, -12, String(day));
  }
});

test('the API stand-ins answer like the server: roles, errors, no names in public views', async () => {
  const { backend: b } = world();
  const pub = pubApi(b);
  const snap = await pub.today();
  assert.ok(!JSON.stringify(snap).includes('Dilshod'));
  await assert.rejects(pub.history('kartoshka', 7), { code: 'generic' });
  await assert.rejects(apiFor(b, GULNORA).queue(), { code: 'forbidden' });
  await assert.rejects(apiFor(b, GULNORA).addAlert({ product: 'piyoz', below: 10 }), { code: 'price_range' });
  await assert.rejects(apiFor(b, GULNORA).putList([{ product: 'mol', qty: 7 }]), { code: 'qty' });
  await assert.rejects(apiFor(b, DILSHOD).ban(DILSHOD), { code: 'forbidden' });
  const { items } = await apiFor(b, GULNORA).putList([{ product: 'mol', qty: 20 }]);
  assert.deepEqual(items, [{ product: 'mol', qty: 20 }]);
  const res = await apiFor(b, DILSHOD).ban(TROLL);
  assert.equal(res.who, 'Tez narx');
  assert.throws(() => b.submit(TROLL, 'oloy', 'mol', 110_000), { code: 'banned' });
});
