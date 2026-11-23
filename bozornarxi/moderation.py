"""Moderators (MODERATOR_IDS): the queue of shubhali reports, hiding a report and banning a reporter. Both recompute the
affected prices at once; a hidden report also lowers its author's weight. Reporter names are shown here only, never on
the public site."""

from __future__ import annotations

from .base import is_id
from .common import Refused
from .core import trust


class ModerationMixin:
    async def _trust(self, c, uid: int) -> int:
        return trust.trust_pct((await self.weights(c, {uid}, self.today()))[uid])

    async def report_view(self, rid: int) -> dict | None:
        """A report as a moderator sees it: where, what, how much, the usual price, who sent it and their trust."""
        c = self.db.conn
        r = await self.q1(c, "SELECT r.*, u.name AS who, u.banned FROM reports r JOIN users u ON u.id = r.user WHERE r.id = ?", (rid,))
        if r is None:
            return None
        refs = await self.qa(c, "SELECT bazaar, day, price FROM daily WHERE product = ? AND day BETWEEN ? AND ?",
                             (r["product"], r["day"] - trust.REF_DAYS, r["day"] - 1))
        return {"id": r["id"], "bazaar": r["bazaar"], "product": r["product"], "price": r["price"], "at": r["at"], "day": r["day"],
                "user": r["user"], "who": r["who"], "trust": await self._trust(c, r["user"]), "ref": trust.reference(refs, r["bazaar"], r["day"]),
                "hidden": bool(r["hidden"]), "banned": bool(r["banned"]), "verdict": r["verdict"]}

    async def queue(self, uid: int) -> list[dict]:
        """Shubhali reports of today and yesterday that nobody has dealt with yet, newest first."""
        self.need_mod(uid)
        ids = await self.db.all("SELECT r.id FROM reports r JOIN users u ON u.id = r.user WHERE r.day >= ? AND r.verdict = 'far' "
                                "AND r.hidden = 0 AND u.banned = 0 ORDER BY r.at DESC, r.id DESC LIMIT 20", (self.today() - 1,))
        return [await self.report_view(x["id"]) for x in ids]

    async def _refresh_user(self, c, uid: int, since: int) -> list[dict]:
        """Recompute every bazaar-product-day this person reported on since ``since`` (their weight changed)."""
        notes = []
        for pair in await self.qa(c, "SELECT DISTINCT bazaar, product, day FROM reports WHERE user = ? AND day >= ? ORDER BY day, bazaar, product",
                                  (uid, since)):
            res = await self.recompute(c, pair["bazaar"], pair["product"], pair["day"])
            if res and pair["day"] == self.today():
                notes += await self.fire_alerts(c, pair["product"])
        return notes

    async def hide(self, mod: int, report: object) -> tuple[dict, list[dict]]:
        self.need_mod(mod)
        if not is_id(report):
            raise Refused("not_found")
        async with self.db.tx() as c:
            r = await self.q1(c, "SELECT * FROM reports WHERE id = ?", (report,))
            if r is None:
                raise Refused("not_found")
            before = await self._trust(c, r["user"])
            await c.execute("UPDATE reports SET hidden = 1 WHERE id = ?", (report,))
            await c.execute("INSERT INTO modlog (mod, action, target, at) VALUES (?, 'hide', ?, ?)", (mod, report, self.now()))
            res = await self.recompute(c, r["bazaar"], r["product"], r["day"])
            notes = await self._refresh_user(c, r["user"], self.today())
            if res and r["day"] == self.today():
                notes += await self.fire_alerts(c, r["product"])
            after = await self._trust(c, r["user"])
            cell = await self.cell(c, r["bazaar"], r["product"])
        who = await self.user(r["user"])
        return {"report": r["id"], "user": r["user"], "who": who["name"] if who else "?", "before": before, "after": after,
                "bazaar": r["bazaar"], "product": r["product"], "cell": cell}, notes

    async def ban(self, mod: int, user: object) -> tuple[dict, list[dict]]:
        self.need_mod(mod)
        if not isinstance(user, int) or isinstance(user, bool) or user == mod or self.is_mod(user):
            raise Refused("forbidden")
        async with self.db.tx() as c:
            u = await self.q1(c, "SELECT name FROM users WHERE id = ?", (user,))
            if u is None:
                raise Refused("not_found")
            await c.execute("UPDATE users SET banned = 1 WHERE id = ?", (user,))
            await c.execute("INSERT INTO modlog (mod, action, target, at) VALUES (?, 'ban', ?, ?)", (mod, user, self.now()))
            n = await self.q1(c, "SELECT COUNT(*) AS n FROM reports WHERE user = ? AND hidden = 0", (user,))
            notes = await self._refresh_user(c, user, self.today() - 1)
        return {"user": user, "who": u["name"], "n": n["n"]}, notes
