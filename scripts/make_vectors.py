"""Regenerate shared/test_vectors.json from the Python core.

pytest checks that the file is up to date (so the Python core and the vectors never drift apart), and
``node --test`` checks the JS port against the very same vectors.

    python scripts/make_vectors.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from bozornarxi import i18n  # noqa: E402
from bozornarxi.core import basket, clock, prices, seedgen, text, trust  # noqa: E402

OUT = ROOT / "shared" / "test_vectors.json"
NOW = 1_795_000_000_000  # 2026-11-18 16:06 in Tashkent, a Wednesday
TODAY = clock.local_day(NOW)
NYE = clock.days_from_civil(2027, 1, 1)
MINUTE = 10 * 60 + 40


def load(name: str):
    with open(ROOT / "shared" / "data" / f"{name}.json", encoding="utf-8") as fh:
        return json.load(fh)


def res(fn, *args):
    try:
        return {"ok": fn(*args)}
    except text.InputError as e:
        return {"error": e.code}


def digest(obj) -> int:
    return text.h32(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))


def basics(v: dict) -> None:
    days = [0, TODAY, NYE - 1, NYE, clock.days_from_civil(2028, 2, 29)]
    v["civil"] = [{"day": d, "out": list(clock.civil(d)), "back": clock.days_from_civil(*clock.civil(d))} for d in days]
    v["minutes"] = [{"ms": ms, "day": clock.local_day(ms), "min": clock.local_minute(ms)}
                   for ms in (NOW, clock.at_local(NYE, 0) - 1, clock.at_local(NYE, 0), 0)]
    v["h32"] = [{"in": s, "out": text.h32(s)} for s in ("", "a", "n:3:chorsu:kartoshka", "Qo'yliq", "Картофель")]
    v["rdiv"] = [[a, b, trust.rdiv(a, b)] for a, b in ((5, 2), (-5, 2), (7, 3), (-7, 3), (1, 3), (-1, 2), (0, 9), (1199, 12))]
    v["round_to"] = [[x, u, trust.round_to(x, u)] for x, u in ((4549, 100), (4550, 100), (112_499, 1000), (112_500, 1000), (16_249, 500))]


def trust_cases(v: dict) -> None:
    v["weight"] = [[g, f, h, b, trust.weight_of(g, f, h, b)] for g, f, h, b in
                   ((0, 0, 0, 0), (10, 0, 0, 0), (40, 0, 0, 0), (3, 2, 0, 0), (0, 0, 1, 0), (50, 0, 0, 1), (5, 1, 1, 0))]
    v["trust_pct"] = [[w, trust.trust_pct(w)] for w in (0, 50, 300, 1000, 1500)]
    v["wmedian"] = [{"in": items, "out": trust.wmedian([tuple(x) for x in items])} for items in (
        [[4500, 1500, 1], [4900, 300, 2]], [[4400, 500, 1], [4800, 500, 2]], [[1, 1, 3], [2, 1, 2], [3, 1, 1]],
        [[10, 5, 1], [20, 1, 2], [30, 1, 3], [40, 1, 4]], [[7, 2, 9], [7, 2, 4], [9, 4, 1]])]
    v["median"] = [[xs, trust.median(xs)] for xs in ([], [5], [4, 1], [3, 1, 2], [10, 20, 30, 41])]
    rows = [{"bazaar": "chorsu", "day": TODAY - 1, "price": 4900}, {"bazaar": "oloy", "day": TODAY - 2, "price": 5600},
            {"bazaar": "oloy", "day": TODAY - 9, "price": 9000}, {"bazaar": "quyliq", "day": TODAY - 3, "price": 5200}]
    v["reference"] = [{"rows": rows, "bazaar": b, "day": d, "out": trust.reference(rows, b, d)}
                      for b, d in (("chorsu", TODAY), ("mirobod", TODAY), ("chorsu", TODAY + 9), ("oloy", TODAY - 1))]
    cases = []
    story = [{"id": 1, "user": 40, "price": 4900, "weight": 300, "at": 10}, {"id": 2, "user": 1, "price": 4500, "weight": 1500, "at": 20}]
    troll = [*story, {"id": 3, "user": 77, "price": 500, "weight": 300, "at": 30}]
    confirm = [*troll, {"id": 4, "user": 2, "price": 4500, "weight": 1500, "at": 40}, {"id": 5, "user": 3, "price": 4500, "weight": 1500, "at": 50}]
    shock = [{"id": i, "user": i, "price": 12000 + i * 100, "weight": 600, "at": i} for i in range(1, 5)]
    cases += [(story[:1], 4900, 100), (story, 4900, 100), (troll, 4900, 100), (confirm, 4900, 100), (shock, 5000, 100), (shock[:2], 5000, 100),
              ([{"id": 1, "user": 1, "price": 9000, "weight": 0, "at": 1}], None, 100), (story, None, 1000)]
    for k in range(24):  # generated cases: noise, a few far-off numbers, different weights
        n = 2 + k % 7
        base = 3000 + (text.h32(f"base{k}") % 90) * 1000
        rs = []
        for i in range(n):
            h = text.h32(f"case{k}:{i}")
            price = base * (1000 + h % 201 - 100) // 1000
            if h % 9 == 0:
                price = base * (5 + h % 400) // 100
            rs.append({"id": i + 1, "user": 1 + h % 5, "price": max(100, price), "weight": [0, 50, 300, 900, 1500][(h >> 8) % 5], "at": 1000 + i})
        cases.append((rs, base if k % 3 else None, (100, 500, 1000)[k % 3]))
    v["aggregate"] = [{"reports": r, "ref": ref, "unit": u, "out": list(trust.aggregate(r, ref, u))} for r, ref, u in cases]
    v["level"] = [[n, trust.level(n)] for n in (0, 1, 2, 3, 4, 9)]


def price_cases(v: dict, products: dict) -> None:
    texts = ["4500", "4 500", "4.500", "4,500", "4 500 so'm", "4500 сум", " 12 000 sum ", "4,5", "4 50", "abc", "", "1234567890", "112 000"]
    v["parse"] = [{"in": s, "out": res(prices.parse_price, s)} for s in texts]
    kart = products["kartoshka"]
    v["check"] = [{"in": x, "out": res(prices.check_price, kart, x)} for x in (4500, "4 500", 500, 999, 30_000, 30_001, True, 4.5, "x")]
    v["spark"] = [{"in": xs, "out": prices.sparkline(xs)} for xs in ([1, 2, 3, 4, 5, 6, 7, 8], [5, 5, 5], [None, 3, None, 9], [], [None])]
    v["saving"] = [[p, c, prices.saving(p, c)] for p, c in ((4500, 5200), (5200, 5200), (6100, 5200), (105_000, 114_500))]
    v["digest_in"] = [{"in": ch, "out": prices.digest(ch)} for ch in ({"a": -12, "b": 3, "c": None, "d": -3, "e": 9, "f": -3, "g": 0, "h": 1},
                                                                          {"x": 0}, {})]


def seeded(v: dict, products: list[dict], bazaars: list[dict], names: dict) -> dict:
    out = {}
    worlds = []
    for d, m in ((TODAY, MINUTE), (TODAY, 5 * 60), (NYE, 23 * 60 + 59), (TODAY - 40, 8 * 60)):
        w = seedgen.world(products, bazaars, names, d, m)
        out[(d, m)] = w
        worlds.append({"today": d, "minute": m, "sizes": {k: len(x) for k, x in w.items()}, "digest": {k: digest(x) for k, x in w.items()},
                       "reports": w["reports"][-3:], "daily": w["daily"][-2:]})
    v["world"] = worlds
    v["center"] = [[p["id"], b["id"], d, seedgen.center(p, b, d)] for p in products[:5] for b in bazaars[:3] for d in (0, 1, 13, 14, 60)]
    return out[(TODAY, MINUTE)]


def city(v: dict, w: dict, products: list[dict], bazaars: list[dict]) -> dict:
    cells = prices.cells(w["daily"], TODAY)
    v["cells_digest"] = digest(cells)
    v["where"] = {p["id"]: prices.where_cheap(p["id"], cells, bazaars, TODAY) for p in products}
    series = {p["id"]: prices.history([r for r in w["daily"] if r["product"] == p["id"]], TODAY - 89, TODAY) for p in products}
    v["history"] = {pid: {"len": len(s), "digest": digest(s), "last": s[-2:]} for pid, s in series.items()}
    v["week"] = {pid: prices.week_change(s, TODAY) for pid, s in series.items()}
    v["digest"] = prices.digest(v["week"])
    v["spark_seed"] = {pid: prices.sparkline([next((x["city"] for x in s if x["day"] == d), None) for d in range(TODAY - 13, TODAY + 1)])
                       for pid, s in list(series.items())[:4]}
    v["confidence"] = [prices.confidence(cells["chorsu"]["kartoshka"], NOW, TODAY), prices.confidence(cells["oloy"]["mol"], NOW + 3 * 3_600_000, TODAY + 1)]
    return cells


def baskets(v: dict, cells: dict, products: dict, bazaars: list[dict]) -> None:
    lists = [
        [{"product": "mol", "qty": 20}, {"product": "kartoshka", "qty": 30}, {"product": "piyoz", "qty": 10}, {"product": "sabzi", "qty": 20},
         {"product": "tuxum", "qty": 10}, {"product": "yog", "qty": 10}, {"product": "devzira", "qty": 10}],
        [{"product": "pomidor", "qty": 15}, {"product": "bodring", "qty": 5}],
        [{"product": "qoy", "qty": 5}],
    ]
    here = (41.3110, 69.2797)
    v["basket"] = [{"items": items, "here": h, "out": basket.basket(items, cells, bazaars, TODAY, h)} for items in lists for h in (None, here)]
    bad = [[{"product": "mol", "qty": 7}], [{"product": "nope", "qty": 10}], [{"product": "tuxum", "qty": 0}], "x",
           [{"product": "mol", "qty": 10}, {"product": "mol", "qty": 5}], [{"product": "un", "qty": "20"}], [{"product": "tuxum", "qty": 30}]]
    v["check_items"] = [{"in": b, "out": res(basket.check_items, b, products)} for b in bad]
    pts = [(41.3265, 69.2355), (41.3189, 69.2797), (41.2423, 69.3343), (41.3640, 69.2860)]
    v["distance"] = [[a, b, basket.distance_m(a, b)] for a in pts[:2] for b in pts]
    v["item_total"] = [[p, q, basket.item_total(p, q)] for p, q in ((4500, 15), (112_000, 20), (16_000, 10), (16_000, 7), (6_500, 5), (333, 5))]


def sentences(v: dict, cells: dict, products: dict, bazaars: dict, where: dict) -> None:
    out = {}
    for lang in ("uz", "ru"):
        kart, piyoz, tuxum, yog = products["kartoshka"], products["piyoz"], products["tuxum"], products["yog"]
        chorsu, oloy = bazaars["chorsu"], bazaars["oloy"]
        row = where["kartoshka"]["rows"][0]
        confs = [{"n": 5, "level": "high", "ago": 40, "days": 0}, {"n": 1, "level": "low", "ago": 0, "days": 0},
                 {"n": 3, "level": "mid", "ago": 135, "days": 0}, {"n": 2, "level": "mid", "ago": 999, "days": 1}, {"n": 1, "level": "low", "ago": 0, "days": 3}]
        out[lang] = {
            "money": [i18n.money(lang, n) for n in (0, 500, 4500, 112_000, 1_250_000)],
            "date": [i18n.date_short(lang, d) for d in (TODAY, NYE)],
            "per": [i18n.per_unit(lang, p, 16000) for p in (kart, yog, tuxum)],
            "amount": [i18n.amount(lang, p, q) for p, q in ((kart, 15), (kart, 30), (yog, 10), (tuxum, 10), (tuxum, 30))],
            "conf": [i18n.conf_text(lang, c) for c in confs],
            "saving": [i18n.saving_text(lang, {"pct": p}) for p in (13, 0, -4)],
            "short": [i18n.short_saving(lang, {"pct": p}) for p in (13, 0, -4)],
            "change": [i18n.change_text(lang, p) for p in (-12, 9, 0, None)],
            "signed": [i18n.signed(p) for p in (-12, 9, 0)],
            "thanks": i18n.thanks(lang, chorsu, kart, {"price": 4500, "n": 5}),
            "cheap": i18n.cheap_line(lang, bazaars[row["bazaar"]], kart, row),
            "best": [i18n.best_text(lang, oloy, 287_000, 41_000), i18n.best_text(lang, oloy, 287_000, 0)],
            "km": [i18n.km(lang, m) for m in (0, 800, 1000, 3200, 12_400)],
            "alert": i18n.alert_text(lang, piyoz, chorsu, 5800, 6000),
            "line": i18n.change_line(lang, piyoz, -12),
        }
    v["sentences"] = out


def build() -> dict:
    products, bazaars, names = load("products"), load("bazaars"), load("names")
    pmap, bmap = {p["id"]: p for p in products}, {b["id"]: b for b in bazaars}
    v: dict = {"now": NOW, "today": TODAY, "nye": NYE, "minute": MINUTE}
    basics(v)
    trust_cases(v)
    price_cases(v, pmap)
    w = seeded(v, products, bazaars, names)
    cells = city(v, w, products, bazaars)
    baskets(v, cells, pmap, bazaars)
    sentences(v, cells, pmap, bmap, v["where"])
    return v


def main() -> None:
    OUT.write_bytes((json.dumps(build(), ensure_ascii=False, indent=1) + "\n").encode("utf-8"))


if __name__ == "__main__":
    main()
