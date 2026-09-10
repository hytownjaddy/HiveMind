"""Agent configuration from the environment (never from labs or work orders).

Set by the systemd unit's EnvironmentFile (tools/host/provision.sh writes it):

    HIVEMIND_WORKER_ID              ubuntu-lab-worker-1
    HIVEMIND_SESSION_URL            https://hivemind.jryans.dev  (the web Worker proxies /session/*)
    HIVEMIND_ACCESS_CLIENT_ID       Access service token for the callback path
    HIVEMIND_ACCESS_CLIENT_SECRET
    HIVEMIND_WORKER_ENDPOINT        https://lab-worker.jryans.dev  (Tunnel hostname in heartbeats)
    HIVEMIND_ACCESS_TEAM_DOMAIN     https://<team>.cloudflareaccess.com  (verifies inbound JWTs)
    HIVEMIND_WORKER_ACCESS_AUD      AUD tag of the lab-worker Access application
    HIVEMIND_WORKER_LISTEN          127.0.0.1:8790  (cloudflared connects locally; no public port)
    HIVEMIND_WORKER_STATE_DIR       /var/lib/hivemind-worker
    HIVEMIND_WORKER_INSECURE        1 to skip inbound JWT verification (local dev and CI only)
"""

from __future__ import annotations

import os
import socket
from dataclasses import dataclass
from pathlib import Path

from hivemind_worker import __version__

DEFAULT_LISTEN = "127.0.0.1:8790"
HEARTBEAT_INTERVAL_SECONDS = 15
ORPHAN_SWEEP_INTERVAL_SECONDS = 60
DEFAULT_CAPABILITIES: tuple[str, ...] = (
    "shell.linux",
    "network.namespace",
    "network.veth",
    "network.bridge",
    "network.containerlab",
    "routing.frr",
    "privilege.net_admin",
)


class ConfigError(ValueError):
    pass


@dataclass(frozen=True, slots=True)
class WorkerConfig:
    worker_id: str
    session_url: str | None
    access_client_id: str | None
    access_client_secret: str | None
    endpoint: str | None
    access_team_domain: str | None
    access_aud: str | None
    listen_host: str
    listen_port: int
    state_dir: Path
    insecure: bool
    hostname: str
    agent_version: str = __version__

    @property
    def callback_enabled(self) -> bool:
        return self.session_url is not None

    def require_callback(self) -> str:
        if self.session_url is None:
            raise ConfigError("HIVEMIND_SESSION_URL is not set")
        return self.session_url

    def service_headers(self) -> dict[str, str]:
        if self.access_client_id is None or self.access_client_secret is None:
            return {}
        return {
            "CF-Access-Client-Id": self.access_client_id,
            "CF-Access-Client-Secret": self.access_client_secret,
        }


def _optional(env: dict[str, str], key: str) -> str | None:
    value = env.get(key, "").strip()
    return value or None


def load_config(env: dict[str, str] | None = None) -> WorkerConfig:
    env = dict(os.environ) if env is None else env
    listen = env.get("HIVEMIND_WORKER_LISTEN", DEFAULT_LISTEN)
    host, _, port = listen.rpartition(":")
    if not host or not port.isdigit():
        raise ConfigError(f"HIVEMIND_WORKER_LISTEN must be host:port, got {listen!r}")
    insecure = env.get("HIVEMIND_WORKER_INSECURE", "") == "1"
    team = _optional(env, "HIVEMIND_ACCESS_TEAM_DOMAIN")
    aud = _optional(env, "HIVEMIND_WORKER_ACCESS_AUD")
    if not insecure and (team is None or aud is None):
        raise ConfigError(
            "HIVEMIND_ACCESS_TEAM_DOMAIN and HIVEMIND_WORKER_ACCESS_AUD are required "
            "unless HIVEMIND_WORKER_INSECURE=1 (local development only)"
        )
    if host not in {"127.0.0.1", "localhost", "::1"} and insecure:
        raise ConfigError("HIVEMIND_WORKER_INSECURE=1 only allows a loopback listen address")
    return WorkerConfig(
        worker_id=env.get("HIVEMIND_WORKER_ID", f"lab-worker-{socket.gethostname()}"),
        session_url=(_optional(env, "HIVEMIND_SESSION_URL") or "").rstrip("/") or None,
        access_client_id=_optional(env, "HIVEMIND_ACCESS_CLIENT_ID"),
        access_client_secret=_optional(env, "HIVEMIND_ACCESS_CLIENT_SECRET"),
        endpoint=_optional(env, "HIVEMIND_WORKER_ENDPOINT"),
        access_team_domain=team,
        access_aud=aud,
        listen_host=host,
        listen_port=int(port),
        state_dir=Path(env.get("HIVEMIND_WORKER_STATE_DIR", "/var/lib/hivemind-worker")),
        insecure=insecure,
        hostname=socket.gethostname(),
    )
