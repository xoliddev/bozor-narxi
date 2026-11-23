"""The service on SQLite: the demo's story end to end, recomputing matches the seed, limits, moderation, alerts once,
the weekly digest once, the shopping list."""

from __future__ import annotations

import pytest

from bozornarxi.common import Refused
from bozornarxi.core import prices, trust
from bozornarxi.core.clock import days_from_civil, weekday

from .helpers import CONFIRM, DILSHOD, GULNORA, STRANGER, TODAY, TROLL, Clock, service_env


async def test_the_story_on_the_service():
    async with service_env() as (svc, clock):
        cells = await svc.cells()
        kart = prices.where_cheap("kartoshka", cells, svc.bazaars, TODAY)
        assert (kart["best"], kart["rows"][0]["price"], kart["rows"][0]["n"]) == ("chorsu", 4900, 1)
        clock.skip(minutes=2)
        out, notes = await svc.submit(DILSHOD, "chorsu", "kartoshka", "4 500")
        assert (out["status"], out["cell"]["price"], out["cell"]["n"], notes) == ("ok", 4500, 2, [])
        clock.skip(minutes=1)
        out, notes = await svc.submit(TROLL, "chorsu", "kartoshka", 1000)
        assert out["status"] == "review" and out["cell"] is None
        assert notes == [{"to": DILSHOD, "kind": "mod", "report": out["report"]}]
        assert (await svc.cell(svc.db.conn, "chorsu", "kartoshka"))["price"] == 4500, "the troll does not move the price"
        for uid in CONFIRM:
            clock.skip(minutes=1)
            out, _ = await svc.confirm(uid, "chorsu", "kartoshka")
        assert (out["cell"]["price"], out["cell"]["n"], trust.level(out["cell"]["n"])) == (4500, 4, "high")
        # Gulnora's alert: piyoz under 6 000 (the cheapest is 6 200 now), then Dilshod reports 5 800 at Chorsu
        alerts, notes = await svc.add_alert(GULNORA, "piyoz", "6 000")
        assert notes == [] and alerts[0]["below"] == 6000 and alerts[0]["fired_at"] is None
        clock.skip(minutes=3)
        _, notes = await svc.submit(DILSHOD, "chorsu", "piyoz", 5800)
        assert notes == [{"to": GULNORA, "kind": "alert", "product": "piyoz", "bazaar": "chorsu", "price": 5800, "below": 6000}]
        _, again = await svc.submit(CONFIRM[0], "chorsu", "piyoz", 5700)
        assert again == [], "an alert fires once"
        # the moderator hides the troll's report: the price stays, the troll's weight drops
        queue = await svc.queue(DILSHOD)
        assert queue[0]["user"] == TROLL and queue[0]["ref"] == 5000 and queue[0]["who"] == "Tez narx"
        res, _ = await svc.hide(DILSHOD, queue[0]["id"])
        assert (res["before"], res["after"], res["cell"]["price"]) == (20, 3, 4500)
        assert TROLL not in [q["user"] for q in await svc.queue(DILSHOD)]
        with pytest.raises(Refused, match="forbidden"):
            await svc.queue(GULNORA)


async def test_recomputing_gives_the_seeded_prices():
    async with service_env() as (svc, _):
        c = svc.db.conn
        rows = await svc.db.all("SELECT * FROM daily WHERE day >= ? ORDER BY day, bazaar, product", (TODAY - 3,))
        rows += await svc.db.all("SELECT * FROM daily WHERE day < ? ORDER BY day LIMIT 40", (TODAY - 60,))
        for row in rows:
            async with svc.db.tx() as tx:
                res = await svc.recompute(tx, row["bazaar"], row["product"], row["day"])
            assert {k: res[k] for k in ("price", "n", "users", "last_at")} == {k: row[k] for k in ("price", "n", "users", "last_at")}, row
        assert await c.execute_fetchall("SELECT 1") is not None


async def test_replacing_limits_and_bans():
    async with service_env() as (svc, clock):
        a, _ = await svc.submit(STRANGER, "oloy", "mol", 110_000)
        b, _ = await svc.submit(STRANGER, "oloy", "mol", 111_000)
        assert (a["replaced"], b["replaced"], a["report"]) == (False, True, b["report"])
        for bad in ("4,5", "abc", 10, 10**9, True, None):
            with pytest.raises(Refused):
                await svc.submit(STRANGER, "oloy", "mol", bad)
        for bad in (("nope", "mol"), ("oloy", "nope"), (1, "mol")):
            with pytest.raises(Refused, match="not_found"):
                await svc.submit(STRANGER, *bad, 110_000)
        pids = [p["id"] for p in svc.products]
        n = 1
        for bz in svc.bazaars:
            for pid in pids:
                if n >= prices.MAX_REPORTS_PER_DAY or (bz["id"], pid) == ("oloy", "mol") or pid in bz["none"]:
                    continue
                await svc.submit(STRANGER, bz["id"], pid, svc.pmap[pid]["min"] * 2)
                n += 1
        with pytest.raises(Refused, match="daily_limit"):
            await svc.submit(STRANGER, "parkent", "tuxum", 16000)
        await svc.submit(STRANGER, "oloy", "mol", 112_000)  # replacing is still fine
        await svc.set_photo(STRANGER, a["report"], "AgACAgIAAxkBAAIBY2Zx_tag-photo")
        with pytest.raises(Refused):
            await svc.set_photo(TROLL, a["report"], "AgACAgIAAxkBAAIBY2Zx_tag-photo")
        res, _ = await svc.ban(DILSHOD, STRANGER)
        assert res["n"] >= prices.MAX_REPORTS_PER_DAY
        with pytest.raises(Refused, match="banned"):
            await svc.submit(STRANGER, "oloy", "mol", 110_000)
        with pytest.raises(Refused, match="forbidden"):
            await svc.ban(GULNORA, TROLL)
        with pytest.raises(Refused, match="forbidden"):
            await svc.ban(DILSHOD, DILSHOD)
        clock.skip(days=1)
        assert (await svc.submit(TROLL, "oloy", "mol", 110_000))[0]["status"] == "ok"


async def test_alerts_list_and_digest():
    monday = next(d for d in range(TODAY, TODAY + 7) if weekday(d) == 0)
    async with service_env(Clock()) as (svc, clock):
        alerts, notes = await svc.add_alert(GULNORA, "mol", 200_000)
        assert notes and notes[0]["product"] == "mol" and (await svc.alerts(GULNORA))[0]["fired_at"], "already cheaper: told at once"
        for k in range(10):
            await svc.add_alert(GULNORA, svc.products[k + 1]["id"], svc.products[k + 1]["min"])
        with pytest.raises(Refused, match="alerts_full"):
            await svc.add_alert(GULNORA, "tuxum", 6000)
        await svc.remove_alert(GULNORA, alerts[0]["id"])
        items = await svc.set_list(GULNORA, [{"product": "mol", "qty": 20}, {"product": "devzira", "qty": 10}])
        assert [x["product"] for x in items] == ["mol", "devzira"]
        await svc.list_put(GULNORA, "tuxum", 10)
        await svc.list_put(GULNORA, "mol", 0)
        b = await svc.basket_for(GULNORA, (41.3110, 69.2797))
        assert [x["product"] for x in b["items"]] == ["devzira", "tuxum"] and b["best"] and all("dist" in r for r in b["rows"])
        assert any(r["missing"] == ["devzira"] for r in b["rows"]), "a bazaar without devzira says so"
        with pytest.raises(Refused, match="qty"):
            await svc.list_put(GULNORA, "tuxum", 7)
        clock.at(monday, 8 * 60)
        assert await svc.digest_due() == []
        clock.at(monday, 9 * 60 + 1)
        first = await svc.digest_due()
        assert {n["to"] for n in first} >= {GULNORA, DILSHOD} and all(n["to"] > 0 for n in first)
        assert await svc.digest_due() == [], "once a week"
        await svc.set_digest(GULNORA, False)
        clock.at(monday + 7, 9 * 60 + 30)
        assert GULNORA not in {n["to"] for n in await svc.digest_due()}


async def test_public_views_have_no_names_and_follow_the_day():
    async with service_env() as (svc, clock):
        snap = await svc.snapshot()
        assert snap["today"] == TODAY and "who" not in str(snap) and "Dilshod" not in str(snap)
        assert snap["week"]["piyoz"] == -12
        hist = await svc.history("kartoshka", 30)
        assert len(hist["series"]) == 30 and hist["series"][-1]["day"] == TODAY
        with pytest.raises(Refused):
            await svc.history("kartoshka", 31)
        await svc.submit(DILSHOD, "chorsu", "kartoshka", 4500)
        assert (await svc.snapshot())["cells"]["chorsu"]["kartoshka"]["price"] == 4500, "the cache follows every change"
        clock.at(TODAY + 1, 5)  # just after midnight: yesterday's prices, labelled as yesterday's
        snap = await svc.snapshot()
        assert snap["today"] == TODAY + 1 and snap["cells"]["chorsu"]["kartoshka"]["day"] == TODAY


async def test_new_year_and_thirty_days():
    for day in (days_from_civil(2026, 12, 31), days_from_civil(2027, 1, 1)):
        clock = Clock()
        clock.at(day, 10 * 60 + 40)
        async with service_env(clock) as (svc, _):
            out, _ = await svc.submit(DILSHOD, "chorsu", "kartoshka", 4500)
            assert out["cell"]["price"] == 4500 and (await svc.week())["piyoz"] == -12
