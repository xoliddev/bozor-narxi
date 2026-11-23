"""The bot: buttons only. ``/start`` (with deep links ``p_<product>``, ``r_<bazaar>``, ``al_<product>``, ``list``, ``week``) is
the only command; a typed message is read only when the bot has just asked for a price or an alert's limit, and a photo
only right after a report (the price tag). Every button's data is checked against a fixed pattern."""

from __future__ import annotations

import re

from aiogram import F, Router
from aiogram.filters import CommandObject, CommandStart
from aiogram.types import CallbackQuery, Message

from ..core import prices
from ..i18n import Raw, cap, conf_text, loc, low, money, name, per_unit, t
from . import views
from .setup import show

router = Router()
fallback = Router()
ID = r"([a-z]{1,16})"
PATTERNS = [(name_, re.compile(rx)) for name_, rx in (
    ("menu", r"m"), ("lang", r"lang"), ("bazaars", r"r"), ("products", rf"r:{ID}"), ("ask", rf"r:{ID}:{ID}"), ("confirm", rf"ok:{ID}:{ID}"),
    ("cheap_pick", r"c"), ("cheap", rf"c:{ID}"), ("list", r"l"), ("list_pick", r"la"), ("list_amount", rf"la:{ID}"),
    ("list_put", rf"lq:{ID}:(\d{{1,3}})"), ("list_calc", r"lc"), ("list_clear", r"lx"), ("alerts", r"a"), ("alert_pick", r"an"),
    ("alert_ask", rf"an:{ID}"), ("alert_set", rf"as:{ID}:(\d{{1,9}})"), ("alert_del", r"ad:(\d{1,12})"), ("digest", r"dg"), ("week", r"w"),
    ("queue", r"q"), ("hide", r"qh:(\d{1,12})"), ("ban", r"qb:(-?\d{1,15})"))]


async def menu_screen(svc, me: int, lang: str, cfg) -> tuple:
    return views.menu(lang, await svc.me(me), svc.today(), await svc.week(), svc.products, cfg.site_url, cfg.webapp_url)


async def cheap_screen(svc, lang: str, pid: str, cfg) -> tuple:
    p, today = svc.product(pid), svc.today()
    wc = prices.where_cheap(p["id"], await svc.cells(), svc.bazaars, today)
    by = {x["day"]: x["city"] for x in (await svc.history(p["id"], 30))["series"]}
    spark = prices.sparkline([by.get(d) for d in range(today - 13, today + 1)])
    return views.cheap(lang, p, wc, (await svc.week())[p["id"]], spark, svc.bmap, cfg.site_url)


async def alert_screen(svc, lang: str, pid: str) -> tuple:
    p = svc.product(pid)
    return views.alert_ask(lang, p, prices.where_cheap(p["id"], await svc.cells(), svc.bazaars, svc.today()), svc.bmap)


async def ask_screen(svc, me: int, lang: str, bid: str, pid: str) -> tuple:
    b, p = svc.bazaar(bid), svc.product(pid)
    await svc.set_pending(me, {"kind": "price", "bazaar": b["id"], "product": p["id"], "at": svc.now()})
    return views.ask_price(lang, b, p, await svc.cell(svc.db.conn, b["id"], p["id"]), svc.now(), svc.today())


def pair_line(svc, lang: str, bid: str, pid: str, cell: dict | None) -> str:
    if cell is None:
        return ""
    conf = conf_text(lang, prices.confidence(cell, svc.now(), svc.today()))
    return f"{cap(loc(lang, svc.bmap[bid]))} {low(name(lang, svc.pmap[pid]))}: {per_unit(lang, svc.pmap[pid], cell['price'])} ({conf})"


async def queue_screen(svc, me: int, lang: str, head: str = "") -> tuple:
    q = await svc.queue(me)
    top = (head + "\n\n" if head else "") + t(lang, "mod.title")
    if not q:
        return f"{top}\n\n{t(lang, 'mod.empty')}", [views.back(lang)]
    text, rows = views.mod_item(lang, q[0], svc.pmap, svc.bmap)
    return f"{top}\n\n{text}", [*rows, views.back(lang)]


async def deep_link(arg: str, me: int, lang: str, svc, cfg) -> tuple | None:
    kind, _, rest = arg.partition("_")
    if kind == "p" and rest in svc.pmap:
        return await cheap_screen(svc, lang, rest, cfg)
    if kind == "r" and rest in svc.bmap:
        return views.pick_product(lang, svc.products, f"r:{rest}", t(lang, "rep.pick_product", bazaar=name(lang, svc.bmap[rest])), "r",
                                  tuple(svc.bmap[rest]["none"]))
    if kind == "al" and rest in svc.pmap:
        await svc.set_pending(me, {"kind": "alert", "product": rest, "at": svc.now()})
        return await alert_screen(svc, lang, rest)
    if arg == "list":
        return views.shopping(lang, await svc.get_list(me), svc.pmap)
    if arg == "week":
        return views.week(lang, await svc.week(), svc.pmap, cfg.site_url)
    return None


@router.message(CommandStart())
async def start(message: Message, command: CommandObject, me: int, lang: str, svc, cfg) -> None:
    await svc.set_pending(me, None)
    screen = await deep_link((command.args or "").strip()[:40], me, lang, svc, cfg) if command.args else None
    if screen is None:
        text, rows = await menu_screen(svc, me, lang, cfg)
        screen = (t(lang, "bot.hello", name=(await svc.user(me))["name"]) + "\n\n" + text, rows)
    await show(message, screen, cfg)


async def route(data: str, me: int, lang: str, svc, notifier, cfg, cb: CallbackQuery) -> tuple | None:
    found = next(((n, m) for n, rx in PATTERNS if (m := rx.fullmatch(data))), None)
    if found is None:
        await cb.answer(t(lang, "bot.stale"), show_alert=True)
        return None
    kind, m = found
    g = m.groups()
    if kind == "menu":
        await svc.set_pending(me, None)
        return await menu_screen(svc, me, lang, cfg)
    if kind == "lang":
        lang = await svc.set_lang(me, "ru" if lang == "uz" else "uz")
        return await menu_screen(svc, me, lang, cfg)
    if kind == "bazaars":
        return views.pick_bazaar(lang, svc.bazaars, "r", t(lang, "rep.pick_bazaar"))
    if kind == "products":
        b = svc.bazaar(g[0])
        return views.pick_product(lang, svc.products, f"r:{b['id']}", t(lang, "rep.pick_product", bazaar=name(lang, b)), "r", tuple(b["none"]))
    if kind == "ask":
        return await ask_screen(svc, me, lang, g[0], g[1])
    if kind == "confirm":
        out, notes = await svc.confirm(me, g[0], g[1])
        await svc.set_pending(me, {"kind": "photo", "report": out["report"], "at": svc.now()})
        await notifier.send(notes)
        return views.after_report(lang, out, svc.bmap[out["bazaar"]], svc.pmap[out["product"]])
    if kind == "cheap_pick":
        return views.pick_product(lang, svc.products, "c", t(lang, "cheap.pick"))
    if kind == "cheap":
        return await cheap_screen(svc, lang, g[0], cfg)
    if kind in ("list", "list_clear"):
        if kind == "list_clear":
            await svc.set_list(me, [])
        return views.shopping(lang, await svc.get_list(me), svc.pmap)
    if kind == "list_pick":
        return views.pick_product(lang, svc.products, "la", t(lang, "list.pick"), "l")
    if kind == "list_amount":
        cur = next((x["qty"] for x in await svc.get_list(me) if x["product"] == g[0]), None)
        return views.list_amount(lang, svc.product(g[0]), cur)
    if kind == "list_put":
        return views.shopping(lang, await svc.list_put(me, g[0], int(g[1])), svc.pmap)
    if kind == "list_calc":
        return views.list_result(lang, await svc.basket_for(me), svc.pmap, svc.bmap)
    if kind in ("alerts", "alert_del", "digest"):
        if kind == "alert_del":
            await svc.remove_alert(me, int(g[0]))
        if kind == "digest":
            await svc.set_digest(me, not (await svc.me(me))["digest"])
        return views.alerts(lang, await svc.alerts(me), (await svc.me(me))["digest"], svc.pmap)
    if kind == "alert_pick":
        return views.pick_product(lang, svc.products, "an", t(lang, "al.pick"), "a")
    if kind == "alert_ask":
        await svc.set_pending(me, {"kind": "alert", "product": svc.product(g[0])["id"], "at": svc.now()})
        return await alert_screen(svc, lang, g[0])
    if kind == "alert_set":
        return await set_alert(me, lang, svc, notifier, g[0], int(g[1]))
    if kind == "week":
        return views.week(lang, await svc.week(), svc.pmap, cfg.site_url)
    if kind == "queue":
        return await queue_screen(svc, me, lang)
    if kind == "hide":
        res, notes = await svc.hide(me, int(g[0]))
        await notifier.send(notes)
        head = t(lang, "mod.hidden", who=res["who"], before=res["before"], after=res["after"],
                 line=Raw(pair_line(svc, lang, res["bazaar"], res["product"], res["cell"])))
        return await queue_screen(svc, me, lang, head)
    res, notes = await svc.ban(me, int(g[0]))
    await notifier.send(notes)
    return await queue_screen(svc, me, lang, t(lang, "mod.banned", who=res["who"], n=res["n"]))


async def set_alert(me: int, lang: str, svc, notifier, pid: str, limit: object) -> tuple:
    items, notes = await svc.add_alert(me, pid, limit)
    await svc.set_pending(me, None)
    p = svc.product(pid)
    below = next(a["below"] for a in items if a["product"] == p["id"])
    text, rows = views.alerts(lang, items, (await svc.me(me))["digest"], svc.pmap)
    done = t(lang, "al.set", product=low(name(lang, p)), limit=Raw(money(lang, below)))
    await notifier.send(notes)
    return done + "\n\n" + text, rows


@router.callback_query()
async def on_button(cb: CallbackQuery, me: int, lang: str, svc, notifier, cfg) -> None:
    data = cb.data or ""
    screen = await route(data[:64], me, lang, svc, notifier, cfg, cb)
    if screen is not None:
        await show(cb, screen, cfg)


@router.message(F.text)
async def on_text(message: Message, me: int, lang: str, svc, notifier, cfg) -> None:
    pend = await svc.pending(me)
    text = (message.text or "")[:40]
    if pend and pend["kind"] == "price":
        out, notes = await svc.submit(me, pend["bazaar"], pend["product"], text)
        await svc.set_pending(me, {"kind": "photo", "report": out["report"], "at": svc.now()})
        await notifier.send(notes)
        await show(message, views.after_report(lang, out, svc.bmap[out["bazaar"]], svc.pmap[out["product"]]), cfg)
        return
    if pend and pend["kind"] == "alert":
        await show(message, await set_alert(me, lang, svc, notifier, pend["product"], text), cfg)
        return
    text_, rows = await menu_screen(svc, me, lang, cfg)
    await show(message, (t(lang, "bot.unknown") + "\n\n" + text_, rows), cfg)


@router.message(F.photo)
async def on_photo(message: Message, me: int, lang: str, svc, cfg) -> None:
    pend = await svc.pending(me)
    if pend and pend["kind"] == "photo":
        await svc.set_photo(me, pend["report"], message.photo[-1].file_id)
        await svc.set_pending(me, None)
        await show(message, (t(lang, "rep.photo_ok"), [[{"text": t(lang, "btn.again"), "data": "r"}, {"text": t(lang, "btn.menu"), "data": "m"}]]), cfg)
        return
    text_, rows = await menu_screen(svc, me, lang, cfg)
    await show(message, (t(lang, "bot.unknown") + "\n\n" + text_, rows), cfg)


@fallback.message()
async def anything_else(message: Message, me: int, lang: str, svc, cfg) -> None:
    text_, rows = await menu_screen(svc, me, lang, cfg)
    await show(message, (t(lang, "bot.unknown") + "\n\n" + text_, rows), cfg)
