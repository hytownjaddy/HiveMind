from __future__ import annotations

import json
from pathlib import Path

import pytest

from hivemind_worker.cli import COMMANDS, IMPLEMENTED, NOT_IMPLEMENTED_EXIT, main

FIXTURES = Path(__file__).parent / "fixtures"


def test_help_exits_zero(capsys: pytest.CaptureFixture[str]) -> None:
    assert main([]) == 0
    assert "hivemind-worker" in capsys.readouterr().out


@pytest.mark.parametrize(
    ("group", "command", "stage"),
    [entry for entry in COMMANDS if (entry[0], entry[1]) not in IMPLEMENTED],
)
def test_later_stage_commands_report_their_stage(
    group: str, command: str, stage: str, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main([group, command]) == NOT_IMPLEMENTED_EXIT
    assert f"Stage {stage}" in capsys.readouterr().err


def test_topology_validate_and_render(capsys: pytest.CaptureFixture[str], tmp_path: Path) -> None:
    instance = str(FIXTURES / "bgp-dual-spine-seed7.json")
    assert main(["topology", "validate", "--instance", instance]) == 0
    assert "4 nodes, 4 links" in capsys.readouterr().out
    assert main(["topology", "render", "--instance", instance, "--session", "HM-LAB-000007"]) == 0
    out = capsys.readouterr().out
    assert "name: hm-lab-000007" in out and "router bgp 65000" in out
    assert main(["topology", "render", "--instance", instance, "--out", str(tmp_path)]) == 0
    assert (tmp_path / "spine1" / "frr.conf").exists()
    broken = tmp_path / "broken.json"
    broken.write_text(json.dumps({"archetype_id": "x"}))
    assert main(["topology", "validate", "--instance", str(broken)]) == 1
