"""In-memory provider and PTY for agent tests (no Docker)."""

from __future__ import annotations

from collections.abc import Awaitable, Callable

from hivemind_worker.contracts import exec_result, lab_spec, lab_status, provision_result
from hivemind_worker.providers.base import LocalSession, ProviderError


class FakePty:
    def __init__(self) -> None:
        self.written: list[bytes] = []
        self.sizes: list[tuple[int, int]] = []
        self._scrollback = b"$ "
        self._exit: int | None = None
        self.closed = False
        self._output: list[Callable[[bytes], Awaitable[None]]] = []
        self._exit_cbs: list[Callable[[int | None], Awaitable[None]]] = []

    async def write(self, data: bytes) -> None:
        self.written.append(data)
        self._scrollback += data
        for callback in list(self._output):
            await callback(b"echo:" + data)

    async def resize(self, cols: int, rows: int) -> None:
        self.sizes.append((cols, rows))

    async def close(self) -> None:
        self.closed = True

    @property
    def scrollback(self) -> bytes:
        return self._scrollback

    @property
    def exit_code(self) -> int | None:
        return self._exit

    def on_output(self, callback: Callable[[bytes], Awaitable[None]]) -> None:
        self._output.append(callback)

    def on_exit(self, callback: Callable[[int | None], Awaitable[None]]) -> None:
        self._exit_cbs.append(callback)

    def detach(self, output: object, exit_cb: object) -> None:
        self._output = [cb for cb in self._output if cb is not output]
        self._exit_cbs = [cb for cb in self._exit_cbs if cb is not exit_cb]

    async def exit(self, code: int) -> None:
        self._exit = code
        for callback in list(self._exit_cbs):
            await callback(code)


class FakeProvider:
    def __init__(self, provider_id: str = "container.linux", fail_provision: bool = False) -> None:
        self.id = provider_id
        self.fail_provision = fail_provision
        self.sessions: dict[str, LocalSession] = {}
        self.calls: list[str] = []
        self.ptys: dict[tuple[str, str], FakePty] = {}

    async def provision(
        self, session_id: str, spec: lab_spec.LabSpec, seed: int, ttl_at: str
    ) -> provision_result.ProvisionResult:
        self.calls.append(f"provision {session_id}")
        if self.fail_provision:
            raise ProviderError("containerlab_deploy_failed", "boom", retryable=True)
        nodes = [node.name for node in spec.nodes]
        self.sessions[session_id] = LocalSession(session_id, f"fake-{session_id}", nodes, ttl_at)
        return provision_result.ProvisionResult(
            lab_session_id=session_id,
            provider_id=self.id,
            status=lab_status.LabStatus.baseline_check,
            handle=f"fake-{session_id}",
            nodes=[
                provision_result.Node(name=n, address=f"10.250.0.{i + 2}")
                for i, n in enumerate(nodes)
            ],
        )

    async def exec(
        self, session_id: str, node: str, command: list[str], timeout_seconds: int
    ) -> exec_result.ExecResult:
        self.calls.append(f"exec {session_id} {node} {' '.join(command)}")
        if session_id not in self.sessions:
            raise ProviderError("unknown_session", session_id)
        return exec_result.ExecResult(
            exit_code=0 if command != ["false"] else 1,
            stdout=" ".join(command),
            stderr="",
            duration_ms=1,
            timed_out=False,
        )

    async def open_pty(self, session_id: str, node: str, cols: int, rows: int) -> FakePty:
        if session_id not in self.sessions or node not in self.sessions[session_id].nodes:
            raise ProviderError("unknown_node", f"{session_id} {node}")
        pty = self.ptys.setdefault((session_id, node), FakePty())
        pty.sizes.append((cols, rows))
        return pty

    async def destroy(self, session_id: str) -> bool:
        self.calls.append(f"destroy {session_id}")
        return self.sessions.pop(session_id, None) is not None

    async def list_sessions(self) -> list[LocalSession]:
        return list(self.sessions.values())

    async def runtime_versions(self) -> dict[str, str]:
        return {"fake": "1"}
