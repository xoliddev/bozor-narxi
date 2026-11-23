"""Reports and the shown prices: sending a price (or "shu narx ✅"), recomputing the bazaar-product-day with the trust
rules, the public views (today's table, a product's history, the weekly change). Every write bumps ``version`` so the
cached public views are rebuilt."""

from __future__ import annotations

import re

from .base import checked
from .common import Refused
from .core import prices, trust

PHOTO_ID = re.compile(r"[A-Za-z0-9_-]{10,200}")


class ReportsMixin:
    async def weights(self, c, users: set[int], day: int) -> dict[int, int]:
        """Each reporter's weight for ``day``: their verdicts on earlier days, every hidden report, a ban."""
        if not users:
            return {}
        ids = sorted(users)
        marks = ",".join("?" * len(ids))
        rows = await self.qa(c, f"SELECT user, SUM(verdict = 'ok' AND day < ? AND hidden = 0) AS good, "  # noqa: S608 - only '?' marks
                                f"SUM(verdict = 'far' AND day < ? AND hidden = 0) AS far, SUM(hidden) AS hid FROM reports "
                                f"WHERE user IN ({marks}) GROUP BY user", (day, day, *ids))
        banned = {r["id"] for r in await self.qa(c, f"SELECT id FROM users WHERE banned = 1 AND id IN ({marks})", tuple(ids))}  # noqa: S608
        stats = {r["user"]: r for r in rows}
        return {u: trust.weight_of(int(stats.get(u, {}).get("good") or 0), int(stats.get(u, {}).get("far") or 0),
                                   int(stats.get(u, {}).get("hid") or 0), u in banned) for u in ids}

    async def recompute(self, c, bazaar: str, product: str, day: int) -> dict | None:
        """The shown price of one bazaar-product-day from its reports (hidden ones left out); verdicts are stored."""
        rows = await self.qa(c, "SELECT id, user, price, at FROM reports WHERE bazaar = ? AND product = ? AND day = ? AND hidden = 0 ORDER BY id",
                             (bazaar, product, day))
        w = await self.weights(c, {r["user"] for r in rows}, day)
        for r in rows:
            r["weight"] = w[r["user"]]
        ref_rows = await self.qa(c, "SELECT bazaar, day, price FROM daily WHERE product = ? AND day BETWEEN ? AND ?", (product, day - trust.REF_DAYS, day - 1))
        res, verdicts = trust.aggregate(rows, trust.reference(ref_rows, bazaar, day), self.pmap[product]["round"])
        for rid, v in verdicts.items():
            await c.execute("UPDATE reports SET verdict = ? WHERE id = ?", (v, rid))
        if res:
            await c.execute("INSERT OR REPLACE INTO daily (bazaar, product, day, price, n, users, last_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                            (bazaar, product, day, res["price"], res["n"], res["users"], res["last_at"]))
        else:
            await c.execute("DELETE FROM daily WHERE bazaar = ? AND product = ? AND day = ?", (bazaar, product, day))
        self.version += 1
        return res

    async def cell(self, c, bazaar: str, product: str) -> dict | None:
        """This bazaar's fresh price for a product (today's, else yesterday's)."""
        row = await self.q1(c, "SELECT * FROM daily WHERE bazaar = ? AND product = ? AND day BETWEEN ? AND ? ORDER BY day DESC LIMIT 1",
                            (bazaar, product, self.today() - prices.FRESH_DAYS, self.today()))
        return {k: row[k] for k in ("price", "n", "users", "last_at", "day")} if row else None

    async def submit(self, uid: int, bazaar: object, product: object, price: object, confirm: bool = False) -> tuple[dict, list[dict]]:
        """A person reports a price. Returns what the bot says back and the notes to send (alerts, moderators)."""
        b, p = self.bazaar(bazaar), self.product(product)
        n = checked(prices.check_price, p, price)
        today, now = self.today(), self.now()
        async with self.db.tx() as c:
            u = await self.q1(c, "SELECT banned FROM users WHERE id = ?", (uid,))
            if u is None:
                raise Refused("auth")
            if u["banned"]:
                raise Refused("banned")
            old = await self.q1(c, "SELECT id FROM reports WHERE user = ? AND bazaar = ? AND product = ? AND day = ?", (uid, b["id"], p["id"], today))
            if old is None:
                count = await self.q1(c, "SELECT COUNT(*) AS n FROM reports WHERE user = ? AND day = ?", (uid, today))
                if count["n"] >= prices.MAX_REPORTS_PER_DAY:
                    raise Refused("daily_limit")
            await c.execute("INSERT INTO reports (user, bazaar, product, day, at, price, confirm) VALUES (?, ?, ?, ?, ?, ?, ?) "
                            "ON CONFLICT (user, bazaar, product, day) DO UPDATE SET at = excluded.at, price = excluded.price, "
                            "confirm = excluded.confirm, photo = NULL, hidden = 0, verdict = ''",
                            (uid, b["id"], p["id"], today, now, n, int(confirm)))
            rep = await self.q1(c, "SELECT id FROM reports WHERE user = ? AND bazaar = ? AND product = ? AND day = ?", (uid, b["id"], p["id"], today))
            res = await self.recompute(c, b["id"], p["id"], today)
            mine = await self.q1(c, "SELECT verdict FROM reports WHERE id = ?", (rep["id"],))
            notes: list[dict] = []
            far = mine["verdict"] == "far"
            if far:
                notes += [{"to": m, "kind": "mod", "report": rep["id"]} for m in sorted(self.moderators) if m != uid]
            elif res:
                notes += await self.fire_alerts(c, p["id"])
        out = {"status": "review" if far else "ok", "report": rep["id"], "replaced": old is not None, "bazaar": b["id"], "product": p["id"],
               "price": n, "cell": None if far else (res and {**res, "day": today})}
        return out, notes

    async def confirm(self, uid: int, bazaar: object, product: object) -> tuple[dict, list[dict]]:
        """"Shu narx ✅": the person saw the price that is shown now."""
        b, p = self.bazaar(bazaar), self.product(product)
        cur = await self.cell(self.db.conn, b["id"], p["id"])
        if cur is None:
            raise Refused("not_found")
        return await self.submit(uid, b["id"], p["id"], cur["price"], confirm=True)

    async def set_photo(self, uid: int, report: object, file_id: object) -> None:
        """The price tag's photo (a Telegram file id) on the person's own report of today."""
        if not isinstance(report, int) or not isinstance(file_id, str) or not PHOTO_ID.fullmatch(file_id):
            raise Refused("generic")
        async with self.db.tx() as c:
            cur = await c.execute("UPDATE reports SET photo = ? WHERE id = ? AND user = ? AND day = ?", (file_id, report, uid, self.today()))
            if cur.rowcount != 1:
                raise Refused("not_found")

    # ── public views ──
    async def daily_rows(self, first: int, last: int, product: str | None = None) -> list[dict]:
        sql = "SELECT bazaar, product, day, price, n, users, last_at FROM daily WHERE day BETWEEN ? AND ?"
        args: tuple = (first, last)
        if product:
            sql, args = sql + " AND product = ?", (*args, product)
        return await self.db.all(sql + " ORDER BY day, bazaar, product", args)

    async def cells(self) -> dict:
        today = self.today()
        rows = await self.daily_rows(today - prices.FRESH_DAYS, today)
        return prices.cells(rows, today)

    async def week(self) -> dict[str, int | None]:
        """Every product's week-over-week change of the city price."""
        today = self.today()
        rows = await self.daily_rows(today - 13, today)
        by: dict[str, list[dict]] = {}
        for r in rows:
            by.setdefault(r["product"], []).append(r)
        return {p["id"]: prices.week_change(prices.history(by.get(p["id"], []), today - 13, today), today) for p in self.products}

    async def snapshot(self) -> dict:
        """Everything the website's first screen needs (no names, only counts)."""
        stamp = (self.version, self.today())
        hit = self._cache.get("snapshot")
        if hit and hit[0] == stamp:
            return {**hit[1], "now": self.now()}
        value = {"today": self.today(), "cells": await self.cells(), "week": await self.week()}
        self._cache["snapshot"] = (stamp, value)
        return {**value, "now": self.now()}

    async def history(self, product: object, days: object) -> dict:
        p = self.product(product)
        if days not in (30, 90):
            raise Refused("generic")
        today = self.today()
        rows = await self.daily_rows(today - days + 1, today, p["id"])
        series = prices.history(rows, today - days + 1, today)
        return {"product": p["id"], "today": today, "days": days, "series": series}
