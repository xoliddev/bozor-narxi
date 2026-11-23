"""The service's foundation: the clock, the catalog (products and bazaars from shared/data), people, moderators, and
the small queries every rule needs. Reports and prices, alerts and lists, moderation and seeding live in their own
modules and are mixed into ``Service``."""

from __future__ import annotations

import json
import time
from collections.abc import Callable
from pathlib import Path

from .common import Refused
from .core.clock import local_day, local_minute
from .core.text import InputError, clean
from .db import Database

DATA = Path(__file__).resolve().parent.parent / "shared" / "data"


def load(name: str):
    with open(DATA / f"{name}.json", encoding="utf-8") as fh:
        return json.load(fh)


def checked(fn, *args):
    """Run a core validator; its InputError becomes a Refused with the same code."""
    try:
        return fn(*args)
    except InputError as err:
        raise Refused(err.code) from err


def is_id(value: object, top: int = 10**12) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and 0 < value < top


class Base:
    def __init__(self, db: Database, clock: Callable[[], int] | None = None, moderators: frozenset[int] = frozenset()) -> None:
        self.db = db
        self.clock = clock or (lambda: int(time.time() * 1000))
        self.moderators = frozenset(moderators)
        self.products: list[dict] = load("products")
        self.bazaars: list[dict] = load("bazaars")
        self.pmap = {p["id"]: p for p in self.products}
        self.bmap = {b["id"]: b for b in self.bazaars}
        self.version = 0  # bumped on every change; cached public views are rebuilt when it moves
        self._cache: dict[str, tuple] = {}

    def now(self) -> int:
        return self.clock()

    def today(self) -> int:
        return local_day(self.now())

    def minute(self) -> int:
        return local_minute(self.now())

    def cached(self, key: str, build: Callable[[], object]):
        stamp = (self.version, self.today())
        hit = self._cache.get(key)
        if hit and hit[0] == stamp:
            return hit[1]
        value = build()
        self._cache[key] = (stamp, value)
        return value

    def product(self, pid: object) -> dict:
        if not isinstance(pid, str) or pid not in self.pmap:
            raise Refused("not_found")
        return self.pmap[pid]

    def bazaar(self, bid: object) -> dict:
        if not isinstance(bid, str) or bid not in self.bmap:
            raise Refused("not_found")
        return self.bmap[bid]

    # ── people ──
    async def touch_user(self, uid: int, name: str, lang_code: str | None) -> dict:
        """Register a Telegram user on first contact."""
        row = await self.user(uid)
        if row is None:
            lang = "ru" if (lang_code or "")[:2].lower() == "ru" else "uz"
            async with self.db.tx() as c:
                await c.execute("INSERT OR IGNORE INTO users (id, name, lang, created_at, created_day) VALUES (?, ?, ?, ?, ?)",
                                (uid, clean(name, 64) or "Xaridor", lang, self.now(), self.today()))
            row = await self.user(uid)
        return row

    async def user(self, uid: int) -> dict | None:
        return await self.db.one("SELECT * FROM users WHERE id = ?", (uid,))

    async def set_lang(self, uid: int, lang: object) -> str:
        if lang not in ("uz", "ru"):
            raise Refused("generic")
        async with self.db.tx() as c:
            await c.execute("UPDATE users SET lang = ? WHERE id = ?", (lang, uid))
        return lang

    def is_mod(self, uid: int) -> bool:
        return uid in self.moderators

    def need_mod(self, uid: int) -> None:
        if not self.is_mod(uid):
            raise Refused("forbidden")

    async def me(self, uid: int) -> dict:
        u = await self.user(uid)
        if u is None:
            raise Refused("auth")
        return {"id": uid, "name": u["name"], "lang": u["lang"], "mod": self.is_mod(uid), "digest": bool(u["digest"]),
                "banned": bool(u["banned"]), "today": self.today(), "now": self.now()}

    async def set_pending(self, uid: int, pend: dict | None) -> None:
        """What the bot waits for from this person next (a typed price, a photo, an alert's limit)."""
        async with self.db.tx() as c:
            await c.execute("UPDATE users SET pend = ? WHERE id = ?", (json.dumps(pend) if pend else None, uid))

    async def pending(self, uid: int) -> dict | None:
        u = await self.user(uid)
        if not u or not u["pend"]:
            return None
        pend = json.loads(u["pend"])
        return pend if self.now() - pend.get("at", 0) < 30 * 60_000 else None  # a question left for half an hour is forgotten

    # ── shared queries ──
    @staticmethod
    async def q1(c, sql: str, args: tuple = ()) -> dict | None:
        async with c.execute(sql, args) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    @staticmethod
    async def qa(c, sql: str, args: tuple = ()) -> list[dict]:
        async with c.execute(sql, args) as cur:
            return [dict(r) for r in await cur.fetchall()]
