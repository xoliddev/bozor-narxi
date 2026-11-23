// README media from the real demo: desktop + phone screenshots (JPEG), an 800x500 portfolio thumbnail and a GIF of the
// report, the live chart and the shopping list. JPEG is encoded by the browser (canvas), the GIF by
// gifenc.
//   PW_CHANNEL=chrome node scripts/shots.mjs [outDir]       (needs playwright + gifenc)
import { mkdirSync, writeFileSync } from 'node:fs';
import gifenc from 'gifenc';
import { chromium } from 'playwright';
import { startServer } from './serve.mjs';

const { GIFEncoder, quantize, applyPalette } = gifenc;
const OUT = process.argv[2] ?? 'docs/media';
const PORT = Number(process.env.SHOTS_PORT ?? 4394);
mkdirSync(OUT, { recursive: true });
const server = await startServer(PORT);
const browser = await chromium.launch({ channel: process.env.PW_CHANNEL || undefined });
const b64 = (buf) => buf.toString('base64');
const ONLY = new Set((process.env.ONLY ?? 'desktop,thumb,mobile,gif').split(','));

async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, timezoneId: 'Asia/Tashkent' });
  await ctx.route('https://telegram.org/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await ctx.addInitScript(() => { try { localStorage.setItem('bozornarxi.lang', 'uz'); } catch { /* */ } });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:${PORT}/`);
  await page.waitForSelector('body[data-ready="1"]');
  return page;
}
const done = (page, n) => page.waitForFunction((k) => document.querySelector(`[data-testid=story-${k}]`).classList.contains('done'), n, { timeout: 120_000 });
const step = async (page, n) => { await page.evaluate((k) => document.querySelector(`[data-testid=story-${k}]`).click(), n); await done(page, n); };
const toStage = (page, gap = 40) => page.evaluate((g) => {
  const top = document.querySelector('[data-testid=dilshod-phone]').getBoundingClientRect().top + window.scrollY;
  window.scrollTo(0, top - g);
}, gap);

async function canvasOut(page, fn, args) { return Buffer.from(await page.evaluate(fn, args), 'base64'); }
async function jpeg(page, png, name, w, h) {
  const out = await canvasOut(page, async ([src, W, H]) => {
    const img = new Image();
    img.src = `data:image/png;base64,${src}`;
    await img.decode();
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    const g = cv.getContext('2d');
    g.imageSmoothingQuality = 'high';
    g.drawImage(img, 0, 0, W, H);
    return cv.toDataURL('image/jpeg', 0.88).split(',')[1];
  }, [b64(png), w, h]);
  writeFileSync(`${OUT}/${name}`, out);
  console.log('wrote', name); // eslint-disable-line no-console
}

async function thumb(page, phone, win) {
  const out = await canvasOut(page, async ([a, b]) => {
    const load = async (s) => { const i = new Image(); i.src = `data:image/png;base64,${s}`; await i.decode(); return i; };
    const [ph, wn] = await Promise.all([a, b].map(load));
    const cv = document.createElement('canvas');
    cv.width = 1600;
    cv.height = 1000;
    const g = cv.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 1600, 1000);
    bg.addColorStop(0, '#1d4a31');
    bg.addColorStop(0.55, '#123222');
    bg.addColorStop(1, '#0c1d14');
    g.fillStyle = bg;
    g.fillRect(0, 0, 1600, 1000);
    const glow = g.createRadialGradient(1120, 520, 30, 1120, 520, 640);
    glow.addColorStop(0, 'rgba(242,181,68,0.20)');
    glow.addColorStop(1, 'rgba(242,181,68,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 1600, 1000);
    // a small price chart: the city line falling, the band around it
    const pts = [62, 60, 61, 57, 58, 54, 55, 50, 47, 48, 44, 41, 40, 37];
    g.fillStyle = 'rgba(242,181,68,0.16)';
    g.beginPath();
    pts.forEach((v, i) => g.lineTo(84 + i * 34, 930 - v * 2.6 - 18));
    [...pts].reverse().forEach((v, i) => g.lineTo(84 + (pts.length - 1 - i) * 34, 930 - v * 2.6 + 18));
    g.fill();
    g.strokeStyle = '#f2b544';
    g.lineWidth = 5;
    g.lineJoin = 'round';
    g.beginPath();
    pts.forEach((v, i) => g.lineTo(84 + i * 34, 930 - v * 2.6));
    g.stroke();
    g.fillStyle = '#f2b544';
    g.font = '700 22px -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillText('T E L E G R A M   B O T   +   W E B S I T E', 82, 140);
    g.fillStyle = '#ffffff';
    g.font = '800 104px -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillText('Bozor', 74, 262);
    g.fillText('Narxi', 74, 370);
    ['Qayerda arzon?', 'Trol narxni buzolmaydi', 'Bozorlik ro'yxati hisobi'].forEach((t, i) => {
      g.fillStyle = ['#f2b544', '#ff8a65', '#7fd6a2'][i];
      g.beginPath(); g.arc(92, 452 + i * 58, 8, 0, 7); g.fill();
      g.fillStyle = '#eef3ee';
      g.font = '500 33px -apple-system, Segoe UI, Roboto, sans-serif';
      g.fillText(t, 118, 464 + i * 58);
    });
    g.fillStyle = 'rgba(242,181,68,0.9)';
    g.font = '600 25px -apple-system, Segoe UI, Roboto, sans-serif';
    g.fillText('xoliddev', 82, 680);
    const place = (img, x, y, h, radius) => {
      const w = (img.width * h) / img.height;
      g.save();
      g.shadowColor = 'rgba(0,0,0,0.6)';
      g.shadowBlur = 50;
      g.shadowOffsetY = 24;
      g.beginPath();
      g.roundRect(x, y, w, h, radius);
      g.fillStyle = '#000';
      g.fill();
      g.shadowColor = 'transparent';
      g.clip();
      g.drawImage(img, x, y, w, h);
      g.restore();
      return w;
    };
    const winH = 680;
    const winW = (wn.width * winH) / wn.height;
    place(wn, 1600 - 70 - winW, 90, winH, 18);
    place(ph, 1600 - 70 - winW - 170, 210, 720, 52);
    const o = document.createElement('canvas');
    o.width = 800;
    o.height = 500;
    const og = o.getContext('2d');
    og.imageSmoothingQuality = 'high';
    og.drawImage(cv, 0, 0, 800, 500);
    return o.toDataURL('image/jpeg', 0.9).split(',')[1];
  }, [b64(phone), b64(win)]);
  writeFileSync(`${OUT}/thumb.jpg`, out);
  console.log('wrote thumb.jpg'); // eslint-disable-line no-console
}

if (ONLY.has('desktop') || ONLY.has('thumb')) {
  const page = await open(1440, 900);
  for (const n of [1, 2, 3]) await step(page, n);
  await page.waitForTimeout(600);
  const phone = await page.getByTestId('dilshod-phone').screenshot();
  const win = await page.getByTestId('site-window').screenshot();
  if (ONLY.has('thumb')) await thumb(page, phone, win);
  if (ONLY.has('desktop')) {
    await toStage(page, 92);
    await page.waitForTimeout(300);
    await jpeg(page, await page.screenshot(), 'demo-desktop.jpg', 1440, 900);
  }
  await page.context().close();
}

if (ONLY.has('mobile')) {
  const page = await open(390, 844);
  for (const n of [1, 2, 3, 4, 5, 6]) await step(page, n);
  await page.getByTestId('switch-gulnora').click();
  await toStage(page, 50);
  await page.waitForTimeout(500);
  await jpeg(page, await page.screenshot(), 'demo-mobile.jpg', 390, 844);
  await page.context().close();
}

if (ONLY.has('gif')) {
  const page = await open(1360, 860);
  await step(page, 1);
  await toStage(page, 4);
  const clip = await page.evaluate(() => {
    const a = document.querySelector('[data-testid=dilshod-phone]').getBoundingClientRect();
    const c = document.querySelector('[data-testid=gulnora-phone]').getBoundingClientRect();
    return { x: Math.max(0, a.left - 6), y: Math.max(0, a.top - 4), width: c.right - a.left + 12, height: Math.min(window.innerHeight - a.top - 4, a.height * 0.92) };
  });
  const W = 760;
  const H = Math.round((W * clip.height) / clip.width / 2) * 2;
  const gif = GIFEncoder();
  async function frame(delay) {
    const png = await page.screenshot({ clip });
    const rgba = await page.evaluate(async ([src, w, h]) => {
      const img = new Image();
      img.src = `data:image/png;base64,${src}`;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.drawImage(img, 0, 0, w, h);
      const bytes = g.getImageData(0, 0, w, h).data;
      let bin = '';
      for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(bin);
    }, [b64(png), W, H]);
    const data = new Uint8Array(Buffer.from(rgba, 'base64'));
    const palette = quantize(data, 128);
    gif.writeFrame(applyPalette(data, palette), W, H, { palette, delay });
  }
  async function film(n, every = 600, max = 40) {
    await page.evaluate((k) => document.querySelector(`[data-testid=story-${k}]`).click(), n);
    for (let k = 0; k < max; k++) {
      await frame(every);
      if (await page.evaluate((s) => document.querySelector(`[data-testid=story-${s}]`).classList.contains('done'), n)) break;
      await page.waitForTimeout(every - 200);
    }
  }
  for (const n of [2, 3, 4, 6]) await film(n);
  await frame(2600);
  gif.finish();
  writeFileSync(`${OUT}/narx-grafik-royxat.gif`, gif.bytes());
  console.log('wrote narx-grafik-royxat.gif'); // eslint-disable-line no-console
  await page.context().close();
}
await browser.close();
server.close();
