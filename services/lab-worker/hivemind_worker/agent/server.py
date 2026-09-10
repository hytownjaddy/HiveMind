"""aiohttp application: job intake, health, per-node PTY WebSockets, reconcile.

    POST /jobs                                   worker envelope → 202, executed in the background
    GET  /health                                 liveness and versions
    GET  /sessions/{id}/nodes/{node}/pty         WebSocket: binary = bytes, text = control JSON
    POST /reconcile                              run a reconciliation pass now

Listens on loopback only; cloudflared connects locally and Access fronts the
public hostname (no public ports, Stage 02 acceptance 1).
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
from typing import Any

import psutil
from aiohttp import WSMsgType, web

from hivemind_worker.agent.auth import HEADER, AccessVerifier
from hivemind_worker.agent.callback import Callback
from hivemind_worker.agent.jobs import JobRunner
from hivemind_worker.agent.reconcile import Reconciler
from hivemind_worker.config import (
    DEFAULT_CAPABILITIES,
    HEARTBEAT_INTERVAL_SECONDS,
    ORPHAN_SWEEP_INTERVAL_SECONDS,
    WorkerConfig,
)
from hivemind_worker.contracts import capability, heartbeat
from hivemind_worker.protocol import now_iso, parse_envelope
from hivemind_worker.providers.base import ProviderError

log = logging.getLogger(__name__)


class Agent:
    def __init__(
        self,
        config: WorkerConfig,
        runner: JobRunner,
        callback: Callback,
        capabilities: tuple[str, ...] = DEFAULT_CAPABILITIES,
    ) -> None:
        self.config = config
        self.runner = runner
        self.callback = callback
        self.capabilities = capabilities
        self.verifier = AccessVerifier(config)
        self.reconciler = Reconciler(config.worker_id, runner, callback)
        self.tasks: set[asyncio.Task[Any]] = set()
        self.background: list[asyncio.Task[None]] = []

    # ---------------------------------------------------------------- helpers

    def spawn(self, coroutine: Any) -> None:
        task = asyncio.create_task(coroutine)
        self.tasks.add(task)
        task.add_done_callback(self.tasks.discard)

    def authorized(self, request: web.Request) -> bool:
        return self.verifier.verify(request.headers.get(HEADER)) is not None

    async def runtime_versions(self) -> dict[str, str]:
        versions: dict[str, str] = {"agent": self.config.agent_version}
        for provider in self.runner.providers:
            with contextlib.suppress(Exception):
                versions.update(await provider.runtime_versions())
        return versions

    async def heartbeat_message(self) -> heartbeat.Heartbeat:
        return heartbeat.Heartbeat(
            type="heartbeat",
            worker_id=self.config.worker_id,
            capabilities=[capability.Capability(c) for c in self.capabilities],
            active_sessions=len(await self.runner.local_sessions()),
            load=heartbeat.Load(
                cpu_percent=min(100.0, psutil.cpu_percent(interval=None)),
                memory_percent=min(100.0, psutil.virtual_memory().percent),
            ),
            runtime_versions=await self.runtime_versions(),
            at=now_iso(),
            endpoint=self.config.endpoint,
            agent_version=self.config.agent_version,
            hostname=self.config.hostname[:253],
        )

    # ------------------------------------------------------------- handlers

    async def handle_jobs(self, request: web.Request) -> web.Response:
        if not self.authorized(request):
            return web.json_response({"error": "unauthenticated"}, status=401)
        try:
            body = await request.json()
            incoming = parse_envelope(body)
        except (ValueError, json.JSONDecodeError) as error:
            return web.json_response({"error": "malformed", "detail": str(error)[:500]}, status=400)
        self.spawn(self.runner.run(incoming))
        return web.json_response({"accepted": incoming.message_id}, status=202)

    async def handle_health(self, request: web.Request) -> web.Response:
        return web.json_response(
            {
                "ok": True,
                "worker_id": self.config.worker_id,
                "active_sessions": len(await self.runner.local_sessions()),
                "runtime_versions": await self.runtime_versions(),
                "at": now_iso(),
            }
        )

    async def handle_reconcile(self, request: web.Request) -> web.Response:
        if not self.authorized(request):
            return web.json_response({"error": "unauthenticated"}, status=401)
        swept = await self.reconciler.run()
        return web.json_response({"swept": swept})

    async def handle_pty(self, request: web.Request) -> web.StreamResponse:
        if not self.authorized(request):
            return web.json_response({"error": "unauthenticated"}, status=401)
        session_id = request.match_info["id"]
        node = request.match_info["node"]
        cols = int(request.query.get("cols", "80"))
        rows = int(request.query.get("rows", "24"))
        ws = web.WebSocketResponse(heartbeat=30, max_msg_size=256 * 1024)
        await ws.prepare(request)
        try:
            pty = await self.runner.open_pty(session_id, node, cols, rows)
        except ProviderError as error:
            await ws.send_str(json.dumps({"type": "error", "message": str(error)}))
            await ws.close()
            return ws

        async def on_output(chunk: bytes) -> None:
            if not ws.closed:
                await ws.send_bytes(chunk)

        async def on_exit(code: int | None) -> None:
            if not ws.closed:
                await ws.send_str(json.dumps({"type": "exit", "code": code, "signal": None}))
                await ws.close()

        # Replay first so a reconnecting client repaints, then live output.
        if pty.scrollback:
            await ws.send_bytes(pty.scrollback)
        pty.on_output(on_output)
        pty.on_exit(on_exit)
        await ws.send_str(json.dumps({"type": "ready"}))
        try:
            async for message in ws:
                if message.type == WSMsgType.BINARY:
                    await pty.write(message.data)
                elif message.type == WSMsgType.TEXT:
                    try:
                        control = json.loads(message.data)
                    except json.JSONDecodeError:
                        continue
                    if control.get("type") == "resize":
                        await pty.resize(
                            int(control.get("cols", cols)), int(control.get("rows", rows))
                        )
                elif message.type in (WSMsgType.CLOSE, WSMsgType.ERROR):
                    break
        finally:
            detach = getattr(pty, "detach", None)
            if callable(detach):
                detach(on_output, on_exit)
        return ws

    # ------------------------------------------------------- background loops

    async def heartbeat_loop(self) -> None:
        while True:
            try:
                await self.callback.heartbeat(await self.heartbeat_message())
            except Exception:
                log.exception("heartbeat failed")
            await asyncio.sleep(HEARTBEAT_INTERVAL_SECONDS)

    async def sweep_loop(self) -> None:
        while True:
            try:
                await self.reconciler.run()
            except Exception:
                log.exception("reconcile failed")
            await asyncio.sleep(ORPHAN_SWEEP_INTERVAL_SECONDS)

    async def on_startup(self, app: web.Application) -> None:
        self.background.append(asyncio.create_task(self.sweep_loop()))
        self.background.append(asyncio.create_task(self.heartbeat_loop()))

    async def on_cleanup(self, app: web.Application) -> None:
        for task in [*self.background, *self.tasks]:
            task.cancel()
        for task in [*self.background, *self.tasks]:
            with contextlib.suppress(asyncio.CancelledError, Exception):
                await task


APP_KEY: web.AppKey[Agent] = web.AppKey("agent")


def build_app(agent: Agent, *, background: bool = True) -> web.Application:
    app = web.Application(client_max_size=4 * 1024 * 1024)
    app[APP_KEY] = agent
    app.router.add_post("/jobs", agent.handle_jobs)
    app.router.add_get("/health", agent.handle_health)
    app.router.add_post("/reconcile", agent.handle_reconcile)
    app.router.add_get("/sessions/{id}/nodes/{node}/pty", agent.handle_pty)
    if background:
        app.on_startup.append(agent.on_startup)
    app.on_cleanup.append(agent.on_cleanup)
    return app
