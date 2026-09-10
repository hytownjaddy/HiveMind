"""Compose the agent from the environment and run it (systemd ExecStart)."""

from __future__ import annotations

import asyncio
import logging

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


def build_providers(config: WorkerConfig, runtime: DockerRuntime | None = None) -> list[Provider]:
    runtime = runtime or DockerRuntime()
    providers: list[Provider] = [ContainerProvider(runtime)]
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
