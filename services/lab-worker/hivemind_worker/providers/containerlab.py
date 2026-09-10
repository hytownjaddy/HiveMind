"""`network.containerlab`: multi-node topologies with real links and FRR (Class B).

The rendered lab lives under `<state dir>/labs/<session>/`; containerlab owns
the containers and links; the agent owns the egress rules for the lab's
management subnet, node exec, and PTYs (docker exec on the containerlab
containers). Everything is labelled with the session id (Stage 02 acceptance 5).
"""

from __future__ import annotations

import asyncio
import json
import logging
import shutil
from collections.abc import Sequence
from pathlib import Path
from typing import Any, cast

from docker.models.containers import Container

from hivemind_worker.contracts import exec_result, lab_spec, lab_status, provision_result
from hivemind_worker.providers.base import LocalSession, ProviderError, Pty
from hivemind_worker.providers.docker_runtime import DockerRuntime
from hivemind_worker.safety.egress import Rule, cleanup_for, rules_for
from hivemind_worker.topology.render import (
    CONTAINER_LABEL_NODE,
    CONTAINER_LABEL_SESSION,
    CONTAINER_LABEL_TTL,
    container_name,
    lab_name,
    mgmt_subnet,
    render,
    shell_for,
    write_lab_dir,
)

log = logging.getLogger(__name__)

PROVIDER_ID = "network.containerlab"
DEPLOY_TIMEOUT_SECONDS = 300
DESTROY_TIMEOUT_SECONDS = 120


class CommandRunner:
    """Runs host commands (containerlab, iptables); swapped for a fake in tests."""

    async def run(
        self, argv: Sequence[str], timeout: float, cwd: Path | None = None
    ) -> tuple[int, str, str]:
        process = await asyncio.create_subprocess_exec(
            *argv,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=cwd,
        )
        try:
            stdout, stderr = await asyncio.wait_for(process.communicate(), timeout)
        except TimeoutError:
            process.kill()
            await process.wait()
            raise
        return (
            process.returncode or 0,
            stdout.decode("utf-8", "replace"),
            stderr.decode("utf-8", "replace"),
        )

    @staticmethod
    def available(binary: str) -> bool:
        return shutil.which(binary) is not None


class ContainerlabProvider:
    id = PROVIDER_ID

    def __init__(
        self,
        runtime: DockerRuntime,
        state_dir: Path,
        commands: CommandRunner | None = None,
        manage_iptables: bool = True,
    ) -> None:
        self.runtime = runtime
        self.labs_dir = state_dir / "labs"
        self.commands = commands or CommandRunner()
        self.manage_iptables = manage_iptables

    def lab_dir(self, session_id: str) -> Path:
        return self.labs_dir / lab_name(session_id)

    async def _clab(self, args: Sequence[str], timeout: float) -> tuple[int, str, str]:
        return await self.commands.run(["containerlab", *args], timeout)

    async def _iptables(self, rules: Sequence[Rule], add: bool) -> None:
        if not self.manage_iptables:
            return
        if add:
            for rule in rules:
                check_code, _, _ = await self.commands.run(rule.check(), 10)
                if check_code == 0:
                    continue
                code, _, stderr = await self.commands.run(rule.add(), 10)
                if code != 0:
                    raise ProviderError("egress_rules_failed", stderr.strip() or "iptables failed")
            return
        for argv in cleanup_for(rules):
            await self.commands.run(argv, 10)

    async def provision(
        self, session_id: str, spec: lab_spec.LabSpec, seed: int, ttl_at: str
    ) -> provision_result.ProvisionResult:
        for node in spec.nodes:
            await self.runtime.ensure_image(node.image)
        lab = render(session_id, spec, ttl_at)
        directory = self.lab_dir(session_id)
        if directory.exists():
            await self.destroy(session_id)
        topology_path = write_lab_dir(lab, directory)
        shells = {node.name: shell_for(node) for node in spec.nodes}
        (directory / "shells.json").write_text(json.dumps(shells), encoding="utf-8")
        try:
            code, stdout, stderr = await self._clab(
                ["deploy", "-t", str(topology_path), "--reconfigure", "--skip-post-deploy"],
                DEPLOY_TIMEOUT_SECONDS,
            )
        except TimeoutError as error:
            await self.destroy(session_id)
            raise ProviderError(
                "provision_timeout",
                f"containerlab did not finish within {DEPLOY_TIMEOUT_SECONDS}s",
                retryable=True,
            ) from error
        if code != 0:
            await self.destroy(session_id)
            raise ProviderError(
                "containerlab_deploy_failed", (stderr or stdout).strip()[-1500:], retryable=True
            )
        allowlist = [item.root for item in spec.network.allowlist]
        rules = rules_for(session_id, mgmt_subnet(session_id), allowlist)
        try:
            await self._iptables(rules, add=True)
        except ProviderError:
            await self.destroy(session_id)
            raise
        nodes = await self.inspect(session_id)
        return provision_result.ProvisionResult(
            lab_session_id=session_id,
            provider_id=PROVIDER_ID,
            status=lab_status.LabStatus.baseline_check,
            handle=f"clab-{lab.name}",
            nodes=[
                provision_result.Node(name=node.name, address=nodes.get(node.name))
                for node in spec.nodes
            ],
        )

    async def inspect(self, session_id: str) -> dict[str, str]:
        """node → management IPv4 (without prefix) from `containerlab inspect`."""
        topology_path = self.lab_dir(session_id) / "topology.clab.yml"
        code, stdout, _ = await self._clab(
            ["inspect", "-t", str(topology_path), "--format", "json"], 60
        )
        if code != 0:
            return {}
        try:
            parsed: object = json.loads(stdout or "{}")
        except json.JSONDecodeError:
            return {}
        containers: list[dict[str, Any]] = []
        candidates: list[object] = []
        if isinstance(parsed, dict):
            candidates = [
                v for v in cast(dict[str, object], parsed).values() if isinstance(v, list)
            ]
        elif isinstance(parsed, list):
            candidates = [parsed]
        for group in candidates:
            for entry in cast(list[object], group):
                if isinstance(entry, dict):
                    containers.append(cast(dict[str, Any], entry))
        prefix = f"clab-{lab_name(session_id)}-"
        addresses: dict[str, str] = {}
        for entry in containers:
            name = str(entry.get("name", ""))
            if not name.startswith(prefix):
                continue
            address = str(entry.get("ipv4_address", "")).split("/")[0]
            if address and address != "N/A":
                addresses[name[len(prefix) :]] = address
        return addresses

    async def _container(self, session_id: str, node: str) -> Container:
        container = await self.runtime.container(container_name(session_id, node))
        if container is None:
            raise ProviderError("unknown_node", f"{session_id} has no node {node}")
        return container

    async def exec(
        self, session_id: str, node: str, command: list[str], timeout_seconds: int
    ) -> exec_result.ExecResult:
        return await self.runtime.exec(
            await self._container(session_id, node), command, timeout_seconds
        )

    async def open_pty(self, session_id: str, node: str, cols: int, rows: int) -> Pty:
        container = await self._container(session_id, node)
        shell = "/bin/sh"
        shells_path = self.lab_dir(session_id) / "shells.json"
        if shells_path.exists():
            shells: dict[str, str] = json.loads(shells_path.read_text(encoding="utf-8"))
            shell = shells.get(node, shell)
        return await self.runtime.open_pty(container, shell, cols, rows, {})

    async def destroy(self, session_id: str) -> bool:
        directory = self.lab_dir(session_id)
        topology_path = directory / "topology.clab.yml"
        found = False
        if topology_path.exists():
            found = True
            try:
                await self._clab(
                    ["destroy", "-t", str(topology_path), "--cleanup"], DESTROY_TIMEOUT_SECONDS
                )
            except TimeoutError:
                log.warning("containerlab destroy timed out for %s", session_id)
        # Belt and braces: anything still carrying the session label goes too.
        for container in await self.runtime.containers_with_label(
            CONTAINER_LABEL_SESSION, session_id
        ):
            if container.labels.get("containerlab") is not None:
                found = True
                await self.runtime.remove_container(container)
        await self.runtime.remove_network(f"hm-{lab_name(session_id)}")
        await self._iptables(rules_for(session_id, mgmt_subnet(session_id), []), add=False)
        if directory.exists():
            shutil.rmtree(directory, ignore_errors=True)
        return found

    async def list_sessions(self) -> list[LocalSession]:
        sessions: dict[str, LocalSession] = {}
        for container in await self.runtime.containers_with_label("containerlab"):
            session_id = container.labels.get(CONTAINER_LABEL_SESSION)
            if session_id is None:
                continue
            entry = sessions.setdefault(
                session_id,
                LocalSession(
                    lab_session_id=session_id,
                    handle=f"clab-{lab_name(session_id)}",
                    ttl_at=container.labels.get(CONTAINER_LABEL_TTL),
                ),
            )
            node = container.labels.get(CONTAINER_LABEL_NODE)
            if node is not None:
                entry.nodes.append(node)
        if self.labs_dir.exists():
            for child in self.labs_dir.iterdir():
                session_id = child.name.upper()
                if child.is_dir() and session_id.startswith("HM-LAB-"):
                    sessions.setdefault(
                        session_id,
                        LocalSession(lab_session_id=session_id, handle=f"clab-{child.name}"),
                    )
        return sorted(sessions.values(), key=lambda s: s.lab_session_id)

    async def runtime_versions(self) -> dict[str, str]:
        versions = {"docker": await self.runtime.version()}
        try:
            code, stdout, _ = await self._clab(["version"], 20)
        except (OSError, TimeoutError):
            return versions
        if code == 0:
            for line in stdout.splitlines():
                if line.lower().startswith("version:"):
                    versions["containerlab"] = line.split(":", 1)[1].strip()
        return versions
