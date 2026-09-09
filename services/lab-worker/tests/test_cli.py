from __future__ import annotations

import pytest

from hivemind_worker.cli import COMMANDS, NOT_IMPLEMENTED_EXIT, main


def test_help_exits_zero(capsys: pytest.CaptureFixture[str]) -> None:
    assert main([]) == 0
    assert "hivemind-worker" in capsys.readouterr().out


@pytest.mark.parametrize(("group", "command", "stage"), COMMANDS)
def test_commands_report_their_stage(
    group: str, command: str, stage: str, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main([group, command]) == NOT_IMPLEMENTED_EXIT
    assert f"Stage {stage}" in capsys.readouterr().err
