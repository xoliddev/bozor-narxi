"""The JSON API: public reads for the website (no names, only counts) and the Mini App's calls as the signed-in user."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from aiohttp import web

from .common import Refused
from .service import Service
from .web import body


def add_routes(r: web.UrlDispatcher, svc: Service, ME: web.RequestKey, notify: Callable[[list[dict]], Awaitable[None]], bot_username: str) -> None:
    def j(data: object) -> web.Response:
        return web.json_response(data)

    async def today(_: web.Request) -> web.Response:
        return j(await svc.snapshot())

    async def history(request: web.Request) -> web.Response:
        days = request.query.get("days", "30")
        if days not in ("30", "90"):
            raise Refused("generic")
        return j(await svc.history(request.query.get("product", ""), int(days)))

    async def config(_: web.Request) -> web.Response:
        return j({"bot": bot_username})

    async def me(request: web.Request) -> web.Response:
        return j(await svc.me(request[ME]))

    async def lang(request: web.Request) -> web.Response:
        return j({"lang": await svc.set_lang(request[ME], (await body(request)).get("lang"))})

    async def get_list(request: web.Request) -> web.Response:
        return j({"items": await svc.get_list(request[ME])})

    async def put_list(request: web.Request) -> web.Response:
        return j({"items": await svc.set_list(request[ME], (await body(request)).get("items"))})

    async def alerts(request: web.Request) -> web.Response:
        return j({"items": await svc.alerts(request[ME])})

    async def add_alert(request: web.Request) -> web.Response:
        data = await body(request)
        items, notes = await svc.add_alert(request[ME], data.get("product"), data.get("below"))
        await notify(notes)
        return j({"items": items, "fired": bool(notes)})

    async def remove_alert(request: web.Request) -> web.Response:
        return j({"items": await svc.remove_alert(request[ME], (await body(request)).get("id"))})

    async def digest(request: web.Request) -> web.Response:
        return j({"digest": await svc.set_digest(request[ME], (await body(request)).get("on"))})

    async def queue(request: web.Request) -> web.Response:
        return j({"items": await svc.queue(request[ME])})

    async def hide(request: web.Request) -> web.Response:
        res, notes = await svc.hide(request[ME], (await body(request)).get("report"))
        await notify(notes)
        return j(res)

    async def ban(request: web.Request) -> web.Response:
        res, notes = await svc.ban(request[ME], (await body(request)).get("user"))
        await notify(notes)
        return j(res)

    r.add_get("/api/public/today", today)
    r.add_get("/api/public/history", history)
    r.add_get("/api/public/config", config)
    r.add_get("/api/me", me)
    r.add_post("/api/lang", lang)
    r.add_get("/api/list", get_list)
    r.add_post("/api/list", put_list)
    r.add_get("/api/alerts", alerts)
    r.add_post("/api/alerts", add_alert)
    r.add_post("/api/alerts/remove", remove_alert)
    r.add_post("/api/digest", digest)
    r.add_get("/api/mod/queue", queue)
    r.add_post("/api/mod/hide", hide)
    r.add_post("/api/mod/ban", ban)
