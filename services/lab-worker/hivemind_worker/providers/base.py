"""Provider protocol shared by the Docker and containerlab providers."""

from __future__ import annotations

from collections.abc import Awaitable, Callable, Iterable
from dataclasses import dataclass, field
from typing import Protocol

from hivemind_worker.contracts import exec_result, lab_spec, provision_result

CONTAINERLAB_CAPABILITIES = frozenset(
    {
        "network.namespace",
        "network.veth",
        "network.bridge",
        "network.containerlab",
        "routing.frr",
        "network.automation",
    }
)


class ProviderError(RuntimeError):
    def __init__(self, code: str, message: str, retryable: bool = False) -> None:
        super().__init__(message)
        self.code = code
        self.retryable = retryable


def _no_nodes() -> list[str]:
    return []


@dataclass(slots=True)
class LocalSession:
    """What the provider can see on the host for one session (for reconciliation)."""

    lab_session_id: str
    handle: str
    nodes: list[str] = field(default_factory=_no_nodes)
    ttl_at: str | None = None


class Pty(Protocol):
    """A live pseudo-terminal on a node. Bytes in, bytes out, resize, close."""

    async def write(self, data: bytes) -> None: ...

    async def resize(self, cols: int, rows: int) -> None: ...

    async def close(self) -> None: ...

    @property
    def scrollback(self) -> bytes: ...

    @property
    def exit_code(self) -> int | None: ...

    def on_output(self, callback: Callable[[bytes], Awaitable[None]]) -> None: ...

    def on_exit(self, callback: Callable[[int | None], Awaitable[None]]) -> None: ...


class Provider(Protocol):
    id: str

    async def provision(
        self, session_id: str, spec: lab_spec.LabSpec, seed: int, ttl_at: str
    ) -> provision_result.ProvisionResult: ...

    async def exec(
        self, session_id: str, node: str, command: list[str], timeout_seconds: int
    ) -> exec_result.ExecResult: ...

    async def open_pty(self, session_id: str, node: str, cols: int, rows: int) -> Pty: ...

    async def destroy(self, session_id: str) -> bool: ...

    async def list_sessions(self) -> list[LocalSession]: ...

    async def runtime_versions(self) -> dict[str, str]: ...


def provider_for_spec(spec: lab_spec.LabSpec, providers: Iterable[Provider]) -> Provider:
    """containerlab for anything with links or Class B capabilities; Docker otherwise."""
    wants_clab = bool(spec.links) or any(
        capability.root in CONTAINERLAB_CAPABILITIES for capability in spec.requires
    )
    wanted = "network.containerlab" if wants_clab else "container.linux"
    for provider in providers:
        if provider.id == wanted:
            return provider
    raise ProviderError("provider_unavailable", f"provider {wanted} is not configured")
