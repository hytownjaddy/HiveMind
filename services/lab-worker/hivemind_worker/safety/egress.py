"""Default-deny egress with an allowlist, as iptables rules on the host.

Labs live on a per-session Docker network. Three things must never be
reachable from inside (Stage 02 acceptance 6): the host's services (Docker
socket is never mounted; the agent listens on loopback, and this drops the
bridge → host path anyway), the session Worker and the internet (dropped in
DOCKER-USER unless allowlisted), and other sessions' networks (Docker isolates
bridges; the DROP below covers cross-subnet forwarding too).

Rules are idempotent: every rule carries a comment with the session id so
`rules_for` and `cleanup_for` produce exact inverses and the sweeper can remove
leftovers by grepping the comment.
"""

from __future__ import annotations

import ipaddress
import shlex
from collections.abc import Sequence
from dataclasses import dataclass

CHAIN = "DOCKER-USER"
COMMENT_PREFIX = "hivemind:"


@dataclass(frozen=True, slots=True)
class Rule:
    table_chain: str
    args: tuple[str, ...]

    def add(self) -> list[str]:
        return ["iptables", "-w", "5", "-I", self.table_chain, "1", *self.args]

    def delete(self) -> list[str]:
        return ["iptables", "-w", "5", "-D", self.table_chain, *self.args]

    def check(self) -> list[str]:
        return ["iptables", "-w", "5", "-C", self.table_chain, *self.args]

    def shell(self) -> str:
        return shlex.join(self.add())


def _comment(session_id: str) -> tuple[str, ...]:
    return ("-m", "comment", "--comment", f"{COMMENT_PREFIX}{session_id}")


def rules_for(
    session_id: str, subnet: ipaddress.IPv4Network, allowlist: Sequence[str]
) -> list[Rule]:
    """Ordered so that inserting each at position 1 leaves allows above the drop."""
    net = str(subnet)
    rules: list[Rule] = [
        # Anything leaving the lab subnet for another destination is dropped ...
        Rule(CHAIN, ("-s", net, "!", "-d", net, "-j", "DROP", *_comment(session_id))),
        # ... and the lab may not talk to the host itself (agent, docker, sshd).
        Rule("INPUT", ("-s", net, "-j", "DROP", *_comment(session_id))),
    ]
    # Allow rules are inserted after (so they sit above) the drops.
    for destination in allowlist:
        target = ipaddress.ip_network(destination, strict=False)
        rules.append(
            Rule(
                CHAIN,
                ("-s", net, "-d", str(target), "-j", "ACCEPT", *_comment(session_id)),
            )
        )
    return rules


def cleanup_for(rules: Sequence[Rule]) -> list[list[str]]:
    return [rule.delete() for rule in reversed(rules)]


def is_session_rule(line: str, session_id: str | None = None) -> bool:
    """True when an `iptables -S` line belongs to HiveMind (optionally one session)."""
    marker = COMMENT_PREFIX if session_id is None else f"{COMMENT_PREFIX}{session_id}"
    return f'--comment "{marker}' in line or f"--comment {marker}" in line
