# Changelog

## 1.0.1 — 2026-11-23

- The receipt stays in the chat: "📝 Yana yuborish" and "🏠 Menyu" under "Rahmat!" (and under "Rasm qo'shildi") answer
  with a new message instead of editing the receipt away (callback data starts with `+`). The demo's step 8 uses
  "Yana yuborish" on the kartoshka receipt, so Dilshod's chat reads in order.

## 1.0.0 — 2026-11-23

Daily portfolio challenge #9.

- Pure core with a JavaScript port checked by shared vectors: the trust rules (a reference band against the last known
  price, a weighted median, MAD outliers, reporter weights from their track record, new accounts, hidden reports and
  bans), typed prices, "qayerda arzon" with the city median and savings, the chart series, the week-over-week change
  and the digest, the shopping list with distances and missing items, the Tashkent calendar, the seeded city relative
  to today, and the sentences in Uzbek and Russian.
- Service on SQLite (WAL, `BEGIN IMMEDIATE`): one report per person, bazaar, product and day, the day's price
  recomputed on every report, shubhali reports to moderators, hide and ban with recomputation, alerts fired once, the
  weekly digest once, the shopping list shared by the bot and the Mini App, cached public views.
- aiogram bot, buttons only, Uzbek and Russian: sending a price (or "✅ Shu narx") with the price tag's photo, qayerda
  arzon with a 14-day line, the shopping list, alerts, the weekly view, the moderators' queue.
- aiohttp: the public website and its API (no names, per-address rate limit), the Mini App API (initData, per-user
  rate limit, moderator-only routes); every page folder served explicitly.
- Website and Mini App: today's table, product pages with the ranking and an SVG chart, bazaars, the shopping list,
  the weekly view; alerts and moderation in the Mini App.
- Browser demo with two phones and the website in a browser window and a ten-step story; pytest, node tests and
  Playwright e2e; Docker (non-root, read-only), CI and GitHub Pages.
