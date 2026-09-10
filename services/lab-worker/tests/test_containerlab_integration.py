"""network.containerlab against real containerlab + Docker (Stage 02 acceptance 2, 5, 6).

Runs in the nightly containerlab job and on the lab host; skipped elsewhere. Needs
root (containerlab) and the FRR image pinned by the archetype.
"""

from __future__ import annotations

import asyncio
import json
import os
import subprocess
import time
from pathlib import Path
from typing import Any, cast

import pytest
from pydantic import TypeAdapter

from hivemind_worker.contracts import topology_instance
from hivemind_worker.providers.containerlab import CommandRunner, ContainerlabProvider
from hivemind_worker.providers.docker_runtime import DockerRuntime
from hivemind_worker.topology.render import CONTAINER_LABEL_SESSION, mgmt_subnet

pytestmark = pytest.mark.containerlab

FIXTURES = Path(__file__).parent / "fixtures"
SESSION = "HM-LAB-000777"
adapter: TypeAdapter[topology_instance.TopologyInstance] = TypeAdapter(
    topology_instance.TopologyInstance
)


def docker_user_rules() -> str:
    return subprocess.run(
        ["iptables", "-S", "DOCKER-USER"], capture_output=True, text=True, check=False
    ).stdout


def ready() -> bool:
    return (
        DockerRuntime.available() and CommandRunner.available("containerlab") and os.geteuid() == 0
    )


@pytest.fixture
def provider(tmp_path: Path) -> ContainerlabProvider:
    if not ready():
        pytest.skip("needs root, Docker, and containerlab")
    return ContainerlabProvider(DockerRuntime(), tmp_path)


def dual_spine() -> topology_instance.TopologyInstance:
    return adapter.validate_python(json.loads((FIXTURES / "bgp-dual-spine-seed7.json").read_text()))


async def wait_for_bgp(provider: ContainerlabProvider, node: str, peers: int) -> dict[str, int]:
    """Poll `show bgp summary json` until every peer is Established (or 90 s pass)."""
    deadline = time.monotonic() + 90
    established: dict[str, int] = {}
    while time.monotonic() < deadline:
        result = await provider.exec(
            SESSION, node, ["vtysh", "-c", "show bgp ipv4 unicast summary json"], 20
        )
        if result.exit_code == 0 and result.stdout.strip():
            summary = cast(dict[str, Any], json.loads(result.stdout))
            peers_json = cast(dict[str, dict[str, Any]], summary.get("peers", {}))
            established = {
                address: int(entry.get("pfxRcd", 0))
                for address, entry in peers_json.items()
                if entry.get("state") == "Established"
            }
            if len(established) >= peers:
                return established
        await asyncio.sleep(2)
    return established


async def test_dual_spine_comes_up_with_established_bgp_and_leaves_nothing(
    provider: ContainerlabProvider,
) -> None:
    instance = dual_spine()
    started = time.monotonic()
    result = await provider.provision(
        SESSION, instance.lab_spec, instance.seed, "2099-01-01T00:00:00Z"
    )
    ready_in = time.monotonic() - started
    try:
        assert {node.name for node in result.nodes} == {"spine1", "spine2", "leaf1", "leaf2"}
        assert all(node.address for node in result.nodes)
        assert ready_in < 60, f"ready in {ready_in:.1f}s"  # acceptance 2
        # Every leaf peers with both spines; every spine with both leaves.
        assert len(await wait_for_bgp(provider, "spine1", 2)) == 2
        assert len(await wait_for_bgp(provider, "leaf1", 2)) == 2
        # Loopbacks are learned across the fabric.
        routes = await provider.exec(SESSION, "leaf1", ["vtysh", "-c", "show ip route bgp"], 20)
        assert "10.255.1.2/32" in routes.stdout
        # Egress is denied: nothing leaves the management subnet (acceptance 6).
        egress = await provider.exec(
            SESSION, "spine1", ["sh", "-c", "ping -c1 -W2 1.1.1.1 >/dev/null 2>&1"], 10
        )
        assert egress.exit_code != 0
        # The rules carry the session marker so cleanup can find them.
        rules = docker_user_rules()
        assert f"hivemind:{SESSION}" in rules
        assert str(mgmt_subnet(SESSION)) in rules
        # A PTY on a router opens a shell.
        pty = await provider.open_pty(SESSION, "spine1", 80, 24)
        seen: list[bytes] = []

        async def on_output(chunk: bytes) -> None:
            seen.append(chunk)

        pty.on_output(on_output)
        await asyncio.sleep(0.5)
        await pty.write(b"vtysh -c 'show bgp summary' | head -3\r")
        for _ in range(50):
            if b"BGP" in b"".join(seen):
                break
            await asyncio.sleep(0.2)
        assert b"BGP" in b"".join(seen)
        await pty.close()
    finally:
        assert await provider.destroy(SESSION)
    runtime = provider.runtime
    assert await runtime.containers_with_label(CONTAINER_LABEL_SESSION, SESSION) == []
    assert not (provider.lab_dir(SESSION)).exists()
    assert f"hivemind:{SESSION}" not in docker_user_rules()
    assert await provider.list_sessions() == []


async def test_up_down_cycles_leave_no_labs(provider: ContainerlabProvider) -> None:
    cycles = int(os.environ.get("HIVEMIND_TEST_CLAB_CYCLES", "2"))
    instance = adapter.validate_python(
        json.loads((FIXTURES / "linux-pair-seed11.json").read_text())
    )
    for index in range(cycles):
        session = f"HM-LAB-0008{index:02d}"
        await provider.provision(session, instance.lab_spec, index, "2099-01-01T00:00:00Z")
        ping = await provider.exec(
            session,
            "host1",
            [
                "sh",
                "-c",
                "ping -c1 -W2 $(ip -4 -o addr show eth1 | awk '{print $4}' | sed 's#\\.1/30#.2#')",
            ],
            10,
        )
        assert ping.exit_code == 0, ping.stderr
        assert await provider.destroy(session)
    assert await provider.list_sessions() == []
    assert await provider.runtime.containers_with_label("containerlab") == []
