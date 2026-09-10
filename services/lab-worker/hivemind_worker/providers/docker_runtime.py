"""Thin asyncio wrapper over docker-py (blocking calls run in threads) and the
PTY bridge used by both providers.

The agent talks to the host daemon over its unix socket; labs never see that
socket (RFP §85). An exec with a TTY is a raw byte stream on a socket, which
asyncio drives directly; a bounded scrollback lets a reconnecting client
repaint without the PTY ever having died (Stage 02 acceptance 3).
"""

from __future__ import annotations

import asyncio
import contextlib
import logging
import socket
import time
from collections.abc import Awaitable, Callable
from typing import Any, cast

import docker
from docker.errors import APIError, ImageNotFound, NotFound
from docker.models.containers import Container

from hivemind_worker.contracts import exec_result
from hivemind_worker.providers.base import ProviderError

log = logging.getLogger(__name__)

SCROLLBACK_BYTES = 64 * 1024
READ_CHUNK = 32 * 1024


class DockerRuntime:
    """One client per agent; every call is offloaded so the event loop never blocks."""

    def __init__(self, client: docker.DockerClient | None = None) -> None:
        self.client = client or docker.from_env()
        self.api = self.client.api

    @staticmethod
    def available() -> bool:
        try:
            docker.from_env().ping()
        except Exception:
            return False
        return True

    async def call[T](self, fn: Callable[..., T], *args: Any, **kwargs: Any) -> T:
        return await asyncio.to_thread(fn, *args, **kwargs)

    async def version(self) -> str:
        info: dict[str, Any] = await self.call(self.client.version)
        return str(info.get("Version", "unknown"))

    async def ensure_image(self, reference: str) -> None:
        try:
            await self.call(self.client.images.get, reference)
            return
        except ImageNotFound:
            pass
        if reference.startswith("hivemind/"):
            raise ProviderError(
                "image_missing",
                f"{reference} is built on the host by tools/host/provision.sh and is missing",
            )
        if "@sha256:" not in reference:
            raise ProviderError("image_unpinned", f"{reference} is not pinned by digest")
        log.info("pulling %s", reference)
        try:
            await self.call(self.client.images.pull, reference)
        except APIError as error:
            raise ProviderError("image_pull_failed", str(error), retryable=True) from error

    async def containers_with_label(self, label: str, value: str | None = None) -> list[Container]:
        selector = label if value is None else f"{label}={value}"
        return await self.call(self.client.containers.list, all=True, filters={"label": selector})

    async def container(self, name: str) -> Container | None:
        try:
            return await self.call(self.client.containers.get, name)
        except NotFound:
            return None

    async def remove_container(self, container: Container) -> None:
        with contextlib.suppress(NotFound):
            await self.call(container.remove, force=True, v=True)

    async def remove_network(self, name: str) -> bool:
        try:
            network = await self.call(self.client.networks.get, name)
        except NotFound:
            return False
        with contextlib.suppress(NotFound):
            await self.call(network.remove)
        return True

    async def exec(
        self, container: Container, command: list[str], timeout_seconds: int
    ) -> exec_result.ExecResult:
        """Run a command with a kill-timeout enforced inside the container."""
        wrapped = ["timeout", "-s", "KILL", str(timeout_seconds), *command]
        started = time.monotonic()
        code, output = await self.call(container.exec_run, wrapped, demux=True)
        stdout, stderr = cast(tuple[bytes | None, bytes | None], output)
        duration = int((time.monotonic() - started) * 1000)
        exit_code = int(code) if code is not None else -1
        return exec_result.ExecResult(
            exit_code=exit_code,
            stdout=(stdout or b"").decode("utf-8", "replace")[:1_000_000],
            stderr=(stderr or b"").decode("utf-8", "replace")[:100_000],
            duration_ms=duration,
            timed_out=exit_code in (124, 137),
        )

    async def open_pty(
        self, container: Container, shell: str, cols: int, rows: int, env: dict[str, str]
    ) -> DockerPty:
        exec_create = cast(
            Callable[..., dict[str, Any]],
            self.api.exec_create,  # pyright: ignore[reportUnknownMemberType]
        )
        exec_id = (
            await self.call(
                exec_create,
                container.id,
                [shell],
                stdin=True,
                tty=True,
                environment={"TERM": "xterm-256color", **env},
            )
        )["Id"]
        raw = await self.call(self.api.exec_start, exec_id, socket=True, tty=True)
        sock = raw_socket(raw)
        await self.call(self.api.exec_resize, exec_id, height=rows, width=cols)
        pty = DockerPty(self, exec_id, sock)
        pty.start()
        return pty


def raw_socket(value: object) -> socket.socket:
    """docker-py hands back a SocketIO over the unix socket; asyncio wants the socket."""
    if isinstance(value, socket.socket):
        return value
    inner = getattr(value, "_sock", None)
    if isinstance(inner, socket.socket):
        return inner
    raise ProviderError("pty_socket", f"unsupported exec socket type {type(value).__name__}")


OutputCallback = Callable[[bytes], Awaitable[None]]
ExitCallback = Callable[[int | None], Awaitable[None]]


class DockerPty:
    """Bridge between an exec TTY socket and the WebSocket relay."""

    def __init__(self, runtime: DockerRuntime, exec_id: str, sock: socket.socket) -> None:
        self.runtime = runtime
        self.exec_id = exec_id
        self.sock = sock
        self.sock.setblocking(False)
        self._scrollback = bytearray()
        self._exit_code: int | None = None
        self._closed = False
        self._output: list[OutputCallback] = []
        self._exit: list[ExitCallback] = []
        self._reader: asyncio.Task[None] | None = None
        self._write_lock = asyncio.Lock()

    def start(self) -> None:
        self._reader = asyncio.create_task(self._read_loop())

    @property
    def scrollback(self) -> bytes:
        return bytes(self._scrollback)

    @property
    def exit_code(self) -> int | None:
        return self._exit_code

    @property
    def closed(self) -> bool:
        return self._closed

    def on_output(self, callback: OutputCallback) -> None:
        self._output.append(callback)

    def on_exit(self, callback: ExitCallback) -> None:
        self._exit.append(callback)

    def detach(self, output: OutputCallback | None, exit_cb: ExitCallback | None) -> None:
        self._output = [cb for cb in self._output if cb is not output]
        self._exit = [cb for cb in self._exit if cb is not exit_cb]

    async def write(self, data: bytes) -> None:
        if self._closed:
            return
        async with self._write_lock:
            loop = asyncio.get_running_loop()
            await loop.sock_sendall(self.sock, data)

    async def resize(self, cols: int, rows: int) -> None:
        if self._closed:
            return
        with contextlib.suppress(APIError):
            await self.runtime.call(
                self.runtime.api.exec_resize, self.exec_id, height=rows, width=cols
            )

    async def close(self) -> None:
        if self._closed:
            return
        self._closed = True
        if self._reader is not None:
            self._reader.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._reader
        with contextlib.suppress(OSError):
            self.sock.close()

    async def _read_loop(self) -> None:
        loop = asyncio.get_running_loop()
        try:
            while True:
                chunk = await loop.sock_recv(self.sock, READ_CHUNK)
                if not chunk:
                    break
                self._scrollback += chunk
                if len(self._scrollback) > SCROLLBACK_BYTES:
                    del self._scrollback[: len(self._scrollback) - SCROLLBACK_BYTES]
                for callback in list(self._output):
                    with contextlib.suppress(Exception):
                        await callback(chunk)
        except (OSError, asyncio.CancelledError):
            pass
        finally:
            self._closed = True
            with contextlib.suppress(Exception):
                info: dict[str, Any] = await self.runtime.call(
                    self.runtime.api.exec_inspect, self.exec_id
                )
                code = info.get("ExitCode")
                self._exit_code = int(code) if isinstance(code, int) else None
            for callback in list(self._exit):
                with contextlib.suppress(Exception):
                    await callback(self._exit_code)
