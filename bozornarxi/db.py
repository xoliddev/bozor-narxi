"""SQLite storage (aiosqlite, WAL). Parameterised SQL only. Times are UTC milliseconds, days Tashkent day numbers,
money whole so'm, amounts tenths of a unit.

Rules that must never break are in the schema too: one report per person, bazaar, product and day (a later one
replaces it), a price is positive, one open alert per person and product, a shopping-list amount is within range, a
digest or an alert key is sent once."""

from __future__ import annotations

import asyncio
import sqlite3
from contextlib import asynccontextmanager
from pathlib import Path

import aiosqlite

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, lang TEXT NOT NULL DEFAULT 'uz' CHECK (lang IN ('uz', 'ru')),
  created_at INTEGER NOT NULL, created_day INTEGER NOT NULL, banned INTEGER NOT NULL DEFAULT 0 CHECK (banned IN (0, 1)),
  digest INTEGER NOT NULL DEFAULT 1 CHECK (digest IN (0, 1)), pend TEXT
);
CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user INTEGER NOT NULL, bazaar TEXT NOT NULL, product TEXT NOT NULL,
  day INTEGER NOT NULL, at INTEGER NOT NULL, price INTEGER NOT NULL CHECK (price > 0),
  confirm INTEGER NOT NULL DEFAULT 0 CHECK (confirm IN (0, 1)), photo TEXT,
  hidden INTEGER NOT NULL DEFAULT 0 CHECK (hidden IN (0, 1)),
  verdict TEXT NOT NULL DEFAULT '' CHECK (verdict IN ('', 'ok', 'near', 'far', 'off')),
  UNIQUE (user, bazaar, product, day)
);
CREATE INDEX IF NOT EXISTS reports_pair ON reports(bazaar, product, day);
CREATE INDEX IF NOT EXISTS reports_user ON reports(user, day);
CREATE INDEX IF NOT EXISTS reports_day ON reports(day, verdict);
CREATE TABLE IF NOT EXISTS daily (
  bazaar TEXT NOT NULL, product TEXT NOT NULL, day INTEGER NOT NULL, price INTEGER NOT NULL CHECK (price > 0),
  n INTEGER NOT NULL CHECK (n > 0), users INTEGER NOT NULL, last_at INTEGER NOT NULL, PRIMARY KEY (bazaar, product, day)
);
CREATE INDEX IF NOT EXISTS daily_day ON daily(day, product);
CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT, user INTEGER NOT NULL, product TEXT NOT NULL, below INTEGER NOT NULL CHECK (below > 0),
  created_at INTEGER NOT NULL, fired_at INTEGER, fired_bazaar TEXT, fired_price INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS alerts_open ON alerts(user, product) WHERE fired_at IS NULL;
CREATE INDEX IF NOT EXISTS alerts_product ON alerts(product) WHERE fired_at IS NULL;
CREATE TABLE IF NOT EXISTS lists (
  user INTEGER NOT NULL, product TEXT NOT NULL, qty INTEGER NOT NULL CHECK (qty BETWEEN 1 AND 500), pos INTEGER NOT NULL,
  PRIMARY KEY (user, product)
);
CREATE TABLE IF NOT EXISTS sent (key TEXT PRIMARY KEY, at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS modlog (
  id INTEGER PRIMARY KEY AUTOINCREMENT, mod INTEGER NOT NULL, action TEXT NOT NULL CHECK (action IN ('hide', 'ban')),
  target INTEGER NOT NULL, at INTEGER NOT NULL
);
"""


class Database:
    def __init__(self, conn: aiosqlite.Connection) -> None:
        self.conn = conn
        self.lock = asyncio.Lock()  # one transaction at a time on this connection

    @classmethod
    async def open(cls, path: str) -> Database:
        if path != ":memory:":
            Path(path).parent.mkdir(parents=True, exist_ok=True)
        conn = await aiosqlite.connect(path, isolation_level=None)  # we issue BEGIN/COMMIT ourselves
        conn.row_factory = aiosqlite.Row
        await conn.execute("PRAGMA journal_mode=WAL")
        await conn.execute("PRAGMA synchronous=NORMAL")
        await conn.execute("PRAGMA busy_timeout=5000")
        await conn.executescript(SCHEMA)
        return cls(conn)

    async def close(self) -> None:
        await self.conn.close()

    @asynccontextmanager
    async def tx(self):
        """``BEGIN IMMEDIATE`` takes the write lock up front, so "write the report, recompute the day's price, fire the
        alerts" happens as one step, neither interleaved between coroutines nor between processes."""
        async with self.lock:
            for attempt in range(6):
                try:
                    await self.conn.execute("BEGIN IMMEDIATE")
                    break
                except sqlite3.OperationalError as err:
                    if "locked" not in str(err) or attempt == 5:
                        raise
                    await asyncio.sleep(0.05 * (attempt + 1))
            try:
                yield self.conn
            except BaseException:
                await self.conn.execute("ROLLBACK")
                raise
            await self.conn.execute("COMMIT")

    async def one(self, sql: str, args: tuple = ()) -> dict | None:
        async with self.conn.execute(sql, args) as cur:
            row = await cur.fetchone()
        return dict(row) if row else None

    async def all(self, sql: str, args: tuple = ()) -> list[dict]:
        async with self.conn.execute(sql, args) as cur:
            return [dict(r) for r in await cur.fetchall()]
