"""HTTP: the public API (no names, per-address rate limit), initData HMAC + freshness for the Mini App, moderator-only
routes, strict input checks, body caps, CSP, and every real page address opens."""

from __future__ import annotations

import json
from contextlib import asynccontextmanager

from aiohttp.test_utils import TestClient, TestServer

from bozornarxi.security import sign_init_data
from bozornarxi.web import make_app

from .helpers import DILSHOD, GULNORA, TODAY, TROLL, service_env

TOKEN = "123456:TEST-ONLY-NOT-A-REAL-TOKEN"


class Spy:
    def __init__(self) -> None:
        self.notes: list[dict] = []

    async def send(self, notes):
        self.notes.extend(notes)


def init_data(uid: int, clock, age: int = 0, token: str = TOKEN) -> str:
    fields = {"auth_date": str(clock() // 1000 - age), "query_id": "AAE-test",
              "user": json.dumps({"id": uid, "first_name": f"U{uid}", "language_code": "uz"})}
    return sign_init_data(fields, token)


@asynccontextmanager
async def client(public_rate: int = 120):
    async with service_env() as (svc, clock):
        spy = Spy()
        app = make_app(svc, TOKEN, spy, public_rate=public_rate, bot_username="bozornarxi_test_bot")
        async with TestClient(TestServer(app)) as c:
            def h(uid, **kw):
                return {"Authorization": f"tma {init_data(uid, clock, **kw)}"}
            yield c, svc, clock, spy, h


async def test_every_page_address_opens():
    async with client() as (c, *_):
        for path in ("/", "/webapp/", "/site/main.js", "/site/site.css", "/webapp/main.js", "/shared/locales/uz.json", "/shared/prices.js", "/healthz"):
            r = await c.get(path)
            assert r.status == 200, path
        page = await c.get("/")
        assert "text/html" in page.headers["Content-Type"] and "Bozor Narxi" in await page.text()
        assert "default-src 'self'" in page.headers["Content-Security-Policy"] and page.headers["X-Content-Type-Options"] == "nosniff"
        assert "geolocation=(self)" in page.headers["Permissions-Policy"]
        for path, to in (("/webapp", "/webapp/"), ("/site/", "/")):
            r = await c.get(path, allow_redirects=False)
            assert r.status == 302 and r.headers["Location"] == to
        assert (await c.get("/api/nope")).status == 401, "unknown private routes still need initData"
        for bad in ("/site/../bozornarxi/config.py", "/shared/../.env", "/nope", "/api/public/nope"):
            assert (await c.get(bad)).status == 404, bad


async def test_public_api_has_prices_and_no_names():
    async with client() as (c, svc, _clock, _spy, _h):
        snap = await (await c.get("/api/public/today")).json()
        assert snap["today"] == TODAY and snap["cells"]["chorsu"]["kartoshka"]["price"] == 4900 and snap["week"]["piyoz"] == -12
        raw = json.dumps(snap)
        assert all(u["name"] not in raw for u in await svc.db.all("SELECT name FROM users"))
        hist = await (await c.get("/api/public/history?product=piyoz&days=90")).json()
        assert len(hist["series"]) == 90 and set(hist["series"][0]) == {"day", "city", "lo", "hi", "by"}
        for q in ("product=piyoz&days=7", "product=..&days=30", "days=30", "product=piyoz&days=abc"):
            assert (await c.get(f"/api/public/history?{q}")).status in (400, 404), q
        assert (await (await c.get("/api/public/config")).json()) == {"bot": "bozornarxi_test_bot"}
        r = await c.get("/api/public/today")
        assert r.headers["Cache-Control"] == "no-store"


async def test_public_rate_limit_per_address():
    async with client(public_rate=10) as (c, *_):
        codes = [(await c.get("/api/public/today")).status for _ in range(14)]
        assert codes[:10] == [200] * 10 and 429 in codes[10:]


async def test_mini_app_auth_lists_alerts_and_moderator_routes():
    async with client() as (c, _svc, _clock, spy, h):
        assert (await c.get("/api/me")).status == 401
        assert (await c.get("/api/me", headers=h(GULNORA, age=7200))).status == 401
        assert (await c.get("/api/me", headers=h(GULNORA, token="999:other"))).status == 401
        assert (await c.get("/api/me", headers={"Authorization": "tma user=1&hash=00"})).status == 401
        me = await (await c.get("/api/me", headers=h(GULNORA))).json()
        assert me["id"] == GULNORA and me["mod"] is False
        items = [{"product": "mol", "qty": 20}, {"product": "tuxum", "qty": 10}]
        r = await c.post("/api/list", json={"items": items}, headers=h(GULNORA))
        assert (await r.json())["items"] == items
        for bad in ([{"product": "mol", "qty": 7}], [{"product": "mol", "qty": "20; DROP TABLE"}], "x", [{"product": "<script>", "qty": 10}]):
            assert (await c.post("/api/list", json={"items": bad}, headers=h(GULNORA))).status == 400
        r = await c.post("/api/alerts", json={"product": "piyoz", "below": 6000}, headers=h(GULNORA))
        assert (await r.json())["fired"] is False
        for bad in ({"product": "piyoz", "below": 10}, {"product": "piyoz", "below": "6,5"}, {"product": "x", "below": 6000}):
            assert (await c.post("/api/alerts", json=bad, headers=h(GULNORA))).status in (400, 404)
        assert (await c.get("/api/mod/queue", headers=h(GULNORA))).status == 403
        assert (await c.post("/api/mod/ban", json={"user": TROLL}, headers=h(GULNORA))).status == 403
        q = await (await c.get("/api/mod/queue", headers=h(DILSHOD))).json()
        assert q["items"] and "who" in q["items"][0]
        r = await c.post("/api/mod/hide", json={"report": q["items"][0]["id"]}, headers=h(DILSHOD))
        assert r.status == 200 and (await r.json())["after"] <= (await r.json())["before"]
        assert (await c.post("/api/list", data=b"x" * 20_000, headers=h(GULNORA))).status in (400, 413)
        assert (await c.post("/api/lang", json={"lang": "en"}, headers=h(GULNORA))).status == 400
        assert spy.notes == []
