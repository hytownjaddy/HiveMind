"""Worker CLI (D-034): lab, topology, and agent commands on the lab host.

Stage 02 implements `lab provision|destroy|ls|exec`, `topology validate|render`,
and `agent run|reconcile|heartbeat`. Fault, problem, grader, and
reference-solution commands report their stage (03) and exit 2. The Python
side never decides mastery or holds authoritative state (invariant 3, D-030).
"""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from collections.abc import Sequence
from pathlib import Path
from typing import Any

from pydantic import TypeAdapter, ValidationError

from hivemind_worker import __version__
from hivemind_worker.contracts import lab_spec, topology_instance
from hivemind_worker.protocol import dump

# (group, command, implementing stage)
COMMANDS: tuple[tuple[str, str, str], ...] = (
    ("lab", "provision", "02"),
    ("lab", "destroy", "02"),
    ("lab", "ls", "02"),
    ("lab", "exec", "02"),
    ("fault", "inject", "03"),
    ("fault", "validate", "03"),
    ("problem", "validate", "03"),
    ("grader", "execute", "03"),
    ("reference-solution", "execute", "03"),
    ("topology", "validate", "02"),
    ("topology", "render", "02"),
    ("agent", "run", "02"),
    ("agent", "reconcile", "02"),
    ("agent", "heartbeat", "02"),
)

NOT_IMPLEMENTED_EXIT = 2
IMPLEMENTED = frozenset((group, command) for group, command, stage in COMMANDS if stage == "02")

instance_adapter: TypeAdapter[topology_instance.TopologyInstance] = TypeAdapter(
    topology_instance.TopologyInstance
)
spec_adapter: TypeAdapter[lab_spec.LabSpec] = TypeAdapter(lab_spec.LabSpec)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="hivemind-worker",
        description="HiveMind lab worker CLI: lab, fault, problem, grader, "
        "reference-solution, topology, and agent commands.",
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
            sub = command_parsers.add_parser(command, help=f"{group} {command} (Stage {stage})")
            _add_arguments(sub, group, command)
    return parser


def _add_arguments(sub: argparse.ArgumentParser, group: str, command: str) -> None:
    if (group, command) == ("lab", "provision"):
        sub.add_argument(
            "--instance", required=True, help="TopologyInstance JSON (hivemind topology render)"
        )
        sub.add_argument("--session", required=True, help="HM-LAB-nnnnnn")
        sub.add_argument("--ttl-minutes", type=int, default=None)
    elif (group, command) == ("lab", "destroy"):
        sub.add_argument("--session", required=True)
    elif (group, command) == ("lab", "exec"):
        sub.add_argument("--session", required=True)
        sub.add_argument("--node", required=True)
        sub.add_argument("--timeout", type=int, default=60)
        sub.add_argument("argv", nargs=argparse.REMAINDER)
    elif group == "topology":
        sub.add_argument("--instance", required=True, help="TopologyInstance JSON")
        sub.add_argument("--session", default="HM-LAB-000000")
        if command == "render":
            sub.add_argument("--out", default=None, help="directory to write the lab files into")


def implementing_stage(group: str, command: str) -> str:
    for known_group, known_command, stage in COMMANDS:
        if known_group == group and known_command == command:
            return stage
    raise KeyError(f"{group} {command}")


def load_instance(path: str) -> topology_instance.TopologyInstance:
    document: Any = json.loads(Path(path).read_text(encoding="utf-8"))
    return instance_adapter.validate_python(document)


def _topology_validate(args: argparse.Namespace) -> int:
    from hivemind_worker.topology.render import render

    try:
        instance = load_instance(args.instance)
    except (ValidationError, ValueError, OSError) as error:
        print(f"topology validate: {error}", file=sys.stderr)
        return 1
    lab = render(args.session, instance.lab_spec, "2099-01-01T00:00:00Z")
    label = f"{instance.archetype_id}@{instance.archetype_version} seed {instance.seed}"
    print(
        f"topology validate: {label}: {len(lab.nodes)} nodes, "
        f"{len(instance.lab_spec.links)} links, hash {instance.spec_hash[:12]} ok"
    )
    return 0


def _topology_render(args: argparse.Namespace) -> int:
    from hivemind_worker.topology.render import render, write_lab_dir

    instance = load_instance(args.instance)
    lab = render(args.session, instance.lab_spec, "2099-01-01T00:00:00Z")
    if args.out is None:
        print(lab.topology_yaml(), end="")
        for node, files in lab.nodes.items():
            for name, content in files.contents.items():
                print(f"--- {node}/{name}")
                print(content, end="")
        return 0
    path = write_lab_dir(lab, Path(args.out))
    print(f"topology render: wrote {path}")
    return 0


async def _with_runner(fn: Any) -> int:
    from hivemind_worker.agent.callback import NullCallback
    from hivemind_worker.agent.jobs import JobRunner
    from hivemind_worker.agent.main import build_providers
    from hivemind_worker.config import load_config

    config = load_config(
        {
            **dict(__import__("os").environ),
            "HIVEMIND_WORKER_INSECURE": "1",
            "HIVEMIND_WORKER_LISTEN": "127.0.0.1:0",
        }
    )
    callback = NullCallback()
    runner = JobRunner(build_providers(config), callback)
    return await fn(runner, callback)


def _lab_provision(args: argparse.Namespace) -> int:
    from hivemind_worker.agent.jobs import ttl_from
    from hivemind_worker.providers.base import ProviderError, provider_for_spec

    instance = load_instance(args.instance)
    spec = instance.lab_spec
    if args.ttl_minutes is not None:
        spec = spec.model_copy(update={"ttl_minutes": args.ttl_minutes})

    async def go(runner: Any, _callback: Any) -> int:
        provider = provider_for_spec(spec, runner.providers)
        try:
            result = await provider.provision(args.session, spec, instance.seed, ttl_from(spec))
        except ProviderError as error:
            print(f"lab provision: {error.code}: {error}", file=sys.stderr)
            return 1
        print(json.dumps(dump(result), indent=2))
        return 0

    return asyncio.run(_with_runner(go))


def _lab_destroy(args: argparse.Namespace) -> int:
    async def go(runner: Any, _callback: Any) -> int:
        destroyed = await runner.destroy_session(args.session)
        print(f"lab destroy: {args.session} {'destroyed' if destroyed else 'nothing to destroy'}")
        return 0

    return asyncio.run(_with_runner(go))


def _lab_ls(_args: argparse.Namespace) -> int:
    async def go(runner: Any, _callback: Any) -> int:
        rows = await runner.local_sessions()
        if not rows:
            print("no labs on this host")
        for provider, session_id, handle, nodes, ttl_at in rows:
            node_list = ",".join(nodes) or "-"
            print(f"{session_id}  {provider.id}  {handle}  nodes={node_list}  ttl={ttl_at or '-'}")
        return 0

    return asyncio.run(_with_runner(go))


def _lab_exec(args: argparse.Namespace) -> int:
    from hivemind_worker.providers.base import ProviderError

    command = [arg for arg in args.argv if arg != "--"]
    if not command:
        print("lab exec: give a command after --", file=sys.stderr)
        return 1

    async def go(runner: Any, _callback: Any) -> int:
        provider = await runner.provider_for_session(args.session)
        if provider is None:
            print(f"lab exec: {args.session} is not on this host", file=sys.stderr)
            return 1
        try:
            result = await provider.exec(args.session, args.node, command, args.timeout)
        except ProviderError as error:
            print(f"lab exec: {error.code}: {error}", file=sys.stderr)
            return 1
        sys.stdout.write(result.stdout)
        sys.stderr.write(result.stderr)
        return result.exit_code

    return asyncio.run(_with_runner(go))


def _agent_run(_args: argparse.Namespace) -> int:
    from hivemind_worker.agent.main import main as agent_main

    return agent_main()


def _agent_reconcile(_args: argparse.Namespace) -> int:
    from hivemind_worker.agent.reconcile import Reconciler
    from hivemind_worker.config import load_config

    config = load_config()

    async def go(runner: Any, callback: Any) -> int:
        swept = await Reconciler(config.worker_id, runner, callback).run()
        print(json.dumps(swept))
        return 0

    return asyncio.run(_with_runner(go))


def _agent_heartbeat(_args: argparse.Namespace) -> int:
    from hivemind_worker.agent.server import Agent
    from hivemind_worker.config import load_config

    config = load_config()

    async def go(runner: Any, callback: Any) -> int:
        message = await Agent(config, runner, callback).heartbeat_message()
        print(json.dumps(dump(message), indent=2))
        return 0

    return asyncio.run(_with_runner(go))


HANDLERS = {
    ("lab", "provision"): _lab_provision,
    ("lab", "destroy"): _lab_destroy,
    ("lab", "ls"): _lab_ls,
    ("lab", "exec"): _lab_exec,
    ("topology", "validate"): _topology_validate,
    ("topology", "render"): _topology_render,
    ("agent", "run"): _agent_run,
    ("agent", "reconcile"): _agent_reconcile,
    ("agent", "heartbeat"): _agent_heartbeat,
}


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
    handler = HANDLERS.get((group, command))
    if handler is not None:
        return handler(args)
    stage = implementing_stage(group, command)
    print(
        f"hivemind-worker {group} {command}: not implemented until Stage {stage}",
        file=sys.stderr,
    )
    return NOT_IMPLEMENTED_EXIT


if __name__ == "__main__":
    sys.exit(main())
