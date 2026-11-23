"""The one service the bot, the Mini App API, the public website API and the scheduler share, so every screen shows
the same numbers computed by the same core functions."""

from __future__ import annotations

from .alerts import AlertsMixin
from .base import Base
from .moderation import ModerationMixin
from .reports import ReportsMixin


class Service(ReportsMixin, AlertsMixin, ModerationMixin, Base):
    async def seed(self, world: dict) -> bool:
        """Fill an empty database with the invented city (core.seedgen). Returns False when there is data already."""
        if await self.db.one("SELECT 1 FROM reports LIMIT 1"):
            return False
        async with self.db.tx() as c:
            await c.executemany("INSERT OR IGNORE INTO users (id, name, lang, created_at, created_day, banned) VALUES (?, ?, 'uz', ?, ?, ?)",
                                [(u["id"], u["name"], self.now(), u["created_day"], u["banned"]) for u in world["users"]])
            await c.executemany("INSERT INTO reports (id, user, bazaar, product, day, at, price, confirm, hidden, verdict) "
                                "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                                [(r["id"], r["user"], r["bazaar"], r["product"], r["day"], r["at"], r["price"], r["confirm"], r["hidden"], r["verdict"])
                                 for r in world["reports"]])
            await c.executemany("INSERT INTO daily (bazaar, product, day, price, n, users, last_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                                [(d["bazaar"], d["product"], d["day"], d["price"], d["n"], d["users"], d["last_at"]) for d in world["daily"]])
        self.version += 1
        return True
