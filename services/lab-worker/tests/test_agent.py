"""Job runner, reconciliation, and the HTTP/WebSocket surface with fake providers."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from typing import Any

import pytest
from aiohttp import WSMsgType, web
from aiohttp.test_utils import TestClient, TestServer
from pydantic import TypeAdapter

from hivemind_worker.agent.callback import NullCallback
from hivemind_worker.agent.jobs import JobRunner
from hivemind_worker.agent.reconcile import Reconciler
from hivemind_worker.agent.server import APP_KEY, Agent, build_app
from hivemind_worker.config import load_config
from hivemind_worker.contracts import (
    reconcile_expected,
    result_event,
    status_event,
    topology_instance,
    worker_envelope,
)
from hivemind_worker.protocol import dump, envelope, now_iso
from tests.fakes import FakeProvider

FIXTURES = Path(__file__).parent / "fixtures"
instance_adapter: TypeAdapter[topology_instance.TopologyInstance] = TypeAdapter(
    topology_instance.TopologyInstance
)
SESSION = "HM-LAB-000001"
JOB = "6f2b7e6c-4d0f-4d7a-9a4c-2f1b5c3d8e90"
PROVIDER_KEY: web.AppKey[FakeProvider] = web.AppKey("provider")
CALLBACK_KEY: web.AppKey[NullCallback] = web.AppKey("callback")


def instance(name: str = "linux-single-seed1.json") -> topology_instance.TopologyInstance:
    return instance_adapter.validate_python(json.loads((FIXTURES / name).read_text()))


def job(message: dict[str, Any]) -> worker_envelope.WorkerEnvelope:
    return worker_envelope.WorkerEnvelope.model_validate(
        {
            "protocol_version": 1,
            "message_id": "9c1d5a2e-7b3f-4e6a-8d2c-1a0b9f8e7d6c",
            "sent_at": now_iso(),
            "sender": {"kind": "session_worker", "id": "hivemind-session"},
            "message": message,
        }
    )


def provision_job(
    spec_instance: topology_instance.TopologyInstance,
) -> worker_envelope.WorkerEnvelope:
    return job(
        {
            "type": "job.provision",
            "job_id": JOB,
            "lab_session_id": SESSION,
            "lab_spec": dump(spec_instance.lab_spec),
            "seed": spec_instance.seed,
        }
    )


def message_types(callback: NullCallback) -> list[str]:
    return [sent.message.type for sent in callback.sent]


async def test_provision_exec_destroy_report_the_protocol_events() -> None:
    callback = NullCallback()
    provider = FakeProvider()
    runner = JobRunner([provider], callback)
    await runner.run(provision_job(instance()))
    assert message_types(callback) == ["event.status", "event.status", "event.log", "event.result"]
    statuses = [m.message for m in callback.sent if isinstance(m.message, status_event.StatusEvent)]
    assert [s.status.value for s in statuses] == ["provisioning", "baseline_check"]
    result = callback.sent[-1].message
    assert isinstance(result, result_event.ResultEvent)
    assert result.ok and result.result.kind == "provision"
    assert callback.sent[-1].correlation_id == JOB
    assert provider.calls[:2] == [f"provision {SESSION}", f"exec {SESSION} host1 true"]

    callback.sent.clear()
    await runner.run(
        job(
            {
                "type": "job.exec",
                "job_id": JOB,
                "lab_session_id": SESSION,
                "node": "host1",
                "command": ["ip", "route"],
                "timeout_seconds": 10,
            }
        )
    )
    exec_result = callback.sent[-1].message
    assert isinstance(exec_result, result_event.ResultEvent)
    assert exec_result.result.kind == "exec"
    assert exec_result.result.result.stdout == "ip route"  # type: ignore[union-attr]

    callback.sent.clear()
    await runner.run(
        job(
            {"type": "job.destroy", "job_id": JOB, "lab_session_id": SESSION, "reason": "requested"}
        )
    )
    assert message_types(callback) == ["event.status", "event.result"]
    assert provider.sessions == {}


async def test_failures_and_stage_03_jobs_become_error_events() -> None:
    callback = NullCallback()
    runner = JobRunner([FakeProvider(fail_provision=True)], callback)
    await runner.run(provision_job(instance()))
    failure = callback.sent[-1].message
    assert failure.type == "event.error"
    assert failure.code == "containerlab_deploy_failed"  # type: ignore[union-attr]
    assert failure.retryable is True  # type: ignore[union-attr]
    callback.sent.clear()
    await runner.run(
        job(
            {
                "type": "job.grade",
                "job_id": JOB,
                "lab_session_id": SESSION,
                "grader_id": "bgp.session_established",
                "grader_version": "1.0.0",
            }
        )
    )
    assert callback.sent[-1].message.code == "not_implemented"  # type: ignore[union-attr]


async def test_links_route_to_containerlab_and_single_nodes_to_docker() -> None:
    callback = NullCallback()
    docker = FakeProvider("container.linux")
    clab = FakeProvider("network.containerlab")
    runner = JobRunner([docker, clab], callback)
    await runner.run(provision_job(instance("linux-pair-seed11.json")))
    assert clab.calls[0] == f"provision {SESSION}"
    assert docker.calls == []
    await runner.run(provision_job(instance("linux-single-seed1.json")))
    assert docker.calls[0] == f"provision {SESSION}"


async def test_reconcile_sweeps_expired_and_unexpected_sessions() -> None:
    class ReplyingCallback(NullCallback):
        async def reconcile(self, message: Any) -> worker_envelope.WorkerEnvelope | None:
            await super().reconcile(message)
            return envelope(
                reconcile_expected.ReconcileExpected(
                    type="reconcile.expected",
                    worker_id="w",
                    sessions=[
                        reconcile_expected.Session(
                            lab_session_id="HM-LAB-000002",
                            status=reconcile_expected.lab_status.LabStatus.active,
                        )
                    ],
                    at=now_iso(),
                ),
                "session-worker",
            )

    callback = ReplyingCallback()
    provider = FakeProvider()
    runner = JobRunner([provider], callback)
    spec = instance().lab_spec
    await provider.provision("HM-LAB-000001", spec, 1, "2000-01-01T00:00:00Z")  # expired TTL
    await provider.provision("HM-LAB-000002", spec, 1, "2099-01-01T00:00:00Z")  # expected
    await provider.provision("HM-LAB-000003", spec, 1, "2099-01-01T00:00:00Z")  # orphan
    swept = await Reconciler("w", runner, callback).run()
    assert swept == {"expired": ["HM-LAB-000001"], "orphaned": ["HM-LAB-000003"]}
    assert set(provider.sessions) == {"HM-LAB-000002"}
    reported = next(m.message for m in callback.sent if m.message.type == "event.reconcile")
    assert {s.lab_session_id for s in reported.sessions} == {"HM-LAB-000002", "HM-LAB-000003"}  # type: ignore[union-attr]


@pytest.fixture
async def client() -> Any:
    config = load_config({"HIVEMIND_WORKER_INSECURE": "1", "HIVEMIND_WORKER_ID": "test-worker"})
    callback = NullCallback()
    provider = FakeProvider()
    runner = JobRunner([provider], callback)
    agent = Agent(config, runner, callback)
    app = build_app(agent, background=False)
    app[PROVIDER_KEY] = provider
    app[CALLBACK_KEY] = callback
    async with TestClient(TestServer(app)) as test_client:
        yield test_client


async def test_http_surface_accepts_jobs_and_reports_health(client: TestClient[Any, Any]) -> None:
    health = await client.get("/health")
    assert health.status == 200
    body = await health.json()
    assert body["worker_id"] == "test-worker" and body["active_sessions"] == 0
    accepted = await client.post("/jobs", json=dump(provision_job(instance())))
    assert accepted.status == 202
    malformed = await client.post("/jobs", json={"protocol_version": 1})
    assert malformed.status == 400
    # The job ran in the background; the fake callback saw the result.
    callback = client.app[CALLBACK_KEY]
    for _ in range(50):
        if any(m.message.type == "event.result" for m in callback.sent):
            break
        await asyncio.sleep(0.01)
    else:
        raise AssertionError("provision job never completed")
    heartbeat = await client.app[APP_KEY].heartbeat_message()
    assert heartbeat.worker_id == "test-worker" and heartbeat.active_sessions == 1
    assert "shell.linux" in [c.root for c in heartbeat.capabilities]


async def test_pty_websocket_replays_scrollback_then_relays(client: TestClient[Any, Any]) -> None:
    provider = client.app[PROVIDER_KEY]
    await provider.provision(SESSION, instance().lab_spec, 1, "2099-01-01T00:00:00Z")
    async with client.ws_connect(f"/sessions/{SESSION}/nodes/host1/pty?cols=100&rows=30") as ws:
        first = await ws.receive()
        assert first.type == WSMsgType.BINARY and first.data == b"$ "
        ready = await ws.receive()
        assert json.loads(ready.data) == {"type": "ready"}
        await ws.send_bytes(b"ls\r")
        echoed = await ws.receive()
        assert echoed.data == b"echo:ls\r"
        await ws.send_str(json.dumps({"type": "resize", "cols": 120, "rows": 40}))
        await ws.send_bytes(b"pwd\r")
        assert (await ws.receive()).data == b"echo:pwd\r"
    pty = provider.ptys[(SESSION, "host1")]
    assert (120, 40) in pty.sizes
    assert not pty.closed  # the PTY outlives the socket
    # Reconnect: the same PTY replays everything typed so far, then ready.
    async with client.ws_connect(f"/sessions/{SESSION}/nodes/host1/pty") as ws:
        replay = await ws.receive()
        assert replay.data == b"$ ls\rpwd\r"
        assert json.loads((await ws.receive()).data) == {"type": "ready"}
        await pty.exit(0)
        exited = await ws.receive()
        assert json.loads(exited.data)["type"] == "exit"
    unknown = await client.ws_connect(f"/sessions/{SESSION}/nodes/ghost/pty")
    error = await unknown.receive()
    assert json.loads(error.data)["type"] == "error"
    await unknown.close()
