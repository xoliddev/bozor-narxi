"""Shared helpers: the catalog, a clock the tests can move, the seeded city in a database, the people of the story."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager
from functools import cache
from pathlib import Path

from bozornarxi.core import seedgen
from bozornarxi.core.clock import at_local, local_day
from bozornarxi.db import Database
from bozornarxi.service import Service

ROOT = Path(__file__).resolve().parent.parent
NOW = 1_795_000_000_000  # Wednesday 2026-11-18 in Tashkent (the same day as the shared vectors)
TODAY = local_day(NOW)
START = at_local(TODAY, 10 * 60 + 40)
# Seeded people have negative ids (nobody can sign in as them); the tests make the story's ones positive so they can
# also use the bot and the Mini App like real people.
DILSHOD = 1  # seeded reporter -1, a long good track record (and a moderator in the tests)
CONFIRM = (2, 3)  # seeded reporters -2 and -3
GULNORA = 100_002
TROLL = 100_003
STRANGER = 7777


def load(name: str):
    with open(ROOT / "shared" / "data" / f"{name}.json", encoding="utf-8") as fh:
        return json.load(fh)


PRODUCTS, BAZAARS, NAMES = load("products"), load("bazaars"), load("names")
PMAP = {p["id"]: p for p in PRODUCTS}


@cache
def _world(today: int, minute: int) -> str:
    w = seedgen.world(PRODUCTS, BAZAARS, NAMES, today, minute)
    flip = {-1: DILSHOD, -2: CONFIRM[0], -3: CONFIRM[1]}
    for u in w["users"]:
        u["id"] = flip.get(u["id"], u["id"])
    for x in w["reports"]:
        x["user"] = flip.get(x["user"], x["user"])
    return json.dumps(w)


def world(now: int) -> dict:
    return json.loads(_world(local_day(now), (now - at_local(local_day(now), 0)) // 60_000))


class Clock:
    def __init__(self, start: int = START) -> None:
        self.now = start

    def __call__(self) -> int:
        return self.now

    def skip(self, minutes: float = 0, days: float = 0) -> None:
        self.now += int((minutes * 60 + days * 86_400) * 1000)

    def at(self, day: int, minute: int) -> None:
        self.now = at_local(day, minute)


@asynccontextmanager
async def service_env(clock: Clock | None = None, path: str = ":memory:", seed: bool = True, mods: frozenset[int] = frozenset({DILSHOD})):
    clock = clock or Clock()
    db = await Database.open(path)
    svc = Service(db, clock=clock, moderators=mods)
    if seed:
        await svc.seed(world(clock.now))
    for uid, name in ((DILSHOD, "Dilshod"), (GULNORA, "Gulnora"), (TROLL, "Tez narx"), (STRANGER, "Test"), *((c, "Tasdiq") for c in CONFIRM)):
        await svc.touch_user(uid, name, "uz")
    try:
        yield svc, clock
    finally:
        await db.close()
