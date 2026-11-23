"""The pure core: the vectors are up to date, the trust rules behave (a troll does not move the price, a market shock
does), the seeded city keeps its story on any day, across New Year and around midnight."""

from __future__ import annotations

import json

import pytest

from bozornarxi.core import basket, clock, prices, seedgen, trust
from bozornarxi.core.text import InputError
from scripts import make_vectors

from .helpers import BAZAARS, NAMES, PMAP, PRODUCTS, TODAY


def test_vectors_are_up_to_date(vectors):
    assert json.loads(json.dumps(make_vectors.build(), ensure_ascii=False)) == vectors, "run: python scripts/make_vectors.py"


def r(i, user, price, weight=1500, at=0):
    return {"id": i, "user": user, "price": price, "weight": weight, "at": at}


def test_a_troll_does_not_move_the_price_and_confirmations_add_confidence():
    reports = [r(1, 40, 4900, 300), r(2, 1, 4500)]
    shown, _ = trust.aggregate(reports, 4900)
    assert (shown["price"], shown["n"], trust.level(shown["n"])) == (4500, 2, "mid")
    shown2, verdicts = trust.aggregate([*reports, r(3, 77, 500, 300)], 4900)
    assert shown2 == shown and verdicts[3] == "far"
    shown3, _ = trust.aggregate([*reports, r(3, 77, 500, 300), r(4, 2, 4500), r(5, 3, 4500)], 4900)
    assert (shown3["price"], shown3["n"], trust.level(shown3["n"])) == (4500, 4, "high")


def test_outliers_without_a_reference_and_a_real_market_shock():
    shown, verdicts = trust.aggregate([r(1, 1, 5000), r(2, 2, 5200), r(3, 3, 5100), r(4, 4, 51_000, 300)], None)
    assert shown["price"] == 5100 and verdicts[4] == "far"
    shock = [r(i, i, 9000 + i * 100, 600) for i in range(1, 4)]
    assert trust.aggregate(shock, 5000)[0]["price"] == 9200, "three different people agree on a jump: accepted"
    assert trust.aggregate(shock[:2], 5000)[0] is None, "two are not enough to override the reference"
    assert trust.aggregate([r(1, 1, 5000, 0)], None) == (None, {1: "off"}), "a banned reporter counts for nothing"


def test_weights_new_good_far_hidden_banned():
    assert trust.weight_of(0, 0, 0) == 300
    assert trust.weight_of(14, 0, 0) == 1000
    assert trust.weight_of(100, 0, 0) == trust.W_MAX
    assert trust.weight_of(0, 0, 1) == trust.W_MIN
    assert trust.weight_of(10, 2, 0) < trust.weight_of(10, 0, 0)
    assert trust.weight_of(100, 0, 0, banned=True) == 0
    assert (trust.trust_pct(300), trust.trust_pct(trust.W_MIN)) == (20, 3)


def test_prices_parse_and_check():
    assert [prices.parse_price(s) for s in ("4500", "4 500", "4.500", "4 500 so'm", "12 000 сум")] == [4500, 4500, 4500, 4500, 12000]
    for bad in ("4,5", "4 50", "", "abc", "1234567890"):
        with pytest.raises(InputError):
            prices.parse_price(bad)
    with pytest.raises(InputError, match="price_range"):
        prices.check_price(PMAP["kartoshka"], 500)
    with pytest.raises(InputError):
        prices.check_price(PMAP["kartoshka"], True)


def test_basket_rules():
    with pytest.raises(InputError, match="qty"):
        basket.check_items([{"product": "mol", "qty": 7}], PMAP)
    with pytest.raises(InputError, match="list"):
        basket.check_items([{"product": "x", "qty": 10}], PMAP)
    assert basket.item_total(4500, 15) == 6750
    assert basket.distance_m((41.3265, 69.2355), (41.3265, 69.2355)) == 0


def city(today: int, minute: int):
    w = seedgen.world(PRODUCTS, BAZAARS, NAMES, today, minute)
    return w, prices.cells(w["daily"], today)


@pytest.mark.parametrize("day", [*range(TODAY, TODAY + 30), clock.days_from_civil(2026, 12, 31), clock.days_from_civil(2027, 1, 1)])
def test_the_story_holds_on_any_day(day):
    w, cells = city(day, 10 * 60 + 40)
    kart = prices.where_cheap("kartoshka", cells, BAZAARS, day)
    assert kart["best"] == "chorsu" and kart["rows"][0]["price"] == 4900 and kart["rows"][0]["n"] == 1
    piyoz = prices.where_cheap("piyoz", cells, BAZAARS, day)
    assert piyoz["rows"][0]["bazaar"] == "chorsu" and piyoz["rows"][0]["price"] == 6200
    assert all(x["price"] >= 6000 for x in piyoz["rows"]), "Gulnora's 6 000 alert must not fire before the story's report"
    series = prices.history([x for x in w["daily"] if x["product"] == "piyoz"], day - 89, day)
    assert prices.week_change(series, day) == -12
    assert prices.digest({p["id"]: prices.week_change(prices.history([x for x in w["daily"] if x["product"] == p["id"]], day - 89, day), day)
                          for p in PRODUCTS})["down"][0] == ["piyoz", -12]
    assert {x["day"] for x in w["daily"]} >= set(range(day - 89, day + 1))


def test_around_midnight_today_means_the_tashkent_day():
    before = clock.at_local(TODAY, 24 * 60) - 60_000  # 23:59
    after = before + 120_000  # 00:01 next day
    assert clock.local_day(before) == TODAY and clock.local_day(after) == TODAY + 1
    _, cells = city(TODAY + 1, 1)  # just after midnight nobody has reported yet: yesterday's prices are shown as such
    rows = prices.where_cheap("kartoshka", cells, BAZAARS, TODAY + 1)["rows"]
    assert rows and all(x["day"] == TODAY for x in rows)
    assert all(prices.confidence(x, after, TODAY + 1)["days"] == 1 for x in rows)


def test_seed_shape():
    w, _ = city(TODAY, 10 * 60 + 40)
    users = {u["id"]: u for u in w["users"]}
    assert all(u < 0 for u in users), "seeded people have negative ids: nobody can sign in as them"
    verdicts = {x["verdict"] for x in w["reports"]}
    assert verdicts <= {"ok", "near", "far", "off"} and "far" in verdicts
    assert any(x["hidden"] for x in w["reports"]) and any(u["banned"] for u in w["users"])
