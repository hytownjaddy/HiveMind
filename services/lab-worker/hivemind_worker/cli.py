"""Worker CLI surface (D-034).

Stage 01 fixes the command tree; each command reports which stage implements it and
exits with status 2 until then. The Python side never decides mastery or holds
authoritative state (invariant 3, D-030).
"""

from __future__ import annotations

import argparse
import sys
from collections.abc import Sequence

from hivemind_worker import __version__

# (group, command, implementing stage)
COMMANDS: tuple[tuple[str, str, str], ...] = (
    ("lab", "provision", "02"),
    ("lab", "destroy", "02"),
    ("fault", "inject", "03"),
    ("fault", "validate", "03"),
    ("problem", "validate", "03"),
    ("grader", "execute", "03"),
    ("reference-solution", "execute", "03"),
    ("topology", "validate", "02"),
)

NOT_IMPLEMENTED_EXIT = 2


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="hivemind-worker",
        description="HiveMind lab worker CLI: lab, fault, problem, grader, "
        "reference-solution, and topology commands.",
    )
    parser.add_argument("--version", action="version", version=f"%(prog)s {__version__}")
    groups = parser.add_subparsers(dest="group", metavar="group")
    by_group: dict[str, list[tuple[str, str]]] = {}
    for group, command, stage in COMMANDS:
        by_group.setdefault(group, []).append((command, stage))
    for group, commands in by_group.items():
        group_parser = groups.add_parser(group, help=f"{group} commands")
        command_parsers = group_parser.add_subparsers(dest="command", metavar="command")
        for command, stage in commands:
            command_parsers.add_parser(command, help=f"{group} {command} (Stage {stage})")
    return parser


def implementing_stage(group: str, command: str) -> str:
    for known_group, known_command, stage in COMMANDS:
        if known_group == group and known_command == command:
            return stage
    raise KeyError(f"{group} {command}")


def main(argv: Sequence[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    group: str | None = args.group
    if group is None:
        parser.print_help()
        return 0
    command: str | None = getattr(args, "command", None)
    if command is None:
        parser.parse_args([group, "--help"])
        return 0
    stage = implementing_stage(group, command)
    print(
        f"hivemind-worker {group} {command}: not implemented until Stage {stage}",
        file=sys.stderr,
    )
    return NOT_IMPLEMENTED_EXIT


if __name__ == "__main__":
    sys.exit(main())
