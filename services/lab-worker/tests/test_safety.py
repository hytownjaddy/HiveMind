from __future__ import annotations

import ipaddress

import pytest

from hivemind_worker.config import ConfigError, load_config
from hivemind_worker.contracts import lab_spec
from hivemind_worker.safety.egress import cleanup_for, is_session_rule, rules_for
from hivemind_worker.safety.limits import PIDS_LIMIT, limits_for


def test_egress_rules_drop_everything_but_the_allowlist_and_cleanup_inverts() -> None:
    subnet = ipaddress.IPv4Network("10.250.7.0/24")
    rules = rules_for("HM-LAB-000007", subnet, ["1.1.1.1", "10.9.0.0/16"])
    shells = [rule.shell() for rule in rules]
    assert rules[0].add()[:12] == [
        "iptables",
        "-w",
        "5",
        "-I",
        "DOCKER-USER",
        "1",
        "-s",
        "10.250.7.0/24",
        "!",
        "-d",
        "10.250.7.0/24",
        "-j",
    ]
    assert "-I INPUT 1 -s 10.250.7.0/24 -j DROP" in shells[1]
    assert "-d 1.1.1.1/32 -j ACCEPT" in shells[2]
    assert "-d 10.9.0.0/16 -j ACCEPT" in shells[3]
    assert all("hivemind:HM-LAB-000007" in shell for shell in shells)
    deletes = cleanup_for(rules)
    assert deletes[0][3] == "-D" and deletes[0][4] == "DOCKER-USER"
    assert len(deletes) == len(rules)
    assert is_session_rule(
        '-A DOCKER-USER -s 10.250.7.0/24 -m comment --comment "hivemind:HM-LAB-000007" -j DROP'
    )
    assert is_session_rule(
        '-A DOCKER-USER -m comment --comment "hivemind:HM-LAB-000007"', "HM-LAB-000007"
    )
    assert not is_session_rule("-A DOCKER-USER -j RETURN")


def test_limits_split_resources_and_contain_forks_and_memory() -> None:
    resources = lab_spec.Resources(cpu_millicores=2000, memory_mb=2048, disk_mb=4096)
    limits = limits_for(resources, node_count=4)
    kwargs = limits.host_config_kwargs()
    assert kwargs["nano_cpus"] == 500_000_000
    assert kwargs["mem_limit"] == "512m"
    assert kwargs["memswap_limit"] == "512m"  # no swap spill for a memory hog
    assert kwargs["pids_limit"] == PIDS_LIMIT  # fork bomb ceiling
    assert "ALL" in kwargs["cap_drop"]  # type: ignore[operator]
    assert "NET_ADMIN" in kwargs["cap_add"]  # type: ignore[operator]
    assert "storage_opt" not in kwargs
    quota = limits_for(resources, node_count=1, disk_quota_supported=True)
    assert quota.host_config_kwargs()["storage_opt"] == {"size": "4096M"}
    plain = limits_for(resources, network_admin=False)
    assert "NET_ADMIN" not in plain.cap_add


def test_config_requires_access_settings_unless_insecure_on_loopback() -> None:
    with pytest.raises(ConfigError):
        load_config({})
    insecure = load_config({"HIVEMIND_WORKER_INSECURE": "1"})
    assert insecure.listen_host == "127.0.0.1"
    assert insecure.callback_enabled is False
    assert insecure.service_headers() == {}
    with pytest.raises(ConfigError):
        load_config({"HIVEMIND_WORKER_INSECURE": "1", "HIVEMIND_WORKER_LISTEN": "0.0.0.0:8790"})
    secure = load_config(
        {
            "HIVEMIND_ACCESS_TEAM_DOMAIN": "https://team.cloudflareaccess.com",
            "HIVEMIND_WORKER_ACCESS_AUD": "aud",
            "HIVEMIND_SESSION_URL": "https://hivemind.jryans.dev/",
            "HIVEMIND_ACCESS_CLIENT_ID": "id.access",
            "HIVEMIND_ACCESS_CLIENT_SECRET": "secret",
            "HIVEMIND_WORKER_ID": "ubuntu-lab-worker-1",
        }
    )
    assert secure.session_url == "https://hivemind.jryans.dev"
    assert secure.service_headers()["CF-Access-Client-Id"] == "id.access"
    assert secure.worker_id == "ubuntu-lab-worker-1"
