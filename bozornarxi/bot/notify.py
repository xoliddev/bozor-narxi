"""Messages the bot sends on its own: a price alert, a shubhali report for moderators, the weekly digest. A blocked
bot or a deleted chat never breaks the action that caused the message."""

from __future__ import annotations

import logging

from aiogram import Bot
from aiogram.exceptions import TelegramAPIError

from ..i18n import alert_text, t
from ..service import Service
from . import views
from .markup import markup

log = logging.getLogger(__name__)


class Notifier:
    def __init__(self, bot: Bot, service: Service, cfg) -> None:
        self.bot, self.svc, self.cfg = bot, service, cfg

    async def render(self, note: dict) -> tuple[str, list[list[dict]]] | None:
        u = await self.svc.user(note["to"])
        if u is None or note["to"] <= 0:
            return None
        lang = u["lang"]
        svc = self.svc
        if note["kind"] == "alert":
            p = svc.pmap[note["product"]]
            text = alert_text(lang, p, svc.bmap[note["bazaar"]], note["price"], note["below"])
            return text, [[{"text": t(lang, "btn.cheap"), "data": f"c:{p['id']}"}], [{"text": t(lang, "btn.menu"), "data": "m"}]]
        if note["kind"] == "mod":
            r = await svc.report_view(note["report"])
            if r is None or r["hidden"] or r["banned"]:
                return None
            text, rows = views.mod_item(lang, r, svc.pmap, svc.bmap)
            return "🛡 " + text, rows
        if note["kind"] == "digest":
            text, rows = views.week(lang, await svc.week(), svc.pmap, self.cfg.site_url)
            return "🗓 " + text, rows
        return None

    async def send(self, notes: list[dict]) -> int:
        sent = 0
        for note in notes:
            screen = await self.render(note)
            if screen is None:
                continue
            try:
                await self.bot.send_message(note["to"], screen[0], reply_markup=markup(screen[1], self.cfg.webapp_url), disable_web_page_preview=True)
                sent += 1
            except TelegramAPIError as err:
                log.warning("could not message %s: %s", note["to"], err)
        return sent
