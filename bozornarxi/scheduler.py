"""Once a minute: the weekly digest (Monday morning, once per person). Alerts are sent the moment a report makes them
true, so they need no timer."""

from __future__ import annotations

import asyncio
import logging

log = logging.getLogger(__name__)


async def tick(service, notifier) -> int:
    return await notifier.send(await service.digest_due())


async def run(service, notifier, every: float = 60.0) -> None:
    while True:
        try:
            await tick(service, notifier)
        except Exception:  # the loop must survive a bad minute
            log.exception("scheduler tick failed")
        await asyncio.sleep(every)
