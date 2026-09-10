"""Render a LabSpec into a containerlab topology and per-node startup files.

Pure functions over the generated contracts (D-032): no Docker, no filesystem.
`write_lab_dir` is the only side effect and lives at the bottom. The session
Worker already resolved seed and variation (packages/core instantiation); here
the concrete spec becomes files containerlab and FRR understand.

Naming: containerlab prefixes containers with the lab name, so the lab name is
the session id in lower case (`hm-lab-829143` → container `clab-hm-lab-829143-r1`).
"""

from __future__ import annotations

import ipaddress
import json
import re
from dataclasses import dataclass, field
from pathlib import Path

import yaml

from hivemind_worker.contracts import lab_node_config, lab_spec
from hivemind_worker.protocol import NodeConfig, node_config_of

MGMT_SUBNET_BASE = ipaddress.IPv4Network("10.250.0.0/16")
CONTAINER_LABEL_SESSION = "hivemind.session"
CONTAINER_LABEL_MANAGED = "hivemind.managed"
CONTAINER_LABEL_NODE = "hivemind.node"
CONTAINER_LABEL_TTL = "hivemind.ttl_at"
FRR_DAEMONS_ALWAYS = ("zebra", "staticd")
FRR_DAEMONS_KNOWN = ("bgpd", "ospfd", "isisd", "ldpd", "bfdd", "ospf6d", "ripd", "pimd")


class RenderError(ValueError):
    pass


def lab_name(session_id: str) -> str:
    """`HM-LAB-829143` → `hm-lab-829143` (containerlab names must be lower case)."""
    return session_id.lower()


def container_name(session_id: str, node: str) -> str:
    return f"clab-{lab_name(session_id)}-{node}"


def session_sequence(session_id: str) -> int:
    match = re.search(r"(\d+)$", session_id)
    if match is None:
        raise RenderError(f"session id without a sequence: {session_id}")
    return int(match.group(1))


def mgmt_subnet(session_id: str) -> ipaddress.IPv4Network:
    """Per-session management /24 inside 10.250.0.0/16, chosen by session sequence."""
    index = session_sequence(session_id) % 256
    return ipaddress.IPv4Network(f"10.250.{index}.0/24")


@dataclass(frozen=True, slots=True)
class NodeFiles:
    """Files written under `<lab dir>/<node>/` and bound into the container."""

    binds: tuple[tuple[str, str], ...]  # (relative path, container path)
    contents: dict[str, str]
    exec_after_start: tuple[str, ...]


def _no_files() -> dict[str, NodeFiles]:
    return {}


@dataclass(frozen=True, slots=True)
class RenderedLab:
    name: str
    topology: dict[str, object]
    nodes: dict[str, NodeFiles] = field(default_factory=_no_files)

    def topology_yaml(self) -> str:
        return yaml.safe_dump(self.topology, sort_keys=False, default_flow_style=False)


def _interface_commands(interfaces: list[lab_node_config.Interface]) -> list[str]:
    commands: list[str] = []
    for interface in interfaces:
        commands.append(f"ip link set {interface.name} up")
        if interface.ipv4 is not None:
            commands.append(f"ip addr replace {interface.ipv4} dev {interface.name}")
    return commands


def _linux_files(config: lab_node_config.LabNodeConfig1) -> NodeFiles:
    commands = _interface_commands(config.interfaces)
    for route in config.routes:
        commands.append(f"ip route replace {route.prefix} via {route.via}")
    return NodeFiles(binds=(), contents={}, exec_after_start=tuple(commands))


def frr_daemons_file(config: lab_node_config.LabNodeConfig2) -> str:
    enabled = set(FRR_DAEMONS_ALWAYS) | {daemon.value for daemon in config.daemons}
    lines = [f"{name}={'yes' if name in enabled else 'no'}" for name in ("zebra", "staticd")]
    lines += [f"{name}={'yes' if name in enabled else 'no'}" for name in FRR_DAEMONS_KNOWN]
    lines += [
        "vtysh_enable=yes",
        'zebra_options="  -A 127.0.0.1 -s 90000000"',
        'bgpd_options="   -A 127.0.0.1"',
        'staticd_options="-A 127.0.0.1"',
    ]
    return "\n".join(lines) + "\n"


def frr_conf(config: lab_node_config.LabNodeConfig2, hostname: str) -> str:
    lines = [
        "frr version 10.7",
        "frr defaults traditional",
        f"hostname {hostname}",
        "log stdout",
        "no ipv6 forwarding",
        "!",
    ]
    if config.loopback is not None and config.loopback.ipv4 is not None:
        lines += ["interface lo", f" ip address {config.loopback.ipv4}", "exit", "!"]
    for interface in config.interfaces:
        lines.append(f"interface {interface.name}")
        if interface.ipv4 is not None:
            lines.append(f" ip address {interface.ipv4}")
        lines += ["exit", "!"]
    if lab_node_config.Daemon.bgpd in config.daemons:
        lines += [f"router bgp {config.asn}", f" bgp router-id {config.router_id}"]
        lines.append(" no bgp ebgp-requires-policy")
        lines.append(" no bgp network import-check")
        if config.bgp.cluster_id is not None:
            lines.append(f" bgp cluster-id {config.bgp.cluster_id}")
        for neighbor in config.bgp.neighbors:
            lines.append(f" neighbor {neighbor.address} remote-as {neighbor.remote_asn}")
            if neighbor.description is not None:
                lines.append(f" neighbor {neighbor.address} description {neighbor.description}")
            if neighbor.remote_asn == config.asn:
                lines.append(f" neighbor {neighbor.address} update-source lo")
        lines.append(" !")
        lines.append(" address-family ipv4 unicast")
        for network in config.bgp.networks:
            lines.append(f"  network {network.root}")
        for neighbor in config.bgp.neighbors:
            if neighbor.route_reflector_client:
                lines.append(f"  neighbor {neighbor.address} route-reflector-client")
        lines += [" exit-address-family", "exit", "!"]
    return "\n".join(lines) + "\n"


def _frr_files(config: lab_node_config.LabNodeConfig2, hostname: str) -> NodeFiles:
    commands = _interface_commands(config.interfaces)
    if config.loopback is not None and config.loopback.ipv4 is not None:
        commands.append(f"ip addr replace {config.loopback.ipv4} dev lo")
    return NodeFiles(
        binds=(
            ("daemons", "/etc/frr/daemons"),
            ("frr.conf", "/etc/frr/frr.conf"),
            ("vtysh.conf", "/etc/frr/vtysh.conf"),
        ),
        contents={
            "daemons": frr_daemons_file(config),
            "frr.conf": frr_conf(config, hostname),
            "vtysh.conf": "service integrated-vtysh-config\n",
        },
        exec_after_start=tuple(commands),
    )


def node_files(node: lab_spec.Node) -> NodeFiles:
    config: NodeConfig | None = node_config_of(node)
    if config is None:
        return NodeFiles(binds=(), contents={}, exec_after_start=())
    if isinstance(config, lab_node_config.LabNodeConfig1):
        return _linux_files(config)
    return _frr_files(config, config.hostname or node.name)


def shell_for(node: lab_spec.Node) -> str:
    config = node_config_of(node)
    return "/bin/sh" if config is None else config.shell


def _node_limits(spec: lab_spec.LabSpec) -> tuple[str, str]:
    count = max(1, len(spec.nodes))
    cpu = spec.resources.cpu_millicores / 1000 / count
    memory_mb = max(64, spec.resources.memory_mb // count)
    return f"{cpu:.2f}", f"{memory_mb}Mb"


def render(session_id: str, spec: lab_spec.LabSpec, ttl_at: str) -> RenderedLab:
    """containerlab topology for `spec`; every container carries the session labels."""
    names = [node.name for node in spec.nodes]
    if len(set(names)) != len(names):
        raise RenderError("duplicate node names")
    name = lab_name(session_id)
    subnet = mgmt_subnet(session_id)
    cpu, memory = _node_limits(spec)
    nodes: dict[str, dict[str, object]] = {}
    files: dict[str, NodeFiles] = {}
    for node in spec.nodes:
        rendered = node_files(node)
        files[node.name] = rendered
        entry: dict[str, object] = {
            "kind": "linux",
            "image": node.image,
            "cpu": float(cpu),
            "memory": memory,
            "labels": {
                CONTAINER_LABEL_MANAGED: "true",
                CONTAINER_LABEL_SESSION: session_id,
                CONTAINER_LABEL_NODE: node.name,
                CONTAINER_LABEL_TTL: ttl_at,
            },
        }
        if rendered.binds:
            entry["binds"] = [f"{node.name}/{src}:{dst}" for src, dst in rendered.binds]
        if rendered.exec_after_start:
            entry["exec"] = list(rendered.exec_after_start)
        nodes[node.name] = entry
    links: list[dict[str, object]] = []
    for link in spec.links:
        for endpoint in (link.a, link.b):
            node_name, _, iface = endpoint.partition(":")
            if node_name not in files or not iface:
                raise RenderError(f"link endpoint {endpoint} does not match a node:interface")
        links.append({"endpoints": [link.a, link.b]})
    topology: dict[str, object] = {
        "name": name,
        "mgmt": {
            "network": f"hm-{name}",
            "ipv4-subnet": str(subnet),
            "external-access": False,
            "driver-opts": {"com.docker.network.bridge.enable_ip_masquerade": "false"},
        },
        "topology": {"nodes": nodes, "links": links},
    }
    return RenderedLab(name=name, topology=topology, nodes=files)


def write_lab_dir(lab: RenderedLab, directory: Path) -> Path:
    """Write topology.clab.yml and node files; returns the topology path."""
    directory.mkdir(parents=True, exist_ok=True)
    for node, rendered in lab.nodes.items():
        node_dir = directory / node
        node_dir.mkdir(exist_ok=True)
        for relative, content in rendered.contents.items():
            (node_dir / relative).write_text(content, encoding="utf-8")
    topology_path = directory / "topology.clab.yml"
    topology_path.write_text(lab.topology_yaml(), encoding="utf-8")
    (directory / "lab.json").write_text(
        json.dumps({"name": lab.name, "nodes": list(lab.nodes)}, indent=2) + "\n",
        encoding="utf-8",
    )
    return topology_path
