"""The real aiogram handlers against a mocked Bot API: people press buttons by their visible text, like in Telegram."""

from __future__ import annotations

from .helpers import CONFIRM, DILSHOD, GULNORA, TROLL, service_env
from .tg_sim import TgSim


async def test_report_flow_troll_confirmations_alert_and_moderation():
    async with service_env() as (svc, _clock):
        tg = TgSim(svc)
        await tg.say(DILSHOD, "/start")
        assert "Bozor Narxi" in tg.last(DILSHOD) and "Bu hafta arzonladi: piyoz −12%" in tg.last(DILSHOD)
        assert "🛡 Moderatsiya" in tg.buttons(DILSHOD) and "🛡 Moderatsiya" not in (await _menu(tg, GULNORA))
        await tg.tap(DILSHOD, "📝 Narx yuborish")
        await tg.tap(DILSHOD, "Chorsu")
        await tg.tap(DILSHOD, "Kartoshka")
        assert "Hozirgi narx: <b>4 900 so'm/kg</b>" in tg.last(DILSHOD) and "Kam ma'lumot · 1 ta xabar" in tg.last(DILSHOD)
        await tg.say(DILSHOD, "4 500")
        assert tg.last(DILSHOD).startswith("Rahmat! Chorsuda kartoshka: bugun 4 500 so'm (2 ta xabar)")
        await tg.photo(DILSHOD)
        assert "Rasm qo'shildi" in tg.last(DILSHOD)
        before = len(tg.texts(DILSHOD))
        await tg.tap(DILSHOD, "📝 Yana yuborish")  # a new message: the "Rahmat!" receipt stays in the chat
        assert len(tg.texts(DILSHOD)) == before + 1 and "Chorsu" in tg.buttons(DILSHOD)
        assert any(x.startswith("Rahmat! Chorsuda kartoshka: bugun 4 500 so'm") for x in tg.texts(DILSHOD))
        # the troll: a neutral answer; the moderator gets the report with buttons
        await tg.say(TROLL, "/start")
        await tg.tap_data(TROLL, "r:chorsu:kartoshka")
        await tg.say(TROLL, "kartoshka 500")
        assert tg.last(TROLL).startswith("Tekshiruvga yuborildi")
        assert "🛡 Shubhali" not in tg.last(TROLL)
        assert "Chorsu · Kartoshka: 500 so'm/kg" in tg.last(DILSHOD) and "Tez narx (ishonch 20%)" in tg.last(DILSHOD)
        # two people confirm the shown price with one tap
        for uid in CONFIRM:
            await tg.say(uid, "/start")
            await tg.tap_data(uid, "r:chorsu:kartoshka")
            await tg.tap(uid, "✅ Shu narx: 4 500 so'm")
        assert "(4 ta xabar)" in tg.last(CONFIRM[1])
        # Gulnora: where is it cheap, then an alert for piyoz under 6 000
        await tg.tap(GULNORA, "🔎 Qayerda arzon?")
        await tg.tap(GULNORA, "Kartoshka")
        text = tg.last(GULNORA)
        assert "✅ Chorsuda kartoshka 4 500 so'm — shahar o'rtachasidan" in text and "1. Chorsu — <b>4 500 so'm</b>" in text and "14 kunlik" in text
        await tg.tap_data(GULNORA, "an:piyoz")
        assert "Hozir eng arzon: Chorsuda piyoz 6 200 so'm" in tg.last(GULNORA)
        await tg.say(GULNORA, "6000")
        assert "Bo'ldi: piyoz 6 000 so'mdan arzon bo'lsa" in tg.last(GULNORA)
        await tg.tap_data(DILSHOD, "r:chorsu:piyoz")
        await tg.say(DILSHOD, "5800")
        assert tg.last(GULNORA).startswith("🔔 Piyoz Chorsuda 5 800 so'm/kg — siz kutgan 6 000 so'mdan arzon.")
        # the moderator hides the troll's report from the queue
        await tg.tap(DILSHOD, "🏠 Menyu")
        await tg.tap(DILSHOD, "🛡 Moderatsiya")
        assert "Tez narx" in tg.last(DILSHOD)
        await tg.tap(DILSHOD, "🙈 Yashirish")
        assert "Tez narx: ishonch 20% → 3%" in tg.last(DILSHOD) and "Chorsuda kartoshka: 4 500 so'm/kg (4 ta xabar" in tg.last(DILSHOD)


async def _menu(tg: TgSim, uid: int) -> list[str]:
    await tg.say(uid, "/start")
    return tg.buttons(uid)


async def test_list_week_language_back_buttons_and_stale_data():
    async with service_env() as (svc, _clock):
        tg = TgSim(svc)
        await tg.say(GULNORA, "/start")
        await tg.tap(GULNORA, "🧺 Bozorlik ro'yxati")
        assert "Ro'yxat bo'sh" in tg.last(GULNORA)
        for product, qty in (("Mol go'shti", "2 kg"), ("Kartoshka", "3 kg"), ("Guruch (devzira)", "1 kg"), ("Tuxum", "10 ta")):
            await tg.tap(GULNORA, "➕ Qo'shish")
            await tg.tap(GULNORA, product)
            await tg.tap(GULNORA, qty)
        assert "• Mol go'shti — 2 kg" in tg.last(GULNORA) and "• Tuxum — 10 ta" in tg.last(GULNORA)
        await tg.tap(GULNORA, "🧮 Hisoblash")
        text = tg.last(GULNORA)
        assert "4 ta mahsulot" in text and "eng qimmatidan" in text and "⚠️ narxi yo'q: guruch (devzira)" in text
        await tg.tap(GULNORA, "⬅️ Orqaga")
        await tg.tap(GULNORA, "⬅️ Orqaga")
        await tg.tap(GULNORA, "📊 Bu hafta")
        assert "piyoz −12%" in tg.last(GULNORA) and "pomidor +9%" in tg.last(GULNORA)
        await tg.tap(GULNORA, "⬅️ Orqaga")
        await tg.tap(GULNORA, "🇷🇺 Русский")
        assert "Подешевело за неделю: лук −12%" in tg.last(GULNORA)
        await tg.tap(GULNORA, "🔔 Уведомления")
        assert "⬅️ Назад" in tg.buttons(GULNORA)
        await tg.tap_data(GULNORA, "r:nowhere:kartoshka")
        await tg.tap_data(GULNORA, "zz:../../etc")
        await tg.say(GULNORA, "salom")
        assert "Я работаю только с кнопками" in tg.last(GULNORA)
        assert any("Не найдено" in a for a in tg.alerts()) and any("устарела" in a for a in tg.alerts())
        await tg.say(GULNORA, "/start p_kartoshka")
        assert "Картофель" in tg.last(GULNORA)
        await tg.say(GULNORA, "/start week")
        assert "лук −12%" in tg.last(GULNORA)
