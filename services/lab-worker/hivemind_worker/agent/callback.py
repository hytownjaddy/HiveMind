"""Outbound calls to the session Worker (heartbeat, events, reconcile).

Every call travels through the web Worker's `/session/*` proxy with the
worker's Access service token; Access validates it at the edge and the gateway
checks the `worker:callback` scope. Failures are logged and retried with a
short backoff; the agent never blocks a lab on the control plane being slow.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Protocol

import aiohttp

from hivemind_worker.config import WorkerConfig
from hivemind_worker.contracts import worker_envelope
from hivemind_worker.protocol import dump, envelope, parse_envelope

log = logging.getLogger(__name__)

EVENTS_PATH = "/session/worker/events"
HEARTBEAT_PATH = "/session/worker/heartbeat"
RECONCILE_PATH = "/session/worker/reconcile"
RETRIES = 3


class Callback(Protocol):
    async def send(self, message: Any, correlation_id: str | None = None) -> None: ...

    async def heartbeat(self, message: Any) -> None: ...

    async def reconcile(self, message: Any) -> worker_envelope.WorkerEnvelope | None: ...


class NullCallback:
    """Used by the CLI and tests when no session Worker is configured."""

    def __init__(self) -> None:
        self.sent: list[worker_envelope.WorkerEnvelope] = []

    async def send(self, message: Any, correlation_id: str | None = None) -> None:
        self.sent.append(envelope(message, "cli", correlation_id))

    async def heartbeat(self, message: Any) -> None:
        self.sent.append(envelope(message, "cli"))

    async def reconcile(self, message: Any) -> worker_envelope.WorkerEnvelope | None:
        self.sent.append(envelope(message, "cli"))
        return None


class SessionWorkerCallback:
    def __init__(self, config: WorkerConfig, session: aiohttp.ClientSession) -> None:
        self.config = config
        self.session = session
        self.base = config.require_callback()

    async def _post(self, path: str, body: worker_envelope.WorkerEnvelope) -> Any | None:
        payload = dump(body)
        delay = 0.5
        for attempt in range(1, RETRIES + 1):
            try:
                async with self.session.post(
                    f"{self.base}{path}",
                    json=payload,
                    headers={**self.config.service_headers(), "origin": self.base},
                    timeout=aiohttp.ClientTimeout(total=20),
                ) as response:
                    if response.status < 300:
                        text = await response.text()
                        return None if not text else await response.json()
                    if 400 <= response.status < 500:
                        log.error(
                            "%s rejected (%s): %s", path, response.status, await response.text()
                        )
                        return None
                    log.warning("%s returned %s (attempt %s)", path, response.status, attempt)
            except (aiohttp.ClientError, TimeoutError) as error:
                log.warning("%s failed (attempt %s): %s", path, attempt, error)
            await asyncio.sleep(delay)
            delay *= 2
        return None

    async def send(self, message: Any, correlation_id: str | None = None) -> None:
        await self._post(EVENTS_PATH, envelope(message, self.config.worker_id, correlation_id))

    async def heartbeat(self, message: Any) -> None:
        await self._post(HEARTBEAT_PATH, envelope(message, self.config.worker_id))

    async def reconcile(self, message: Any) -> worker_envelope.WorkerEnvelope | None:
        body = await self._post(RECONCILE_PATH, envelope(message, self.config.worker_id))
        if body is None:
            return None
        try:
            return parse_envelope(body)
        except ValueError as error:
            log.error("reconcile response is not a worker envelope: %s", error)
            return None
