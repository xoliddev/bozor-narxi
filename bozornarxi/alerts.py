"""Alerts ("Piyoz 1 kg 6 000 so'mdan arzon bo'lsa xabar ber", each fired once), the weekly digest (once per person per
week), and the shopping list (kept per person, so the bot and the Mini App show the same list)."""

from __future__ import annotations

from .base import checked
from .common import Refused
from .core import basket, prices
from .core.clock import weekday

MAX_ALERTS = 10
DIGEST_MINUTE = 9 * 60  # Monday morning, Tashkent time
ALERT_MIN_N = 2  # an alert fires on a price at least two reports agree on


class AlertsMixin:
    async def fire_alerts(self, c, product: str) -> list[dict]:
        """Open alerts for ``product`` whose limit today's cheapest well-supported price is under; each fires once."""
        today = self.today()
        rows = await self.qa(c, "SELECT bazaar, price FROM daily WHERE product = ? AND day = ? AND n >= ?", (product, today, ALERT_MIN_N))
        if not rows:
            return []
        order = {b["id"]: i for i, b in enumerate(self.bazaars)}
        best = min(rows, key=lambda r: (r["price"], order[r["bazaar"]]))
        due = await self.qa(c, "SELECT id, user, below FROM alerts WHERE product = ? AND fired_at IS NULL AND below > ? ORDER BY id", (product, best["price"]))
        notes = []
        for a in due:
            cur = await c.execute("UPDATE alerts SET fired_at = ?, fired_bazaar = ?, fired_price = ? WHERE id = ? AND fired_at IS NULL",
                                  (self.now(), best["bazaar"], best["price"], a["id"]))
            if cur.rowcount == 1:
                notes.append({"to": a["user"], "kind": "alert", "product": product, "bazaar": best["bazaar"], "price": best["price"], "below": a["below"]})
        return notes

    async def alerts(self, uid: int) -> list[dict]:
        """Open alerts and the ones fired in the last week."""
        rows = await self.db.all("SELECT * FROM alerts WHERE user = ? AND (fired_at IS NULL OR fired_at > ?) ORDER BY fired_at IS NOT NULL, id",
                                 (uid, self.now() - 7 * 86_400_000))
        return [{"id": r["id"], "product": r["product"], "below": r["below"], "fired_at": r["fired_at"], "bazaar": r["fired_bazaar"],
                 "price": r["fired_price"]} for r in rows]

    async def add_alert(self, uid: int, product: object, below: object) -> tuple[list[dict], list[dict]]:
        p = self.product(product)
        limit = checked(prices.check_price, p, below)
        async with self.db.tx() as c:
            await c.execute("DELETE FROM alerts WHERE user = ? AND product = ? AND fired_at IS NULL", (uid, p["id"]))
            count = await self.q1(c, "SELECT COUNT(*) AS n FROM alerts WHERE user = ? AND fired_at IS NULL", (uid,))
            if count["n"] >= MAX_ALERTS:
                raise Refused("alerts_full")
            await c.execute("INSERT INTO alerts (user, product, below, created_at) VALUES (?, ?, ?, ?)", (uid, p["id"], limit, self.now()))
            notes = await self.fire_alerts(c, p["id"])  # already true now: say so at once (and only once)
        return await self.alerts(uid), notes

    async def remove_alert(self, uid: int, alert: object) -> list[dict]:
        if not isinstance(alert, int) or isinstance(alert, bool):
            raise Refused("not_found")
        async with self.db.tx() as c:
            await c.execute("DELETE FROM alerts WHERE id = ? AND user = ?", (alert, uid))
        return await self.alerts(uid)

    async def set_digest(self, uid: int, on: object) -> bool:
        if not isinstance(on, bool):
            raise Refused("generic")
        async with self.db.tx() as c:
            await c.execute("UPDATE users SET digest = ? WHERE id = ?", (int(on), uid))
        return on

    async def digest_due(self) -> list[dict]:
        """Monday from 09:00: one weekly digest per person who wants it (a key in ``sent`` makes it once per week)."""
        today = self.today()
        if weekday(today) != 0 or self.minute() < DIGEST_MINUTE:
            return []
        notes = []
        async with self.db.tx() as c:
            for u in await self.qa(c, "SELECT id FROM users WHERE id > 0 AND digest = 1 AND banned = 0 ORDER BY id"):
                cur = await c.execute("INSERT OR IGNORE INTO sent (key, at) VALUES (?, ?)", (f"digest:{u['id']}:{today}", self.now()))
                if cur.rowcount == 1:
                    notes.append({"to": u["id"], "kind": "digest"})
        return notes

    # ── the shopping list ──
    async def get_list(self, uid: int) -> list[dict]:
        return await self.db.all("SELECT product, qty FROM lists WHERE user = ? ORDER BY pos, product", (uid,))

    async def set_list(self, uid: int, items: object) -> list[dict]:
        clean = checked(basket.check_items, items, self.pmap)
        async with self.db.tx() as c:
            await c.execute("DELETE FROM lists WHERE user = ?", (uid,))
            for i, it in enumerate(clean):
                await c.execute("INSERT INTO lists (user, product, qty, pos) VALUES (?, ?, ?, ?)", (uid, it["product"], it["qty"], i))
        return await self.get_list(uid)

    async def list_put(self, uid: int, product: object, qty: object) -> list[dict]:
        """Add a product, change its amount, or (qty 0) take it off the list."""
        p = self.product(product)
        items = [x for x in await self.get_list(uid) if x["product"] != p["id"]]
        if qty != 0:
            items.append({"product": p["id"], "qty": qty})
        return await self.set_list(uid, items)

    async def basket_for(self, uid: int, here: tuple[float, float] | None = None) -> dict:
        items = await self.get_list(uid)
        return {"items": items, **basket.basket(items, await self.cells(), self.bazaars, self.today(), here)}
