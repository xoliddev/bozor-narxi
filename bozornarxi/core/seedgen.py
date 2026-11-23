"""The seeded city: ~90 days of invented price reports at real Tashkent bazaars, relative to "today".

Everything is made up: the reporters, their numbers, the trolls. Prices follow a slow seasonal wave, a recent trend
(piyoz falls, pomidor rises over the last two weeks), each bazaar's own level per category and a few percent of noise
per report. Every number comes from a hash of (days ago, bazaar, product, k), so the seed is the same whatever the
date; only today's reports depend on the time of day (none before 06:30, all of them after 10:30). The shown prices
and every report's verdict are computed day by day with the real trust rules (core.trust), so the reputations in the
seed are the ones the rules would have produced. The JS port (shared/seedgen.js) builds the very same world.
"""

from __future__ import annotations

from .clock import at_local
from .text import h32
from .trust import aggregate, reference, round_to, weight_of

DAYS = 90
POPULAR = ("mol", "kartoshka", "piyoz", "sabzi", "pomidor", "tuxum")
COUNTS = {True: (0, 1, 1, 2, 2, 3, 4), False: (0, 0, 1, 1, 1, 2, 3)}
OPEN = 6 * 60 + 30  # the first reports of the morning
NEWBIE = -40  # a new account (weight of a beginner) whose single reports start today's story
PINS = {("chorsu", "kartoshka"): (4900, 9 * 60 + 55), ("chorsu", "piyoz"): (6200, 9 * 60 + 50)}


def center(p: dict, b: dict, d: int) -> int:
    """The typical price of product ``p`` at bazaar ``b`` ``d`` days ago."""
    drift = -p["trend"] * min(d, 14) // 14
    t = (d + p["phase"]) % 120
    tri = abs(2 * t - 120) * 2000 // 120 - 1000
    c = p["base"] * (1000 + drift + p["wave"] * tri // 1000) // 1000
    return c * b["level"][p["cat"]] // 1000


def _clamp(p: dict, price: int) -> int:
    return max(p["min"], min(p["max"], round_to(price, p["round"])))


def people(names: dict, today: int) -> list[dict]:
    users = [{"id": -(i + 1), "name": n, "created_day": today - 400 + i * 5, "banned": 0} for i, n in enumerate(names["reporters"])]
    users += [{"id": -(31 + j), "name": n, "created_day": today - 50 + j * 7, "banned": 1 if j == 2 else 0} for j, n in enumerate(names["trolls"])]
    users.append({"id": NEWBIE, "name": "Nigora", "created_day": today - 2, "banned": 0})
    return users


def raw_reports(products: list[dict], bazaars: list[dict], today: int, minute: int) -> list[dict]:
    out: list[dict] = []

    def add(user: int, b: dict, p: dict, d: int, m: int, price: int, hidden: int = 0) -> None:
        out.append({"id": len(out) + 1, "user": user, "bazaar": b["id"], "product": p["id"], "day": today - d, "at": at_local(today - d, m),
                    "price": price, "confirm": 0, "hidden": hidden, "verdict": "far" if hidden else ""})

    for d in range(DAYS - 1, -1, -1):
        for b in bazaars:
            for p in products:
                if p["id"] in b["none"]:
                    continue
                key = f"{d}:{b['id']}:{p['id']}"
                pin = PINS.get((b["id"], p["id"])) if d == 0 else None
                if pin:
                    if minute > OPEN:
                        add(NEWBIE, b, p, 0, min(minute - 1, pin[1]), pin[0])
                    continue
                c = center(p, b, d)
                n = COUNTS[p["id"] in POPULAR][h32("n:" + key) % 7]
                hb = h32("u:" + key) % 60
                first = hb % 6 if hb < 30 else hb - 30
                for k in range(n):
                    h = h32(f"r:{key}:{k}")
                    m = OPEN + h % 240
                    if d == 0 and m >= minute:
                        continue
                    add(-((first + k * 7) % 30 + 1), b, p, d, m, _clamp(p, c * (1000 + (h >> 8) % 61 - 30) // 1000))
                ht = h32("t:" + key)
                m = OPEN + (ht >> 4) % 240
                if ht % 89 == 0 and not (d == 0 and m >= minute):
                    factor = 12 if (ht >> 12) % 2 else 380
                    add(-(31 + (ht >> 8) % 3), b, p, d, m, _clamp(p, c * factor // 100), hidden=1 if (ht >> 16) % 3 == 0 else 0)
    return out


def world(products: list[dict], bazaars: list[dict], names: dict, today: int, minute: int) -> dict:
    """Users (negative ids: nobody can sign in as them), reports with their verdicts, and the daily shown prices."""
    users = people(names, today)
    banned = {u["id"] for u in users if u["banned"]}
    reports = raw_reports(products, bazaars, today, minute)
    hidden: dict[int, int] = {}
    for r in reports:
        if r["hidden"]:
            hidden[r["user"]] = hidden.get(r["user"], 0) + 1
    good: dict[int, int] = {}
    far: dict[int, int] = {}
    units = {p["id"]: p["round"] for p in products}
    by_day: dict[int, dict[tuple[str, str], list[dict]]] = {}
    for r in reports:
        if not r["hidden"]:
            by_day.setdefault(r["day"], {}).setdefault((r["bazaar"], r["product"]), []).append(r)
    last: dict[str, dict[str, dict]] = {p["id"]: {} for p in products}
    daily: list[dict] = []
    for day in range(today - DAYS + 1, today + 1):
        done: list[tuple[str, str, dict]] = []
        for b in bazaars:
            for p in products:
                rows = by_day.get(day, {}).get((b["id"], p["id"]))
                if not rows:
                    continue
                for r in rows:
                    r["weight"] = weight_of(good.get(r["user"], 0), far.get(r["user"], 0), hidden.get(r["user"], 0), r["user"] in banned)
                res, verdicts = aggregate(rows, reference(list(last[p["id"]].values()), b["id"], day), units[p["id"]])
                for r in rows:
                    r["verdict"] = verdicts[r["id"]]
                    del r["weight"]
                if res:
                    row = {"bazaar": b["id"], "product": p["id"], "day": day, **res}
                    daily.append(row)
                    done.append((b["id"], p["id"], row))
        for bid, pid, row in done:
            last[pid][bid] = {"bazaar": bid, "day": row["day"], "price": row["price"]}
        for r in (x for rows in by_day.get(day, {}).values() for x in rows):
            if r["verdict"] == "ok":
                good[r["user"]] = good.get(r["user"], 0) + 1
            elif r["verdict"] == "far":
                far[r["user"]] = far.get(r["user"], 0) + 1
    return {"users": users, "reports": reports, "daily": daily}
