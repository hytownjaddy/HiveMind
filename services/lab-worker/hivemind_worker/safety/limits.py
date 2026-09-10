"""Container resource limits (RFP §85: CPU/memory limits, disk quotas, no host socket).

A fork bomb hits `pids_limit`; a memory hog hits `mem_limit` with swap pinned
to the same value so it cannot spill; CPU is a share of the host, never all of
it. Disk quotas need overlay2 on xfs with pquota (`storage-opt size`); when the
host's storage driver cannot enforce them the provider logs a warning and
relies on the tmpfs bound at /tmp plus the session TTL.
"""

from __future__ import annotations

from dataclasses import dataclass

from hivemind_worker.contracts import lab_spec

PIDS_LIMIT = 512
TMPFS_SIZE_MB = 256
DROPPED_CAPABILITIES = ("ALL",)
GRANTED_CAPABILITIES = ("CHOWN", "DAC_OVERRIDE", "FOWNER", "SETGID", "SETUID", "KILL")
NET_CAPABILITIES = ("NET_ADMIN", "NET_RAW", "NET_BIND_SERVICE")


@dataclass(frozen=True, slots=True)
class ContainerLimits:
    nano_cpus: int
    mem_limit: str
    memswap_limit: str
    pids_limit: int
    tmpfs: dict[str, str]
    cap_drop: tuple[str, ...]
    cap_add: tuple[str, ...]
    security_opt: tuple[str, ...]
    storage_opt: dict[str, str] | None

    def host_config_kwargs(self) -> dict[str, object]:
        """Keyword arguments for docker-py `containers.run`."""
        kwargs: dict[str, object] = {
            "nano_cpus": self.nano_cpus,
            "mem_limit": self.mem_limit,
            "memswap_limit": self.memswap_limit,
            "pids_limit": self.pids_limit,
            "tmpfs": dict(self.tmpfs),
            "cap_drop": list(self.cap_drop),
            "cap_add": list(self.cap_add),
            "security_opt": list(self.security_opt),
        }
        if self.storage_opt is not None:
            kwargs["storage_opt"] = dict(self.storage_opt)
        return kwargs


def limits_for(
    resources: lab_spec.Resources,
    node_count: int = 1,
    *,
    network_admin: bool = True,
    disk_quota_supported: bool = False,
) -> ContainerLimits:
    count = max(1, node_count)
    millicores = max(50, resources.cpu_millicores // count)
    memory_mb = max(64, resources.memory_mb // count)
    disk_mb = max(256, resources.disk_mb // count)
    return ContainerLimits(
        nano_cpus=millicores * 1_000_000,
        mem_limit=f"{memory_mb}m",
        memswap_limit=f"{memory_mb}m",
        pids_limit=PIDS_LIMIT,
        tmpfs={"/tmp": f"size={min(TMPFS_SIZE_MB, disk_mb)}m"},
        cap_drop=DROPPED_CAPABILITIES,
        cap_add=GRANTED_CAPABILITIES + (NET_CAPABILITIES if network_admin else ()),
        security_opt=("no-new-privileges:true",),
        storage_opt={"size": f"{disk_mb}M"} if disk_quota_supported else None,
    )
