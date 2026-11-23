"""The bot's screens as pure functions: ``(text, rows)`` where a row is a list of buttons ``{text, data}``, ``{text, url}``
or ``{text, app}``. Every screen has "⬅️ Orqaga" (or "🏠 Menyu"). demo/bot-views.js is the same for the browser demo."""

from __future__ import annotations

import html

from ..core import prices
from ..core.clock import hhmm, local_minute
from ..core.trust import round_to
from ..i18n import Raw, amount, best_text, change_line, change_text, cheap_line, conf_text, date_short, km, money, name, per_unit, short_saving, t, thanks

Screen = tuple[str, list[list[dict]]]


def back(lang: str, data: str = "m") -> list[dict]:
    return [{"text": t(lang, "btn.back"), "data": data}]


def grid(items: list[dict], per_row: int = 2) -> list[list[dict]]:
    return [items[i:i + per_row] for i in range(0, len(items), per_row)]


def menu(lang: str, me: dict, today: int, week: dict, products: list[dict], site: str = "", app: str = "") -> Screen:
    dg = prices.digest(week)
    pmap = {p["id"]: p for p in products}
    best = t(lang, "wk.down") + ": " + ", ".join(change_line(lang, pmap[pid], pct) for pid, pct in dg["down"]) if dg["down"] else ""
    rows = [[{"text": t(lang, "btn.report"), "data": "r"}], [{"text": t(lang, "btn.cheap"), "data": "c"}, {"text": t(lang, "btn.list"), "data": "l"}],
            [{"text": t(lang, "btn.alerts"), "data": "a"}, {"text": t(lang, "btn.week"), "data": "w"}]]
    if app:
        rows.append([{"text": t(lang, "btn.app"), "app": ""}])
    if site:
        rows.append([{"text": t(lang, "btn.site"), "url": site}])
    if me.get("mod"):
        rows.append([{"text": t(lang, "btn.mod"), "data": "q"}])
    rows.append([{"text": t(lang, "btn.lang"), "data": "lang"}])
    return t(lang, "bot.menu", date=date_short(lang, today), best=Raw(best)), rows


def pick_bazaar(lang: str, bazaars: list[dict], prefix: str, title: str) -> Screen:
    return title, [*grid([{"text": name(lang, b), "data": f"{prefix}:{b['id']}"} for b in bazaars]), back(lang)]


def pick_product(lang: str, products: list[dict], prefix: str, title: str, back_to: str = "m", skip: tuple = ()) -> Screen:
    items = [{"text": name(lang, p), "data": f"{prefix}:{p['id']}"} for p in products if p["id"] not in skip]
    return title, [*grid(items), back(lang, back_to)]


def ask_price(lang: str, b: dict, p: dict, cell: dict | None, now: int, today: int) -> Screen:
    example = cell["price"] if cell else p["base"]
    head = {"bazaar": name(lang, b), "product": name(lang, p), "unit": t(lang, f"unit_long.{p['unit']}"), "example": example}
    if cell is None:
        return t(lang, "rep.ask_none", **head), [back(lang, f"r:{b['id']}")]
    text = t(lang, "rep.ask", **head, price=Raw(per_unit(lang, p, cell["price"])), conf=Raw(conf_text(lang, prices.confidence(cell, now, today))))
    return text, [[{"text": t(lang, "btn.confirm", price=Raw(money(lang, cell["price"]))), "data": f"ok:{b['id']}:{p['id']}"}], back(lang, f"r:{b['id']}")]


def after_report(lang: str, out: dict, b: dict, p: dict) -> Screen:
    rows = [[{"text": t(lang, "btn.again"), "data": f"r:{b['id']}"}, {"text": t(lang, "btn.menu"), "data": "m"}]]
    if out["status"] == "review":
        return t(lang, "say.review"), rows
    lines = [thanks(lang, b, p, out["cell"])]
    if out["replaced"]:
        lines.append(t(lang, "rep.replaced"))
    lines.append(t(lang, "rep.photo_hint"))
    return "\n\n".join(lines), rows


def cheap(lang: str, p: dict, wc: dict, change: int | None, spark: str, bmap: dict, site: str = "") -> Screen:
    rows = [[{"text": t(lang, "btn.alert_this"), "data": f"an:{p['id']}"}]]
    if site:
        rows.append([{"text": t(lang, "btn.chart"), "url": f"{site}#/p/{p['id']}"}])
    rows.append(back(lang, "c"))
    if not wc["rows"]:
        return f"<b>{html.escape(name(lang, p), quote=False)}</b>\n{t(lang, 'cheap.none')}", rows
    head = t(lang, "cheap.title", product=name(lang, p), unit=t(lang, f"unit_long.{p['unit']}"), city=Raw(money(lang, wc["city"])),
             change=Raw(change_text(lang, change) or "—"))
    best = wc["rows"][0]
    lines = [head, "", "✅ " + cheap_line(lang, bmap[best["bazaar"]], p, best), ""]
    lines += [t(lang, "cheap.row", i=i + 1, bazaar=name(lang, bmap[r["bazaar"]]), price=Raw(money(lang, r["price"])), short=Raw(short_saving(lang, r)))
              for i, r in enumerate(wc["rows"])]
    if spark:
        lines += ["", t(lang, "cheap.spark", line=spark)]
    return "\n".join(lines), rows


def shopping(lang: str, items: list[dict], pmap: dict) -> Screen:
    lines = [t(lang, "list.title"), ""]
    lines += [t(lang, "list.item", product=name(lang, pmap[x["product"]]), amount=Raw(amount(lang, pmap[x["product"]], x["qty"]))) for x in items]
    if not items:
        lines.append(t(lang, "list.empty"))
    rows = [[{"text": t(lang, "btn.add"), "data": "la"}]]
    if items:
        rows[0].append({"text": t(lang, "btn.calc"), "data": "lc"})
        rows.append([{"text": t(lang, "btn.clear"), "data": "lx"}])
    rows.append(back(lang))
    return "\n".join(lines), rows


AMOUNTS = {"kg": (5, 10, 15, 20, 30, 50), "l": (10, 20, 30, 50), "ten": (10, 20, 30, 50)}


def list_amount(lang: str, p: dict, current: int | None) -> Screen:
    opts = [q for q in AMOUNTS[p["unit"]] if q % p["step"] == 0]
    rows = grid([{"text": ("• " if q == current else "") + amount(lang, p, q), "data": f"lq:{p['id']}:{q}"} for q in opts], 3)
    if current:
        rows.append([{"text": t(lang, "btn.remove"), "data": f"lq:{p['id']}:0"}])
    rows.append(back(lang, "la"))
    return t(lang, "list.amount", product=name(lang, p)), rows


def list_result(lang: str, res: dict, pmap: dict, bmap: dict) -> Screen:
    lines = [t(lang, "list.result", count=len(res["items"])), ""]
    if res["best"]:
        lines += ["✅ " + best_text(lang, bmap[res["best"]], res["best_total"], res["saving"]), ""]
    else:
        lines += [t(lang, "list.no_best"), ""]
    for i, r in enumerate(res["rows"]):
        line = t(lang, "list.row", i=i + 1, bazaar=name(lang, bmap[r["bazaar"]]), total=Raw(money(lang, r["total"])))
        if "dist" in r:
            line += f" · {km(lang, r['dist'])}"
        if r["missing"]:
            line += "\n    ⚠️ " + t(lang, "list.missing", items=", ".join(name(lang, pmap[x]).lower() for x in r["missing"]))
        lines.append(line)
    return "\n".join(lines), [[{"text": t(lang, "btn.list"), "data": "l"}], back(lang, "l")]


def alerts(lang: str, items: list[dict], digest_on: bool, pmap: dict) -> Screen:
    open_ = [a for a in items if not a["fired_at"]]
    lines = [t(lang, "al.title"), ""]
    lines += [t(lang, "al.item", product=name(lang, pmap[a["product"]]), limit=Raw(money(lang, a["below"]))) for a in open_]
    if not open_:
        lines.append(t(lang, "al.none"))
    rows = [[{"text": t(lang, "btn.unalert", product=name(lang, pmap[a["product"]])), "data": f"ad:{a['id']}"}] for a in open_]
    rows += [[{"text": t(lang, "btn.new_alert"), "data": "an"}],
             [{"text": t(lang, "btn.digest_on" if digest_on else "btn.digest_off"), "data": "dg"}], back(lang)]
    return "\n".join(lines), rows


def alert_ask(lang: str, p: dict, wc: dict, bmap: dict) -> Screen:
    best = wc["rows"][0] if wc["rows"] else None
    line = cheap_line(lang, bmap[best["bazaar"]], p, best) if best else t(lang, "cheap.none")
    top = best["price"] if best else p["base"]
    opts = sorted({round_to(top * k // 100, p["round"]) for k in (95, 90, 85)} - {top}, reverse=True)
    rows = [[{"text": t(lang, "al.btn", price=Raw(money(lang, x))), "data": f"as:{p['id']}:{x}"} for x in opts], back(lang, "an")]
    return t(lang, "al.ask", product=name(lang, p), best=Raw(line)), rows


def week(lang: str, changes: dict, pmap: dict, site: str = "") -> Screen:
    dg = prices.digest(changes, top=5)
    lines = ["📊 <b>" + t(lang, "site.week_title") + "</b>", t(lang, "wk.note"), ""]
    for key, items in (("wk.down", dg["down"]), ("wk.up", dg["up"])):
        if items:
            lines += [f"{'⬇️' if key == 'wk.down' else '⬆️'} <b>{t(lang, key)}</b>", *(change_line(lang, pmap[pid], pct) for pid, pct in items), ""]
    if not dg["down"] and not dg["up"]:
        lines.append(t(lang, "wk.none"))
    rows = [[{"text": t(lang, "btn.site"), "url": f"{site}#/week"}]] if site else []
    return "\n".join(lines).strip(), [*rows, back(lang)]


def mod_item(lang: str, r: dict, pmap: dict, bmap: dict) -> Screen:
    p, b = pmap[r["product"]], bmap[r["bazaar"]]
    text = t(lang, "mod.item", bazaar=name(lang, b), product=name(lang, p), price=Raw(per_unit(lang, p, r["price"])),
             ref=Raw(money(lang, r["ref"]) if r["ref"] else "—"), who=r["who"], trust=r["trust"], time=hhmm(local_minute(r["at"])))
    return text, [[{"text": t(lang, "btn.hide"), "data": f"qh:{r['id']}"}, {"text": t(lang, "btn.ban"), "data": f"qb:{r['user']}"}]]

