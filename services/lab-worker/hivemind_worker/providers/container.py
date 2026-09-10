"""`container.linux`: one Linux node straight on Docker (Class C on the worker).

Per-session bridge network (internal when egress is denied), cgroup and pid
limits, capability drop with NET_ADMIN/NET_RAW re-added, no host socket, and
every object labelled with the session id so the sweeper can find leftovers.
"""

from __future__ import annotations

import logging
from typing import Any

from docker.models.containers import Container
from docker.models.networks import Network

from hivemind_worker.contracts import exec_result, lab_spec, lab_status, provision_result
from hivemind_worker.protocol import node_config_of
from hivemind_worker.providers.base import LocalSession, ProviderError, Pty
from hivemind_worker.providers.docker_runtime import DockerRuntime
from hivemind_worker.safety.limits import limits_for
from hivemind_worker.topology.render import (
    CONTAINER_LABEL_MANAGED,
    CONTAINER_LABEL_NODE,
    CONTAINER_LABEL_SESSION,
    CONTAINER_LABEL_TTL,
    lab_name,
    mgmt_subnet,
    node_files,
    shell_for,
)

log = logging.getLogger(__name__)

PROVIDER_ID = "container.linux"
LABEL_PROVIDER = "hivemind.provider"
LABEL_SHELL = "hivemind.shell"


def network_name(session_id: str) -> str:
    return f"hm-{lab_name(session_id)}"


def container_name_for(session_id: str, node: str) -> str:
    return f"hm-{lab_name(session_id)}-{node}"


class ContainerProvider:
    id = PROVIDER_ID

    def __init__(self, runtime: DockerRuntime, disk_quota_supported: bool = False) -> None:
        self.runtime = runtime
        self.disk_quota_supported = disk_quota_supported

    async def provision(
        self, session_id: str, spec: lab_spec.LabSpec, seed: int, ttl_at: str
    ) -> provision_result.ProvisionResult:
        if len(spec.nodes) != 1 or spec.links:
            raise ProviderError(
                "unsupported_topology", "container.linux runs exactly one node with no links"
            )
        node = spec.nodes[0]
        await self.runtime.ensure_image(node.image)
        labels = {
            CONTAINER_LABEL_MANAGED: "true",
            CONTAINER_LABEL_SESSION: session_id,
            CONTAINER_LABEL_TTL: ttl_at,
            LABEL_PROVIDER: PROVIDER_ID,
        }
        subnet = mgmt_subnet(session_id)
        await self.destroy(session_id)  # idempotent re-provision
        network: Network = await self.runtime.call(
            self.runtime.client.networks.create,
            network_name(session_id),
            driver="bridge",
            internal=spec.network.egress.value == "deny",
            labels=labels,
            ipam={"Config": [{"Subnet": str(subnet)}]},
            options={"com.docker.network.bridge.enable_ip_masquerade": "false"},
        )
        limits = limits_for(
            spec.resources, len(spec.nodes), disk_quota_supported=self.disk_quota_supported
        )
        config = node_config_of(node)
        hostname = config.hostname if config is not None and config.hostname else node.name
        try:
            container: Container = await self.runtime.call(
                self.runtime.client.containers.run,
                node.image,
                ["sleep", "infinity"],
                name=container_name_for(session_id, node.name),
                hostname=hostname,
                detach=True,
                network=network.name,
                labels={**labels, CONTAINER_LABEL_NODE: node.name, LABEL_SHELL: shell_for(node)},
                environment={"HIVEMIND_SESSION": session_id, "HIVEMIND_NODE": node.name},
                **limits.host_config_kwargs(),
            )
        except Exception as error:
            await self.destroy(session_id)
            raise ProviderError("container_start_failed", str(error), retryable=True) from error
        for command in node_files(node).exec_after_start:
            result = await self.runtime.exec(container, ["sh", "-c", command], 30)
            if result.exit_code != 0:
                await self.destroy(session_id)
                raise ProviderError(
                    "node_config_failed", f"{command!r} exited {result.exit_code}: {result.stderr}"
                )
        address = await self._address(container, network.name or "")
        return provision_result.ProvisionResult(
            lab_session_id=session_id,
            provider_id=PROVIDER_ID,
            status=lab_status.LabStatus.baseline_check,
            handle=container_name_for(session_id, node.name),
            nodes=[provision_result.Node(name=node.name, address=address)],
        )

    async def _address(self, container: Container, network: str) -> str | None:
        await self.runtime.call(container.reload)
        attrs: dict[str, Any] = container.attrs
        networks = attrs.get("NetworkSettings", {}).get("Networks", {})
        entry = networks.get(network, {})
        address = entry.get("IPAddress")
        return str(address) if address else None

    async def _container(self, session_id: str, node: str) -> Container:
        container = await self.runtime.container(container_name_for(session_id, node))
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
        labels: dict[str, str] = container.labels
        shell = labels.get(LABEL_SHELL) or "/bin/sh"
        return await self.runtime.open_pty(container, shell, cols, rows, {})

    async def destroy(self, session_id: str) -> bool:
        containers = await self.runtime.containers_with_label(CONTAINER_LABEL_SESSION, session_id)
        found = False
        for container in containers:
            if container.labels.get(LABEL_PROVIDER) == PROVIDER_ID:
                found = True
                await self.runtime.remove_container(container)
        removed = await self.runtime.remove_network(network_name(session_id))
        return found or removed

    async def list_sessions(self) -> list[LocalSession]:
        sessions: dict[str, LocalSession] = {}
        for container in await self.runtime.containers_with_label(LABEL_PROVIDER, PROVIDER_ID):
            session_id = container.labels.get(CONTAINER_LABEL_SESSION)
            if session_id is None:
                continue
            entry = sessions.setdefault(
                session_id,
                LocalSession(
                    lab_session_id=session_id,
                    handle=container.name or session_id,
                    ttl_at=container.labels.get(CONTAINER_LABEL_TTL),
                ),
            )
            node = container.labels.get(CONTAINER_LABEL_NODE)
            if node is not None:
                entry.nodes.append(node)
        return sorted(sessions.values(), key=lambda s: s.lab_session_id)

    async def runtime_versions(self) -> dict[str, str]:
        return {"docker": await self.runtime.version()}
