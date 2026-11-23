"""Prices for people: checking a typed price, "qayerda arzon?" (today's price at every bazaar, ranked, against the city
median), the price-change chart's series, the week-over-week change and the weekly digest. Whole numbers only; the JS
port (shared/prices.js) is checked against the same vectors."""

from __future__ import annotations

import re

from .text import InputError
from .trust import level, median, rdiv, round_to

WORDS = re.compile(r"(so['‘’`]?m|сум|sum)\.?", re.IGNORECASE)
GROUPED = re.compile(r"\d{1,3}(?:[ .,'’]\d{3})+")
PLAIN = re.compile(r"\d{1,9}")
FRESH_DAYS = 1  # today's price, or yesterday's when nobody has reported today yet
MAX_REPORTS_PER_DAY = 40


def parse_price(text: object) -> int:
    """"4 500", "4500", "4.500", "4 500 so'm" -> 4500. Decimals ("4,5") are refused: prices are whole so'm."""
    if not isinstance(text, str):
        raise InputError("price_format")
    s = WORDS.sub("", text.strip()).strip()
    if GROUPED.fullmatch(s):
        s = re.sub(r"\D", "", s)
    if not PLAIN.fullmatch(s):
        raise InputError("price_format")
    return int(s)


def check_price(product: dict, value: object) -> int:
    """A whole number of so'm within the product's range (per kg, litre or 10 eggs)."""
    if isinstance(value, bool) or not isinstance(value, int | str):
        raise InputError("price_format")
    n = parse_price(value) if isinstance(value, str) else value
    if not product["min"] <= n <= product["max"]:
        raise InputError("price_range")
    return n


def fresh(cell: dict | None, today: int) -> bool:
    return cell is not None and cell["day"] >= today - FRESH_DAYS


def rank(product: str, cells: dict[str, dict], bazaars: list[dict], today: int) -> list[dict]:
    """Bazaars with a fresh price for ``product``, cheapest first (ties in the catalog's order)."""
    out = []
    for i, b in enumerate(bazaars):
        c = cells.get(b["id"], {}).get(product)
        if fresh(c, today):
            out.append((c["price"], i, {"bazaar": b["id"], **c}))
    return [x[2] for x in sorted(out, key=lambda x: (x[0], x[1]))]


def city_median(prices: list[int]) -> int | None:
    """The city's price: the median of the bazaars' prices, rounded to 100 so'm."""
    m = median(prices)
    return None if m is None else round_to(m, 100)


def saving(price: int, city: int) -> dict:
    """How a price compares with the city median: percent (rounded) and so'm. Positive = cheaper."""
    return {"pct": rdiv((city - price) * 100, city), "som": city - price}


def where_cheap(product: str, cells: dict[str, dict], bazaars: list[dict], today: int) -> dict:
    """"Qayerda arzon?" for one product: the ranked bazaars with their saving, the city median, the cheapest one."""
    ranked = rank(product, cells, bazaars, today)
    city = city_median([r["price"] for r in ranked])
    rows = [{**r, **saving(r["price"], city), "level": level(r["n"])} for r in ranked] if city else []
    return {"product": product, "city": city, "rows": rows, "best": rows[0]["bazaar"] if rows else None,
            "spread": rows[-1]["price"] - rows[0]["price"] if rows else 0}


def confidence(cell: dict, now: int, today: int) -> dict:
    """What the label under a price says: how many reports, how long ago (minutes), today or an earlier day."""
    return {"n": cell["n"], "level": level(cell["n"]), "ago": max(0, (now - cell["last_at"]) // 60_000), "days": today - cell["day"]}


def history(rows: list[dict], first: int, last: int) -> list[dict]:
    """The chart's series for one product: per day with data, the city median, the cheapest and dearest bazaar and
    every bazaar's price. ``rows`` are daily prices ``{bazaar, day, price}``."""
    days: dict[int, dict[str, int]] = {}
    for r in rows:
        if first <= r["day"] <= last:
            days.setdefault(r["day"], {})[r["bazaar"]] = r["price"]
    out = []
    for d in sorted(days):
        by = days[d]
        vals = list(by.values())
        out.append({"day": d, "city": city_median(vals), "lo": min(vals), "hi": max(vals), "by": dict(sorted(by.items()))})
    return out


def week_change(series: list[dict], today: int) -> int | None:
    """Percent change of the average city price over the last 7 days against the 7 days before (None without data)."""
    this = [p["city"] for p in series if today - 6 <= p["day"] <= today]
    prev = [p["city"] for p in series if today - 13 <= p["day"] <= today - 7]
    if not this or not prev:
        return None
    a, b = sum(this) // len(this), sum(prev) // len(prev)
    return rdiv((a - b) * 100, b)


def digest(changes: dict[str, int | None], top: int = 3) -> dict:
    """The weekly "nima arzonladi / qimmatladi": the biggest falls and rises of at least 1 %, ties in catalog order."""
    items = [(pct, i, pid) for i, (pid, pct) in enumerate(changes.items()) if pct is not None]
    down = [(pid, pct) for pct, _, pid in sorted(items) if pct <= -1][:top]
    up = [(pid, pct) for pct, _, pid in sorted(items, key=lambda x: (-x[0], x[1])) if pct >= 1][:top]
    return {"down": [list(x) for x in down], "up": [list(x) for x in up]}


BARS = "▁▂▃▄▅▆▇█"


def sparkline(values: list[int | None]) -> str:
    """A one-line chart for the bot: ▁▂▃▅▇, a dot for a day without data."""
    known = [v for v in values if v is not None]
    if not known:
        return ""
    lo, hi = min(known), max(known)
    span = hi - lo
    return "".join("·" if v is None else BARS[(v - lo) * 7 // span if span else 3] for v in values)


def cells(rows: list[dict], today: int) -> dict[str, dict[str, dict]]:
    """Today's table from daily prices: per bazaar and product the freshest price (today's, else yesterday's)."""
    out: dict[str, dict[str, dict]] = {}
    for r in rows:
        if r["day"] < today - FRESH_DAYS or r["day"] > today:
            continue
        cur = out.setdefault(r["bazaar"], {}).get(r["product"])
        if cur is None or r["day"] > cur["day"]:
            out[r["bazaar"]][r["product"]] = {"price": r["price"], "n": r["n"], "users": r["users"], "last_at": r["last_at"], "day": r["day"]}
    return out
