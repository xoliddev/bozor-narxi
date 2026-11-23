"""Texts from shared/locales/*.json (the website, the Mini App and the browser demo read the same files) and the
sentences every screen needs: money, amounts, "5 ta xabar, 40 daqiqa oldin", "Chorsuda kartoshka 4 500 so'm —
shahar o'rtachasidan 13% arzon", the shopping list's best bazaar, an alert. shared/i18n.js is the same code for the
browser, and shared/test_vectors.json checks that both write the very same sentence."""

from __future__ import annotations

import html
import json
import re
from functools import cache
from pathlib import Path

from .core.clock import civil

LOCALE_DIR = Path(__file__).resolve().parent.parent / "shared" / "locales"
_PLACEHOLDER = re.compile(r"\{(\w+)\}")
MINUS = "−"


def norm_lang(code: str | None) -> str:
    return "ru" if code and str(code)[:2].lower() == "ru" else "uz"


class Raw(str):
    """A parameter that is already safe HTML (for example a nested, already-rendered text)."""


@cache
def catalog(lang: str) -> dict[str, str]:
    with open(LOCALE_DIR / f"{lang}.json", encoding="utf-8") as fh:
        return json.load(fh)


def render(template: str, params: dict) -> str:
    def sub(m: re.Match) -> str:
        if m.group(1) not in params:
            return m.group(0)
        value = params[m.group(1)]
        return value if isinstance(value, Raw) else html.escape(str(value), quote=False)

    return _PLACEHOLDER.sub(sub, template)


def t(lang: str, key: str, **params: object) -> str:
    """Localized text; parameters are HTML-escaped unless wrapped in ``Raw``."""
    lang = norm_lang(lang)
    template = catalog(lang).get(key) or catalog("uz").get(key) or key
    return render(template, params)


def plain(text: str) -> str:
    """For callback alerts, which show plain text."""
    return html.unescape(re.sub(r"<[^>]+>", "", text))


def cap(s: str) -> str:
    return s[:1].upper() + s[1:]


def low(s: str) -> str:
    return s[:1].lower() + s[1:]


def group(n: int) -> str:
    """1250000 -> "1 250 000"."""
    s = str(abs(n))
    out = ""
    while len(s) > 3:
        out = " " + s[-3:] + out
        s = s[:-3]
    return ("-" if n < 0 else "") + s + out


def money(lang: str, n: int) -> str:
    return t(lang, "fmt.money", n=group(n))


def date_short(lang: str, day: int) -> str:
    _, m, d = civil(day)
    return t(lang, "fmt.day", d=d, month=t(lang, f"month.{m}"))


def name(lang: str, item: dict) -> str:
    """A product's or a bazaar's name in the language."""
    return item["ru"] if norm_lang(lang) == "ru" else item["uz"]


def loc(lang: str, bazaar: dict) -> str:
    """"Chorsuda" / "на Чорсу"."""
    return bazaar["ru_loc"] if norm_lang(lang) == "ru" else bazaar["uz_loc"]


def unit(lang: str, product: dict) -> str:
    return t(lang, f"unit.{product['unit']}")


def per_unit(lang: str, product: dict, price: int) -> str:
    """"4 500 so'm/kg"."""
    return t(lang, "fmt.per", money=Raw(money(lang, price)), unit=Raw(unit(lang, product)))


def amount(lang: str, product: dict, qty: int) -> str:
    """Tenths of a unit -> "1,5 kg", "1 l", "20 ta" (eggs are counted one by one)."""
    if product["unit"] == "ten":
        return t(lang, "fmt.pieces", n=qty)
    whole_, tenth = divmod(qty, 10)
    return t(lang, "fmt.amount", n=f"{whole_},{tenth}" if tenth else str(whole_), unit=Raw(unit(lang, product)))


def ago(lang: str, conf: dict) -> str:
    if conf["days"] == 1:
        return t(lang, "ago.yesterday")
    if conf["days"] > 1:
        return t(lang, "ago.days", n=conf["days"])
    if conf["ago"] < 1:
        return t(lang, "ago.now")
    if conf["ago"] < 60:
        return t(lang, "ago.min", n=conf["ago"])
    return t(lang, "ago.hour", n=conf["ago"] // 60)


def conf_text(lang: str, conf: dict) -> str:
    """"5 ta xabar, 40 daqiqa oldin" / "Kam ma'lumot · 1 ta xabar, 45 daqiqa oldin"."""
    key = "conf.low" if conf["level"] == "low" else "conf.n"
    return t(lang, key, n=conf["n"], ago=Raw(ago(lang, conf)))


def saving_text(lang: str, s: dict) -> str:
    if s["pct"] > 0:
        return t(lang, "save.cheaper", pct=s["pct"])
    if s["pct"] < 0:
        return t(lang, "save.dearer", pct=-s["pct"])
    return t(lang, "save.same")


def signed(pct: int) -> str:
    """-12 -> "−12%", 9 -> "+9%"."""
    return f"{MINUS}{-pct}%" if pct < 0 else f"+{pct}%" if pct > 0 else "0%"


def change_text(lang: str, pct: int | None) -> str:
    """The week-over-week arrow: "▼ 12%", "▲ 9%", "o'zgarmadi"."""
    if pct is None:
        return ""
    if pct == 0:
        return t(lang, "chg.flat")
    return t(lang, "chg.down" if pct < 0 else "chg.up", pct=abs(pct))


def thanks(lang: str, bazaar: dict, product: dict, cell: dict) -> str:
    """"Rahmat! Chorsuda kartoshka: bugun 4 500 so'm (5 ta xabar)"."""
    return t(lang, "say.thanks", loc=Raw(cap(loc(lang, bazaar))), product=low(name(lang, product)), price=Raw(money(lang, cell["price"])), n=cell["n"])


def cheap_line(lang: str, bazaar: dict, product: dict, row: dict) -> str:
    """"Chorsuda kartoshka 4 500 so'm — shahar o'rtachasidan 13% arzon"."""
    return cap(t(lang, "say.cheap", loc=Raw(loc(lang, bazaar)), product=low(name(lang, product)), price=Raw(money(lang, row["price"])),
                 saving=Raw(saving_text(lang, row))))


def best_text(lang: str, bazaar: dict, total: int, saving: int) -> str:
    """"Oloyda 287 000 so'm — eng qimmatidan 41 000 so'm tejaysiz"."""
    key = "say.best" if saving > 0 else "say.best_one"
    return cap(t(lang, key, loc=Raw(loc(lang, bazaar)), total=Raw(money(lang, total)), saving=Raw(money(lang, saving))))


def km(lang: str, metres: int) -> str:
    if metres < 1000:
        return t(lang, "fmt.m", n=metres)
    whole_, rest = divmod(metres, 1000)
    return t(lang, "fmt.km", n=f"{whole_},{rest // 100}" if rest else str(whole_))


def alert_text(lang: str, product: dict, bazaar: dict, price: int, limit: int) -> str:
    """"🔔 Piyoz Chorsuda 5 800 so'm/kg — siz kutgan 6 000 so'mdan arzon"."""
    return t(lang, "say.alert", product=name(lang, product), loc=Raw(loc(lang, bazaar)), price=Raw(per_unit(lang, product, price)),
             limit=Raw(money(lang, limit)))


def change_line(lang: str, product: dict, pct: int) -> str:
    """"piyoz −12%"."""
    return f"{html.escape(low(name(lang, product)), quote=False)} {signed(pct)}"


def short_saving(lang: str, s: dict) -> str:
    """The same comparison in a table cell: "13% arzon", "4% qimmat", "o'rtacha"."""
    if s["pct"] > 0:
        return t(lang, "short.cheaper", pct=s["pct"])
    if s["pct"] < 0:
        return t(lang, "short.dearer", pct=-s["pct"])
    return t(lang, "short.same")
