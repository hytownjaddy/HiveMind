"""Topology rendering: LabSpec → containerlab YAML and FRR files (pure)."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
import yaml
from pydantic import TypeAdapter

from hivemind_worker.contracts import lab_node_config, topology_instance
from hivemind_worker.protocol import node_config_of
from hivemind_worker.topology.render import (
    CONTAINER_LABEL_SESSION,
    RenderError,
    container_name,
    frr_conf,
    mgmt_subnet,
    render,
    write_lab_dir,
)

FIXTURES = Path(__file__).parent / "fixtures"
adapter: TypeAdapter[topology_instance.TopologyInstance] = TypeAdapter(
    topology_instance.TopologyInstance
)


def load(name: str) -> topology_instance.TopologyInstance:
    return adapter.validate_python(json.loads((FIXTURES / name).read_text()))


def test_dual_spine_renders_links_binds_and_labels() -> None:
    instance = load("bgp-dual-spine-seed7.json")
    lab = render("HM-LAB-000007", instance.lab_spec, "2026-09-09T14:00:00Z")
    topology = yaml.safe_load(lab.topology_yaml())
    assert topology["name"] == "hm-lab-000007"
    assert topology["mgmt"]["ipv4-subnet"] == "10.250.7.0/24"
    assert topology["mgmt"]["external-access"] is False
    nodes = topology["topology"]["nodes"]
    assert set(nodes) == {"spine1", "spine2", "leaf1", "leaf2"}
    assert nodes["spine1"]["labels"][CONTAINER_LABEL_SESSION] == "HM-LAB-000007"
    assert nodes["spine1"]["image"].startswith("quay.io/frrouting/frr:10.7.1@sha256:")
    assert "spine1/frr.conf:/etc/frr/frr.conf" in nodes["spine1"]["binds"]
    assert "ip addr replace 10.0.1.0/31 dev eth1" in nodes["spine1"]["exec"]
    assert {"endpoints": ["spine1:eth1", "leaf1:eth1"]} in topology["topology"]["links"]
    assert len(topology["topology"]["links"]) == 4
    assert container_name("HM-LAB-000007", "leaf1") == "clab-hm-lab-000007-leaf1"


def test_frr_conf_has_neighbors_networks_and_rr_clients() -> None:
    instance = load("bgp-dual-spine-seed7.json")
    spine = next(n for n in instance.lab_spec.nodes if n.name == "spine1")
    config = node_config_of(spine)
    assert isinstance(config, lab_node_config.LabNodeConfig2)
    conf = frr_conf(config, "spine1")
    assert "router bgp 65000" in conf
    assert " neighbor 10.0.1.1 remote-as 65001" in conf
    assert "  network 10.255.0.1/32" in conf
    assert "bgp router-id 10.255.0.1" in conf
    rr = config.model_copy(
        update={
            "bgp": config.bgp.model_copy(
                update={
                    "neighbors": [
                        config.bgp.neighbors[0].model_copy(
                            update={"remote_asn": 65000, "route_reflector_client": True}
                        )
                    ],
                    "cluster_id": "10.255.0.100",
                }
            )
        }
    )
    rr_conf = frr_conf(rr, "rr1")
    assert " bgp cluster-id 10.255.0.100" in rr_conf
    assert "  neighbor 10.0.1.1 route-reflector-client" in rr_conf
    assert " neighbor 10.0.1.1 update-source lo" in rr_conf


def test_linux_pair_exec_commands_and_write(tmp_path: Path) -> None:
    instance = load("linux-pair-seed11.json")
    lab = render("HM-LAB-000011", instance.lab_spec, "2026-09-09T14:00:00Z")
    host1 = lab.topology["topology"]["nodes"]["host1"]  # type: ignore[index]
    assert any(cmd.startswith("ip addr replace 10.") for cmd in host1["exec"])  # type: ignore[index]
    path = write_lab_dir(lab, tmp_path / "lab")
    assert path.name == "topology.clab.yml"
    assert (tmp_path / "lab" / "lab.json").exists()
    assert not (tmp_path / "lab" / "host1" / "frr.conf").exists()


def test_single_host_has_no_links_and_subnet_is_deterministic() -> None:
    instance = load("linux-single-seed1.json")
    lab = render("HM-LAB-829143", instance.lab_spec, "2026-09-09T14:00:00Z")
    assert lab.topology["topology"]["links"] == []  # type: ignore[index]
    assert str(mgmt_subnet("HM-LAB-829143")) == f"10.250.{829143 % 256}.0/24"
    assert mgmt_subnet("HM-LAB-000001") == mgmt_subnet("HM-LAB-000001")


def test_bad_link_endpoint_is_rejected() -> None:
    instance = load("linux-pair-seed11.json")
    spec = instance.lab_spec.model_copy(
        update={"links": [instance.lab_spec.links[0].model_copy(update={"b": "ghost:eth1"})]}
    )
    with pytest.raises(RenderError):
        render("HM-LAB-000011", spec, "2026-09-09T14:00:00Z")
