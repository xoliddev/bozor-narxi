"""Trust: how many people's numbers become one shown price. Whole numbers only, so the JS port (shared/trust.js)
gives exactly the same price for the same reports.

For one bazaar, one product and one Tashkent day:

1. **Reference band.** A report far from the last known price (below 55 % or above 180 % of it) is *shubhali*. A
   market shock is still accepted when at least three different people report it and nobody reports a normal price.
2. **Weighted median** of the rest, the weight being the reporter's reputation (``weight_of``).
3. **Outliers:** reports further than ``max(3 · MAD, 12 % of the median)`` from it are dropped (MAD = the weighted
   median of the absolute deviations).
4. The **shown price** is the weighted median of what is left, rounded to the product's step (100 or 1 000 so'm).

A reporter's weight grows with reports that matched the consensus on earlier days, falls with reports that were far
off, falls hard for reports a moderator hid, and is zero after a ban. New accounts start low.
"""

from __future__ import annotations

W_NEW, W_GOOD, W_FAR, W_HIDDEN, W_MIN, W_MAX = 300, 50, 150, 400, 50, 1500
K_MAD = 3
TOL_PCT = 12
REF_LO, REF_HI = 55, 180
GOOD_PCT = 8
SHOCK_USERS = 3
REF_DAYS = 7


def rdiv(a: int, b: int) -> int:
    """a / b rounded to the nearest whole number, halves away from zero (b > 0)."""
    q = (abs(a) * 2 + b) // (2 * b)
    return q if a >= 0 else -q


def round_to(x: int, unit: int) -> int:
    """Round a positive amount to the nearest ``unit`` (halves up)."""
    return (x + unit // 2) // unit * unit


def weight_of(good: int, far: int, hidden: int, banned: bool | int = False) -> int:
    """A reporter's weight from their track record (reports on earlier days that matched / were far off / were hidden)."""
    if banned:
        return 0
    return max(W_MIN, min(W_MAX, W_NEW + W_GOOD * good - W_FAR * far - W_HIDDEN * hidden))


def trust_pct(weight: int) -> int:
    """The weight as a percentage of the most a reporter can have (shown to moderators)."""
    return rdiv(weight * 100, W_MAX)


def wmedian(items: list[tuple[int, int, int]]) -> int:
    """Weighted median of ``(value, weight, id)`` (weights > 0). Ties are broken by id; when the weight splits exactly in
    half, the midpoint of the two middle values (rounded down)."""
    s = sorted(items, key=lambda x: (x[0], x[2]))
    total = sum(w for _, w, _ in s)
    acc = 0
    for i, (v, w, _) in enumerate(s):
        acc += w
        if acc * 2 > total:
            return v
        if acc * 2 == total:
            return (v + s[i + 1][0]) // 2
    return s[-1][0]


def median(values: list[int]) -> int | None:
    """Plain median of whole numbers (the lower midpoint for an even count), or None."""
    if not values:
        return None
    s = sorted(values)
    n = len(s)
    return s[n // 2] if n % 2 else (s[n // 2 - 1] + s[n // 2]) // 2


def reference(rows: list[dict], bazaar: str, day: int) -> int | None:
    """The price a new report is compared with: this bazaar's latest daily price in the previous week, or else the
    median of the other bazaars' latest prices. ``rows`` are daily prices ``{bazaar, day, price}`` of one product."""
    latest: dict[str, tuple[int, int]] = {}
    for r in rows:
        if day - REF_DAYS <= r["day"] < day and (r["bazaar"] not in latest or r["day"] > latest[r["bazaar"]][0]):
            latest[r["bazaar"]] = (r["day"], r["price"])
    if bazaar in latest:
        return latest[bazaar][1]
    return median([p for _, p in latest.values()])


def aggregate(reports: list[dict], ref: int | None, unit: int = 100) -> tuple[dict | None, dict[int, str]]:
    """``reports``: ``{id, user, price, weight, at}`` of one bazaar-product-day (hidden ones left out).

    Returns the shown price ``{price, n, users, last_at}`` (or None) and a verdict per report id:
    ``ok`` (kept and within 8 % of the price), ``near`` (kept), ``far`` (shubhali, dropped), ``off`` (weight 0: banned).
    """
    verdicts = {r["id"]: "off" for r in reports if r["weight"] <= 0}
    live = [r for r in reports if r["weight"] > 0]
    if not live:
        return None, verdicts
    near = live
    if ref:
        lo, hi = ref * REF_LO // 100, ref * REF_HI // 100
        near = [r for r in live if lo <= r["price"] <= hi]
        if not near and len({r["user"] for r in live}) >= SHOCK_USERS:
            near = live
    if not near:
        verdicts.update({r["id"]: "far" for r in live})
        return None, verdicts
    m0 = wmedian([(r["price"], r["weight"], r["id"]) for r in near])
    mad = wmedian([(abs(r["price"] - m0), r["weight"], r["id"]) for r in near])
    tol = max(K_MAD * mad, m0 * TOL_PCT // 100)
    kept = [r for r in near if abs(r["price"] - m0) <= tol]
    price = round_to(wmedian([(r["price"], r["weight"], r["id"]) for r in kept]), unit)
    kept_ids = {r["id"] for r in kept}
    for r in live:
        if r["id"] not in kept_ids:
            verdicts[r["id"]] = "far"
        else:
            verdicts[r["id"]] = "ok" if abs(r["price"] - price) * 100 <= price * GOOD_PCT else "near"
    return {"price": price, "n": len(kept), "users": len({r["user"] for r in kept}), "last_at": max(r["at"] for r in kept)}, verdicts


def level(n: int) -> str:
    """Confidence of a shown price: ``low`` (one report: "Kam ma'lumot"), ``mid`` (2–3), ``high`` (4 or more)."""
    return "low" if n <= 1 else "mid" if n <= 3 else "high"
