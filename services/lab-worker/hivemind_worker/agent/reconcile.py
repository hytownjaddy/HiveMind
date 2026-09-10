"""Reconciliation and the orphan sweeper (Stage 02 acceptance 5 and 7).

On start and every sweep interval the agent lists what it can see on the host
and tells the session Worker. The reply names the sessions the objects still
expect here; anything else is an orphan and is destroyed. Sessions past their
TTL label are destroyed even without a reply, so a lost control plane never
leaves labs running forever.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from hivemind_worker.agent.callback import Callback
from hivemind_worker.agent.jobs import JobRunner
from hivemind_worker.contracts import reconcile_event, reconcile_expected
from hivemind_worker.protocol import log as log_event
from hivemind_worker.protocol import now_iso, status

log = logging.getLogger(__name__)


def _parse(at: str | None) -> datetime | None:
    if at is None:
        return None
    try:
        return datetime.strptime(at, "%Y-%m-%dT%H:%M:%SZ").replace(tzinfo=UTC)
    except ValueError:
        return None


class Reconciler:
    def __init__(self, worker_id: str, runner: JobRunner, callback: Callback) -> None:
        self.worker_id = worker_id
        self.runner = runner
        self.callback = callback
        self.last_expected: set[str] | None = None

    async def report(self) -> reconcile_event.ReconcileEvent:
        sessions = [
            reconcile_event.Session(
                lab_session_id=session_id,
                handle=handle,
                nodes=[reconcile_event.Node(root=node) for node in nodes],
            )
            for _, session_id, handle, nodes, _ in await self.runner.local_sessions()
        ]
        return reconcile_event.ReconcileEvent(
            type="event.reconcile", worker_id=self.worker_id, sessions=sessions, at=now_iso()
        )

    async def run(self) -> dict[str, list[str]]:
        """One pass; returns what was swept and why (for logs and tests)."""
        swept: dict[str, list[str]] = {"expired": [], "orphaned": []}
        local = await self.runner.local_sessions()
        now = datetime.now(UTC)
        for _, session_id, _, _, ttl_at in local:
            expiry = _parse(ttl_at)
            if expiry is not None and expiry <= now:
                log.info("sweeping %s: hard TTL %s passed", session_id, ttl_at)
                await self.runner.destroy_session(session_id)
                swept["expired"].append(session_id)
                await self.callback.send(status(session_id, "destroyed", "hard_ttl"))
        reply = await self.callback.reconcile(await self.report())
        if reply is None or not isinstance(reply.message, reconcile_expected.ReconcileExpected):
            return swept
        expected = {entry.lab_session_id for entry in reply.message.sessions}
        self.last_expected = expected
        for _, session_id, _, _, _ in await self.runner.local_sessions():
            if session_id not in expected:
                log.info("sweeping %s: not expected by the session Worker", session_id)
                await self.runner.destroy_session(session_id)
                swept["orphaned"].append(session_id)
                await self.callback.send(
                    log_event(session_id, "warn", "orphan destroyed by the worker sweeper")
                )
        return swept
