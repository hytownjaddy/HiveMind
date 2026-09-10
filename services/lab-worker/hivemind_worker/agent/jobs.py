"""Job execution: envelope in, events out (worker protocol v1).

The session Worker's LabSession object owns the lifecycle; the agent reports
what it did with `event.status`, `event.result`, and `event.error`. Every step
is idempotent (re-provisioning a session first destroys what exists), so the
object may replay a job after a lost callback without harm.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from hivemind_worker.agent.callback import Callback
from hivemind_worker.contracts import (
    destroy_job,
    destroy_result,
    exec_job,
    lab_spec,
    provision_job,
    worker_envelope,
)
from hivemind_worker.protocol import (
    WorkerMessage,
    destroy_ok,
    error,
    exec_ok,
    now_iso,
    provision_ok,
    status,
)
from hivemind_worker.protocol import (
    log as log_event,
)
from hivemind_worker.providers.base import Provider, ProviderError, Pty, provider_for_spec

log = logging.getLogger(__name__)

STAGE_03_JOBS = {"job.fault.inject", "job.fault.verify", "job.grade"}


def _no_ptys() -> dict[str, Pty]:
    return {}


@dataclass(slots=True)
class ActiveSession:
    lab_session_id: str
    provider: Provider
    nodes: list[str]
    ttl_at: str
    ptys: dict[str, Pty] = field(default_factory=_no_ptys)


def ttl_from(spec: lab_spec.LabSpec) -> str:
    at = datetime.now(UTC) + timedelta(minutes=spec.ttl_minutes)
    return at.replace(microsecond=0).strftime("%Y-%m-%dT%H:%M:%SZ")


class JobRunner:
    def __init__(self, providers: Iterable[Provider], callback: Callback) -> None:
        self.providers = list(providers)
        self.callback = callback
        self.sessions: dict[str, ActiveSession] = {}
        self._locks: dict[str, asyncio.Lock] = {}

    def lock(self, session_id: str) -> asyncio.Lock:
        return self._locks.setdefault(session_id, asyncio.Lock())

    def provider_named(self, provider_id: str) -> Provider | None:
        return next((p for p in self.providers if p.id == provider_id), None)

    async def provider_for_session(self, session_id: str) -> Provider | None:
        active = self.sessions.get(session_id)
        if active is not None:
            return active.provider
        for provider in self.providers:
            for local in await provider.list_sessions():
                if local.lab_session_id == session_id:
                    self.sessions[session_id] = ActiveSession(
                        session_id, provider, list(local.nodes), local.ttl_at or now_iso()
                    )
                    return provider
        return None

    async def run(self, incoming: worker_envelope.WorkerEnvelope) -> None:
        message: WorkerMessage = incoming.message
        job_id = getattr(message, "job_id", None)
        session_id = getattr(message, "lab_session_id", None)
        try:
            if isinstance(message, provision_job.ProvisionJob):
                await self._provision(message)
            elif isinstance(message, exec_job.ExecJob):
                await self._exec(message)
            elif isinstance(message, destroy_job.DestroyJob):
                await self._destroy(message)
            elif message.type in STAGE_03_JOBS:
                await self.callback.send(
                    error(
                        session_id,
                        "not_implemented",
                        f"{message.type} arrives in Stage 03",
                        False,
                        job_id,
                    ),
                    correlation_id=job_id,
                )
            else:
                await self.callback.send(
                    error(
                        session_id,
                        "unexpected_message",
                        f"agent does not accept {message.type}",
                        False,
                        job_id,
                    ),
                    correlation_id=job_id,
                )
        except ProviderError as failure:
            log.warning("job %s failed: %s %s", job_id, failure.code, failure)
            await self.callback.send(
                error(session_id, failure.code, str(failure), failure.retryable, job_id),
                correlation_id=job_id,
            )
        except Exception as failure:
            log.exception("job %s crashed", job_id)
            await self.callback.send(
                error(
                    session_id, "agent_error", f"{type(failure).__name__}: {failure}", True, job_id
                ),
                correlation_id=job_id,
            )

    async def _provision(self, job: provision_job.ProvisionJob) -> None:
        session_id = job.lab_session_id
        provider = provider_for_spec(job.lab_spec, self.providers)
        async with self.lock(session_id):
            await self.callback.send(
                status(session_id, "provisioning", f"{provider.id}"), job.job_id
            )
            ttl_at = ttl_from(job.lab_spec)
            result = await provider.provision(session_id, job.lab_spec, job.seed, ttl_at)
            self.sessions[session_id] = ActiveSession(
                session_id, provider, [node.name for node in result.nodes], ttl_at
            )
            await self.callback.send(
                status(session_id, "baseline_check", "all nodes up"), job.job_id
            )
            for node in job.lab_spec.nodes:
                check = await provider.exec(session_id, node.name, ["true"], 15)
                if check.exit_code != 0:
                    await provider.destroy(session_id)
                    self.sessions.pop(session_id, None)
                    raise ProviderError(
                        "baseline_failed", f"node {node.name} cannot execute commands"
                    )
            await self.callback.send(
                log_event(session_id, "info", f"baseline ok on {provider.id}"), job.job_id
            )
            await self.callback.send(provision_ok(job, result), job.job_id)

    async def _exec(self, job: exec_job.ExecJob) -> None:
        provider = await self.provider_for_session(job.lab_session_id)
        if provider is None:
            raise ProviderError("unknown_session", f"{job.lab_session_id} is not on this worker")
        result = await provider.exec(
            job.lab_session_id, job.node, list(job.command), job.timeout_seconds
        )
        await self.callback.send(exec_ok(job, result), job.job_id)

    async def _destroy(self, job: destroy_job.DestroyJob) -> None:
        session_id = job.lab_session_id
        async with self.lock(session_id):
            await self.callback.send(status(session_id, "destroying", job.reason.value), job.job_id)
            destroyed = await self.destroy_session(session_id)
            await self.callback.send(
                destroy_ok(
                    job,
                    destroy_result.DestroyResult(
                        lab_session_id=session_id,
                        destroyed=True,
                        detail=None if destroyed else "nothing to destroy",
                    ),
                ),
                job.job_id,
            )

    async def destroy_session(self, session_id: str) -> bool:
        active = self.sessions.pop(session_id, None)
        if active is not None:
            for pty in active.ptys.values():
                await pty.close()
        destroyed = False
        for provider in self.providers:
            if await provider.destroy(session_id):
                destroyed = True
        return destroyed

    async def open_pty(self, session_id: str, node: str, cols: int, rows: int) -> Pty:
        provider = await self.provider_for_session(session_id)
        if provider is None:
            raise ProviderError("unknown_session", f"{session_id} is not on this worker")
        active = self.sessions[session_id]
        existing = active.ptys.get(node)
        if (
            existing is not None
            and existing.exit_code is None
            and not getattr(existing, "closed", False)
        ):
            await existing.resize(cols, rows)
            return existing
        pty = await provider.open_pty(session_id, node, cols, rows)
        active.ptys[node] = pty
        return pty

    async def local_sessions(self) -> list[tuple[Provider, str, str, list[str], str | None]]:
        found: list[tuple[Provider, str, str, list[str], str | None]] = []
        for provider in self.providers:
            for local in await provider.list_sessions():
                found.append(
                    (provider, local.lab_session_id, local.handle, local.nodes, local.ttl_at)
                )
        return found
