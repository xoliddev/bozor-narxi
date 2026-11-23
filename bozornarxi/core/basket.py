"""Bozorlik ro'yxati: what a shopping list costs at every bazaar today, the cheapest bazaar, the saving against the
dearest one, how far each bazaar is, and which items have no price at a bazaar (shown, never guessed).

Amounts are whole tenths of the product's unit: 15 = 1.5 kg, 10 = 1 litre; for eggs (sold by ten) a tenth is one
egg, so 10 = "10 ta". The JS port is shared/basket.js."""

from __future__ import annotations

import math

from .prices import fresh
from .text import InputError, whole

MAX_ITEMS = 20
MAX_QTY = 500  # 50 kg of one thing is plenty for a family list


def check_items(items: object, products: dict[str, dict]) -> list[dict]:
    """``[{product, qty}]`` with known products, whole amounts in steps of the product, each product once."""
    if not isinstance(items, list) or len(items) > MAX_ITEMS:
        raise InputError("list")
    out, seen = [], set()
    for it in items:
        if not isinstance(it, dict) or it.get("product") not in products or it["product"] in seen:
            raise InputError("list")
        qty = whole(it.get("qty"), 1, MAX_QTY, "qty")
        if qty % products[it["product"]]["step"]:
            raise InputError("qty")
        seen.add(it["product"])
        out.append({"product": it["product"], "qty": qty})
    return out


def item_total(price: int, qty: int) -> int:
    """Price per unit x amount in tenths, rounded to whole so'm."""
    return (price * qty + 5) // 10


def distance_m(a: tuple[float, float], b: tuple[float, float]) -> int:
    """Straight-line distance in metres, rounded to 100 m (an equirectangular approximation is plenty inside a city)."""
    lat = math.radians((a[0] + b[0]) / 2)
    dx = (b[1] - a[1]) * math.cos(lat) * 111_320
    dy = (b[0] - a[0]) * 110_540
    return int(math.floor(math.sqrt(dx * dx + dy * dy) / 100 + 0.5)) * 100


def basket(items: list[dict], cells: dict[str, dict], bazaars: list[dict], today: int, here: tuple[float, float] | None = None) -> dict:
    """Totals per bazaar. Bazaars with every item priced come first, cheapest first; the others follow with the items
    they have no price for. The best bazaar and the saving are only taken among complete bazaars."""
    full, part = [], []
    for i, b in enumerate(bazaars):
        have = cells.get(b["id"], {})
        total, missing, priced = 0, [], 0
        for it in items:
            c = have.get(it["product"])
            if fresh(c, today):
                total += item_total(c["price"], it["qty"])
                priced += 1
            else:
                missing.append(it["product"])
        if not priced:
            continue
        row = {"bazaar": b["id"], "total": total, "missing": missing}
        if here is not None:
            row["dist"] = distance_m(here, (b["lat"], b["lon"]))
        (part if missing else full).append((i, row))
    full.sort(key=lambda x: (x[1]["total"], x[0]))
    part.sort(key=lambda x: (len(x[1]["missing"]), x[1]["total"], x[0]))
    best = full[0][1] if full else None
    worst = full[-1][1] if len(full) > 1 else None
    return {"rows": [r for _, r in full + part], "best": best["bazaar"] if best else None, "worst": worst["bazaar"] if worst else None,
            "best_total": best["total"] if best else 0, "saving": worst["total"] - best["total"] if best and worst else 0,
            "complete": len(full)}
