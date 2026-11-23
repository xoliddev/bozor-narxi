// Browser test of the demo at 1440 px and 375 px. Fails on any console error, page error or failed request.
//   PW_CHANNEL=chrome node scripts/e2e.mjs        (needs `playwright`: npm i --no-save playwright)
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const PORT = Number(process.env.E2E_PORT ?? 4392);
const BASE = process.env.E2E_URL ?? `http://127.0.0.1:${PORT}/`;
const server = process.env.E2E_URL ? null : await startServer(PORT);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const errors = [];
let checks = 0;
const ok = (cond, msg) => {
  assert.ok(cond, msg);
  checks += 1;
};

async function open(width, height, { path = '', ready = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, locale: 'uz-UZ', timezoneId: 'Asia/Tashkent' });
  await ctx.route('https://telegram.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('bozornarxi.lang', 'uz'); } catch { /* */ } });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`[${width}] ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`[${width}] ${e.message}`));
  page.on('requestfailed', (r) => errors.push(`[${width}] request failed ${r.url()} ${r.failure()?.errorText}`));
  await page.goto(BASE + path);
  if (ready) await page.waitForSelector('body[data-ready="1"]', { timeout: 60_000 });
  return page;
}

const text = (page, sel) => page.evaluate((s) => document.querySelector(s)?.textContent ?? '', sel);
const has = (page, sel, s) => page.waitForFunction(([q, v]) => document.querySelector(q)?.textContent.includes(v), [sel, s], { timeout: 30_000 });
const noScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const done = (page, n) => page.waitForFunction((k) => document.querySelector(`[data-testid=story-${k}]`).classList.contains('done'), n, { timeout: 180_000 });
async function step(page, n) {
  await page.getByTestId(`story-${n}`).click();
  await done(page, n);
}
const S = '[data-testid=site-app]';
const G = '[data-testid=gulnora-app]';
const chat = (who) => `[data-testid=${who}-chat]`;

async function story(page, mobile) {
  ok((await text(page, '[data-testid=demo-badge]')).includes('brauzeringizda'), 'demo badge');
  if (mobile) ok(await page.getByTestId('site-window').isVisible() && !(await page.getByTestId('dilshod-phone').isVisible()), 'one frame at a time');
  else ok(await page.getByTestId('dilshod-phone').isVisible() && await page.getByTestId('gulnora-phone').isVisible() && await page.getByTestId('site-window').isVisible(),
    'two phones and the website at 1440 px');
  ok(await noScroll(page), 'no horizontal scroll');
  ok((await text(page, `${S} [data-testid=best-kartoshka] .best-label`)) === 'Kartoshka eng arzon: Chorsu', 'the site: kartoshka is cheapest at Chorsu');
  ok((await text(page, `${S} [data-testid=best-price-kartoshka]`)) === "4 900 so'm/kg", 'the price per kg');
  ok((await text(page, `${S} [data-testid=best-conf-kartoshka]`)).startsWith("Kam ma'lumot · 1 ta xabar"), 'one report: "Kam ma\'lumot"');
  ok((await text(page, `${S} [data-testid=week-strip]`)).includes('piyoz −12%'), 'this week: piyoz −12%');
  await step(page, 1);
  await step(page, 2);
  await has(page, chat('dilshod'), "Rahmat! Chorsuda kartoshka: bugun 4 500 so'm (2 ta xabar)");
  ok(true, 'the bot thanks Dilshod with what changed');
  await step(page, 3);
  await has(page, `${S} [data-testid=price-chorsu]`, "4 500 so'm/kg");
  ok((await text(page, `${S} [data-testid=conf-chorsu]`)).startsWith('2 ta xabar'), 'two reports now');
  ok((await text(page, `${S} [data-testid=product-headline]`)).startsWith("✅ Chorsuda kartoshka 4 500 so'm — shahar o'rtachasidan"), 'the headline');
  ok(await page.locator(`${S} [data-testid=dot-chorsu]`).count() === 1, "the chart shows Chorsu's line and today's point");
  await step(page, 4);
  await has(page, chat('dilshod'), 'Yuborgan: Tez narx (ishonch 20%)');
  ok((await text(page, `${S} [data-testid=price-chorsu]`)) === "4 500 so'm/kg", 'the troll does not move the price');
  ok(!(await text(page, S)).includes('Tez narx'), 'no reporter names on the website');
  await step(page, 5);
  await has(page, `${S} [data-testid=conf-chorsu]`, '4 ta xabar');
  ok(true, 'two confirmations: four reports');
  await step(page, 6);
  await has(page, `${G} [data-testid=list-best]`, 'tejaysiz');
  ok((await text(page, `${G} [data-testid=list-best]`)).startsWith('✅ Oloyda'), 'the cheapest bazaar for the list');
  ok((await text(page, `${G} [data-testid=list-partial]`)).includes("Narxi yo'q: guruch (devzira)"), 'missing items shown honestly');
  ok(await page.locator(`${G} .ldist`).count() >= 6, 'distances from her location');
  await step(page, 7);
  await has(page, `${G} [data-testid=alert-piyoz]`, 'Kutilmoqda');
  ok(true, 'the alert waits');
  await step(page, 8);
  await has(page, chat('gulnora'), "🔔 Piyoz Chorsuda 5 800 so'm/kg — siz kutgan 6 000 so'mdan arzon.");
  ok(true, 'the bot tells Gulnora');
  await step(page, 9);
  await has(page, chat('dilshod'), 'Tez narx: ishonch 20% → 3%');
  ok(true, 'the moderator hid the report and the troll lost trust');
  await step(page, 10);
  await has(page, `${S} [data-testid=week-down-0]`, 'piyoz −12%');
  ok((await text(page, '[data-testid=story-caption]')).includes('Piyoz 12% arzonladi'), 'the story ends on the weekly view');
  ok(await noScroll(page), 'still no horizontal scroll');
}

async function more(page) {
  await page.evaluate(() => document.querySelector('[data-testid=site-app] [data-testid=nav-today]').click());
  await page.evaluate(() => document.querySelector('[data-testid=site-app] [data-testid=row-piyoz]').click());
  await page.waitForSelector(`${S} [data-testid=days-90]`);
  await page.evaluate(() => document.querySelector('[data-testid=site-app] [data-testid=days-90]').click());
  await page.waitForFunction(() => document.querySelector('[data-testid=site-app] [data-testid=days-90]')?.classList.contains('on'));
  ok(await page.locator(`${S} .chart-svg .cline`).count() === 1, 'the 90-day chart');
  await page.getByTestId('demo-lang').click();
  await has(page, '[data-testid=demo-badge]', 'браузере');
  await has(page, `${S} [data-testid=nav-today]`, 'Сегодня');
  await has(page, `${G} [data-testid=tab-prices]`, 'Цены');
  ok(true, 'Russian switch');
}

async function outOfOrder() {
  const page = await open(1440, 900);
  await page.getByTestId('story-9').click();
  await done(page, 9);
  ok(await page.evaluate(() => [...document.querySelectorAll('.story-btn.done')].length) === 9, 'step 9 first: the earlier steps happen quietly');
  await has(page, chat('dilshod'), 'ishonch 20% → 3%');
  ok(true, 'and the moderator still hides the report');
  await page.context().close();
}

try {
  for (const [w, h] of [[1440, 900], [375, 812]]) {
    const page = await open(w, h);
    await story(page, w < 760);
    if (w > 760) await more(page);
    await page.context().close();
  }
  await outOfOrder();
  const outside = await open(375, 700, { path: 'webapp/index.html', ready: false });
  await has(outside, '#app', 'Telegram ichida');
  ok(true, 'the Mini App outside Telegram asks to open it in Telegram');
  await outside.context().close();
  assert.deepEqual(errors, [], `console errors:\n${errors.join('\n')}`);
  console.log(`e2e: ${checks} checks passed at 1440 px and 375 px, 0 console errors`); // eslint-disable-line no-console
} finally {
  await browser.close();
  server?.close();
}
