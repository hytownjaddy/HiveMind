"""Compose the agent from the environment and run it (systemd ExecStart)."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path
from typing import cast

import aiohttp
from aiohttp import web

from hivemind_worker.agent.callback import Callback, NullCallback, SessionWorkerCallback
from hivemind_worker.agent.jobs import JobRunner
from hivemind_worker.agent.server import Agent, build_app
from hivemind_worker.config import WorkerConfig, load_config
from hivemind_worker.providers.base import Provider
from hivemind_worker.providers.container import ContainerProvider
from hivemind_worker.providers.containerlab import CommandRunner, ContainerlabProvider
from hivemind_worker.providers.docker_runtime import DockerRuntime

log = logging.getLogger(__name__)


def disk_quotas_supported(info: dict[str, object], mounts: str) -> bool:
    """overlay2 on xfs mounted with project quotas is what `storage-opt size` needs."""
    if info.get("Driver") != "overlay2":
        return False
    root = str(info.get("DockerRootDir", "/var/lib/docker"))
    backing = ""
    driver_status = info.get("DriverStatus")
    entries: list[object] = (
        list(cast(list[object], driver_status)) if isinstance(driver_status, list) else []
    )
    for status in entries:
        pair = cast(list[object], status) if isinstance(status, list) else []
        if len(pair) == 2 and pair[0] == "Backing Filesystem":
            backing = str(pair[1]).lower()
    if backing != "xfs":
        return False
    best = ""
    for line in mounts.splitlines():
        parts = line.split()
        if len(parts) >= 4 and root.startswith(parts[1]) and len(parts[1]) > len(best):
            best = parts[1]
            options = parts[3].split(",")
            if "prjquota" in options or "pquota" in options:
                return True
            if parts[1] == root:
                return False
    return False


def build_providers(config: WorkerConfig, runtime: DockerRuntime | None = None) -> list[Provider]:
    runtime = runtime or DockerRuntime()
    quotas = False
    try:
        info: dict[str, object] = runtime.client.info()
        quotas = disk_quotas_supported(info, Path("/proc/mounts").read_text(encoding="utf-8"))
    except Exception:
        quotas = False
    log.info("per-lab disk quotas %s", "enabled (xfs prjquota)" if quotas else "unavailable")
    providers: list[Provider] = [ContainerProvider(runtime, disk_quota_supported=quotas)]
    if CommandRunner.available("containerlab"):
        providers.append(ContainerlabProvider(runtime, config.state_dir))
    else:
        log.warning("containerlab not found; only container.linux is available")
    return providers


async def serve(config: WorkerConfig) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    async with aiohttp.ClientSession() as http:
        callback: Callback = (
            SessionWorkerCallback(config, http) if config.callback_enabled else NullCallback()
        )
        runner = JobRunner(build_providers(config), callback)
        agent = Agent(config, runner, callback)
        app = build_app(agent)
        runner_app = web.AppRunner(app)
        await runner_app.setup()
        site = web.TCPSite(runner_app, config.listen_host, config.listen_port)
        await site.start()
        log.info(
            "hivemind lab agent %s listening on %s:%s (%s)",
            config.worker_id,
            config.listen_host,
            config.listen_port,
            "insecure" if config.insecure else "access-verified",
        )
        try:
            await asyncio.Event().wait()
        finally:
            await runner_app.cleanup()


def main() -> int:
    asyncio.run(serve(load_config()))
    return 0
