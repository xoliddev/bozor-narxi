"""aiohttp server: the public website (/), the Mini App (/webapp/), their JSON APIs and the shared files.

* ``/api/public/...`` needs no sign-in (anyone may read prices) and is rate-limited per address. It never carries a
  reporter's name, only counts.
* every other ``/api/...`` call is the Mini App's and must carry ``Authorization: tma <initData>``: the HMAC and
  ``auth_date`` are checked, then the call runs *as* that Telegram user through the same Service the bot uses, with a
  per-user rate limit. ``/api/mod/...`` is for moderators only.

Every page folder is served explicitly (``/`` and ``/webapp/`` -> their index.html), bodies are capped at 16 KB, every
response carries a strict CSP, and location is allowed only on the site's and the Mini App's pages (the shopping
list's distances)."""

from __future__ import annotations

import json
import logging
from pathlib import Path

from aiohttp import web

from .common import Refused
from .security import AuthError, RateLimiter, validate_init_data
from .service import Service

log = logging.getLogger(__name__)
ME = web.RequestKey("me", int)
ROOT = Path(__file__).resolve().parent.parent
MAX_BODY = 16 * 1024
CSP = ("default-src 'self'; script-src 'self' https://telegram.org; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
       "connect-src 'self'; frame-ancestors 'self' https://web.telegram.org https://*.telegram.org; "
       "base-uri 'none'; form-action 'none'; object-src 'none'")
HEADERS = {"Content-Security-Policy": CSP, "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
           "Cross-Origin-Opener-Policy": "same-origin"}
STATUS = {"forbidden": 403, "not_found": 404, "auth": 401, "rate": 429, "too_big": 413, "banned": 403}


async def body(request: web.Request) -> dict:
    raw = await request.read()
    if len(raw) > MAX_BODY:
        raise Refused("too_big")
    try:
        data = json.loads(raw or b"{}")
    except (json.JSONDecodeError, UnicodeDecodeError) as err:
        raise Refused("generic") from err
    if not isinstance(data, dict) or len(data) > 8:
        raise Refused("generic")
    return data


def make_app(service: Service, bot_token: str, notifier=None, *, max_age: int = 3600, rate_per_minute: int = 120, public_rate: int = 120,
             trust_proxy: bool = False, bot_username: str = "") -> web.Application:
    from .web_api import add_routes

    users, addresses = RateLimiter(rate_per_minute), RateLimiter(public_rate)

    def address(request: web.Request) -> str:
        if trust_proxy:
            forwarded = request.headers.get("X-Forwarded-For", "")
            if forwarded:
                return forwarded.split(",")[0].strip()[:64]
        return request.remote or "?"

    async def guard_api(request: web.Request) -> None:
        if request.path.startswith("/api/public/"):
            if not addresses.allow(address(request)):
                raise Refused("rate")
            return
        header = request.headers.get("Authorization", "")
        if not header.startswith("tma "):
            raise AuthError("missing")
        user = validate_init_data(header[4:], bot_token, max_age, now=service.now() / 1000)
        if not users.allow(user["id"]):
            raise Refused("rate")
        await service.touch_user(user["id"], user["first_name"], user["language_code"])
        request[ME] = user["id"]

    @web.middleware
    async def guard(request: web.Request, handler):
        try:
            if request.path.startswith("/api/"):
                await guard_api(request)
            resp = await handler(request)
        except AuthError:
            resp = web.json_response({"error": "auth"}, status=401)
        except Refused as err:
            resp = web.json_response({"error": err.code}, status=STATUS.get(err.code, 400))
        except (ValueError, KeyError, TypeError):
            resp = web.json_response({"error": "generic"}, status=400)
        resp.headers.update(HEADERS)
        page = not request.path.startswith("/api/") and (request.path == "/" or request.path.startswith("/webapp/"))
        resp.headers["Permissions-Policy"] = f"geolocation=({'self' if page else ''}), camera=(), microphone=()"
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    async def notify(notes: list[dict]) -> None:
        if notifier is not None and notes:
            try:
                await notifier.send(notes)
            except Exception:  # a failed message never fails the action itself
                log.exception("notify failed")

    async def health(_: web.Request) -> web.Response:
        return web.json_response({"ok": True})

    def page(folder: str):
        async def serve(_: web.Request) -> web.StreamResponse:
            return web.FileResponse(ROOT / folder / "index.html", headers={"Cache-Control": "no-cache"})

        return serve

    def redirect(to: str):
        async def go(_: web.Request) -> web.Response:
            raise web.HTTPFound(to)

        return go

    async def unknown(_: web.Request) -> web.Response:
        raise Refused("not_found")

    app = web.Application(middlewares=[guard], client_max_size=MAX_BODY + 4096)
    r = app.router
    add_routes(r, service, ME, notify, bot_username)
    r.add_route("*", "/api/{tail:.*}", unknown)
    r.add_get("/healthz", health)
    r.add_get("/", page("site"))
    r.add_get("/site/", redirect("/"))
    r.add_get("/webapp", redirect("/webapp/"))
    r.add_get("/webapp/", page("webapp"))
    r.add_static("/site/", ROOT / "site", append_version=False)
    r.add_static("/webapp/", ROOT / "webapp", append_version=False)
    r.add_static("/shared/", ROOT / "shared", append_version=False)
    return app
