"""container.linux against a real Docker daemon (Stage 02 acceptance 2, 3, 5, 6).

Runs in the Linux CI job and on the lab host; skipped where no daemon answers.
Set HIVEMIND_TEST_CYCLES=20 for the leak check the acceptance criteria ask for
(the default keeps the local loop short).
"""

from __future__ import annotations

import asyncio
import json
import os
import time
from collections.abc import Callable
from pathlib import Path
from typing import cast

import pytest
from pydantic import TypeAdapter

from hivemind_worker.contracts import topology_instance
from hivemind_worker.providers.container import ContainerProvider, network_name
from hivemind_worker.providers.docker_runtime import DockerRuntime
from hivemind_worker.topology.render import CONTAINER_LABEL_SESSION

pytestmark = pytest.mark.docker

FIXTURES = Path(__file__).parent / "fixtures"
SESSION = "HM-LAB-000099"
adapter: TypeAdapter[topology_instance.TopologyInstance] = TypeAdapter(
    topology_instance.TopologyInstance
)


def docker_ready() -> bool:
    return DockerRuntime.available()


def image_present(runtime: DockerRuntime, reference: str) -> bool:
    try:
        runtime.client.images.get(reference)
    except Exception:
        return False
    return True


@pytest.fixture
def runtime() -> DockerRuntime:
    if not docker_ready():
        pytest.skip("no Docker daemon")
    runtime = DockerRuntime()
    instance = adapter.validate_python(
        json.loads((FIXTURES / "linux-single-seed1.json").read_text())
    )
    if not image_present(runtime, instance.lab_spec.nodes[0].image):
        pytest.skip(f"{instance.lab_spec.nodes[0].image} not built; run images/linux-lab")
    return runtime


def spec() -> topology_instance.TopologyInstance:
    return adapter.validate_python(json.loads((FIXTURES / "linux-single-seed1.json").read_text()))


async def leftovers(runtime: DockerRuntime) -> tuple[int, int]:
    containers = await runtime.containers_with_label(CONTAINER_LABEL_SESSION)
    list_networks = cast(
        Callable[..., list[object]],
        runtime.client.networks.list,  # pyright: ignore[reportUnknownMemberType]
    )
    networks = await runtime.call(list_networks, filters={"label": CONTAINER_LABEL_SESSION})
    return len(containers), len(networks)


async def test_provision_exec_pty_and_destroy_leave_nothing(runtime: DockerRuntime) -> None:
    provider = ContainerProvider(runtime)
    instance = spec()
    started = time.monotonic()
    result = await provider.provision(SESSION, instance.lab_spec, 1, "2099-01-01T00:00:00Z")
    ready_in = time.monotonic() - started
    try:
        assert result.nodes[0].name == "host1"
        assert result.nodes[0].address is not None
        assert ready_in < 10, f"ready in {ready_in:.1f}s"  # acceptance 2
        route = await provider.exec(SESSION, "host1", ["ip", "route", "show"], 10)
        assert route.exit_code == 0
        # No egress: the container network is internal (acceptance 6).
        egress = await provider.exec(
            SESSION, "host1", ["sh", "-c", "curl -m 3 -s https://1.1.1.1 >/dev/null"], 10
        )
        assert egress.exit_code != 0
        assert (
            await provider.exec(SESSION, "host1", ["test", "-e", "/var/run/docker.sock"], 5)
        ).exit_code != 0
        # Fork bomb hits the pid limit; the node keeps answering (acceptance 6).
        bomb = await provider.exec(SESSION, "host1", ["sh", "-c", "b(){ b|b & }; b; sleep 2"], 15)
        assert bomb.duration_ms >= 0
        alive = await provider.exec(SESSION, "host1", ["echo", "alive"], 10)
        assert alive.stdout.strip() == "alive"
        # Memory hog is killed by the cgroup; the node keeps answering.
        hog = await provider.exec(
            SESSION, "host1", ["python3", "-c", "x = bytearray(2 * 1024 ** 3); print(len(x))"], 30
        )
        assert hog.exit_code != 0
        assert (
            await provider.exec(SESSION, "host1", ["echo", "alive"], 10)
        ).stdout.strip() == "alive"
        # Timeout is enforced inside the container.
        slow = await provider.exec(SESSION, "host1", ["sleep", "5"], 1)
        assert slow.timed_out
        # PTY: echo, resize, and scrollback replay after "reconnect".
        pty = await provider.open_pty(SESSION, "host1", 80, 24)
        seen: list[bytes] = []

        async def on_output(chunk: bytes) -> None:
            seen.append(chunk)

        pty.on_output(on_output)
        await asyncio.sleep(0.5)
        await pty.write(b"echo hello-pty\r")
        for _ in range(50):
            if b"hello-pty" in b"".join(seen):
                break
            await asyncio.sleep(0.1)
        assert b"hello-pty" in b"".join(seen)
        await pty.resize(120, 40)
        await pty.write(b"stty size\r")
        for _ in range(50):
            if b"40 120" in b"".join(seen):
                break
            await asyncio.sleep(0.1)
        assert b"40 120" in b"".join(seen)
        assert b"hello-pty" in pty.scrollback  # a reconnecting client gets this replay
        await pty.write(b"exit\r")
        for _ in range(50):
            if pty.exit_code is not None:
                break
            await asyncio.sleep(0.1)
        assert pty.exit_code == 0
    finally:
        assert await provider.destroy(SESSION)
    assert await runtime.container(f"hm-{SESSION.lower()}-host1") is None
    assert not await runtime.remove_network(network_name(SESSION))


async def test_up_down_cycles_do_not_leak(runtime: DockerRuntime) -> None:
    provider = ContainerProvider(runtime)
    cycles = int(os.environ.get("HIVEMIND_TEST_CYCLES", "3"))
    before = await leftovers(runtime)
    for index in range(cycles):
        session = f"HM-LAB-0001{index:02d}"
        await provider.provision(session, spec().lab_spec, index, "2099-01-01T00:00:00Z")
        assert (await provider.exec(session, "host1", ["true"], 5)).exit_code == 0
        assert await provider.destroy(session)
    assert await leftovers(runtime) == before
    assert await provider.list_sessions() == []
