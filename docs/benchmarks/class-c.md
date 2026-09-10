# Class C benchmark: single-node Linux on the lab worker vs the Cloudflare Sandbox

Dated 2026-09-09 (Stage 02, D-035, acceptance 8). Decision recorded as D-048. Re-run with
`bun run bench:class-c` whenever a provider, the Sandbox SDK, or the plan changes.

## Question

A lab that declares only `shell.linux` (one Linux node, no links, no privileged networking)
can run on either provider. Which one should `selectProvider` prefer when both are online?

## Setup

| Side    | What ran                                                                                                    | Where                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Worker  | `container.linux` (Docker, per-session internal network, cgroup/pid limits) on `hivemind/linux-lab:1.0.0`   | Docker Desktop 28.0 on an arm64 Mac (dev loop), Ubuntu x86-64 CI runner |
| Sandbox | `SandboxProvider` (`@cloudflare/sandbox` 0.12.9, `cloudflare/sandbox:0.12.9` + iproute2 etc., `basic` size) | local `wrangler dev` with the container in Docker (amd64 emulated)      |
| Object  | The `LabSession` Durable Object and gateway with the loopback agent (no provider work)                      | local `wrangler dev`                                                    |

The account is on Workers Free, and Containers need Workers Paid, so the Sandbox could
not be measured on the platform. Local `wrangler dev` runs the real SDK code path
(Sandbox Durable Object, `exec`, terminal WebSocket proxy) against a container in Docker;
the numbers below say what the path costs, not what the edge will. The rented Ubuntu host
did not exist either; the worker numbers come from Docker Desktop and the CI runner.

## Measurements

`ready` is `POST /session/labs` → summary `ready`; `pty open` is `pty_open` → `pty_ready`;
`pty rtt` is `echo <token>` typed → token echoed back; all through the session Worker.

Through the object, medians of 3 to 5 cycles:

| provider                                | ready ms | pty open ms | pty rtt ms | destroy ms |
| --------------------------------------- | -------: | ----------: | ---------: | ---------: |
| loopback agent (object overhead only)   |      118 |           2 |          3 |         18 |
| Cloudflare Sandbox (local wrangler dev) |     1331 |         125 |        144 |         61 |

Worker provider called directly (no object), Docker Desktop, medians of 5:

| step                    |  ms |
| ----------------------- | --: |
| provision (to baseline) | 136 |
| exec `true`             |  40 |
| pty rtt                 |  11 |
| destroy                 | 235 |

CI (Ubuntu x86-64 runner, real Docker): `test_docker_integration.py` asserts `ready < 10 s`
and passes with 20 up/down cycles and no leftovers; the nightly containerlab job asserts
`bgp.dual_spine` (four FRR routers) `< 60 s`.

Adding the object overhead to the direct worker numbers gives an expected ~0.3 s to
`ready` for a Class C lab on the worker against ~1.3 s on the Sandbox; both meet
acceptance 2 (10 s) by a wide margin. PTY round trip is under 100 ms on both once the
Tunnel hop (typically 20 to 60 ms same-continent) is added to the worker figure.

## Comparison

| Dimension              | Lab worker                                                                                                | Cloudflare Sandbox                                                                                      |
| ---------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Startup latency        | ~0.3 s warm (image local); the same for every lab                                                         | ~1.3 s locally; on the platform a cold container start is expected in seconds, warm in less             |
| Fidelity               | Full Ubuntu 24.04 userland, `CAP_NET_ADMIN`/`NET_RAW`, real `eth` interfaces, same image as Class B nodes | Ubuntu 22.04 with the sandbox agent; rootless, no `NET_ADMIN`; `ip route add` and `iptables` fail       |
| Cost                   | Host rental (D-005, ~$50–100/month) regardless of use                                                     | Included allotment on Workers Paid, then per vCPU-second and GiB-second; sleeping sandboxes still count |
| Isolation              | Per-session network, cgroups, pid limit, capability drop; protects the host, not strangers                | Per-sandbox container on Cloudflare's isolation; better against hostile users                           |
| Filesystem             | Container overlay; disk quota when the host has `pquota`; tmpfs `/tmp`                                    | Container disk by instance type (4 GB on `basic`)                                                       |
| Network capabilities   | veth, bridges, containerlab links, FRR, egress allowlist                                                  | Outbound only, no interface manipulation                                                                |
| Terminal streaming     | docker exec TTY → agent → Tunnel → object → client; scrollback replay on reconnect                        | SDK PTY WebSocket → object → client; scrollback replay on reconnect                                     |
| Snapshot / reset       | Destroy and re-provision (0.3 s); image-level snapshots not needed                                        | `destroy()` and recreate; SDK backups exist but are not used                                            |
| Operational complexity | A host to provision, patch, and reconcile (script + runbook exist); Tunnel and Access app                 | None beyond the Worker; needs Workers Paid and a container image build on deploy                        |
| Failure modes          | Host down → Class B and C unavailable unless the Sandbox takes Class C                                    | Plan or SDK changes; container cold starts                                                              |

## Decision (D-048)

`CLASS_C_PREFERENCE = ["lab_worker", "sandbox"]`: a `shell.linux`-only spec lands on a
registered, online lab worker; when none is online it lands on the Sandbox. The decisive
dimensions are fidelity and cost: the first track's Class C exercises are routing-table
work (D-042) that needs `NET_ADMIN`, and the host is paid for whether or not Class C
uses it. The Sandbox stays the Class A home (Stage 07) and the fallback that keeps
single-node labs available while the host is being rebuilt.

## Re-run

```bash
# Sandbox path (local): bun --cwd apps/session-worker dev:sandbox, then
HIVEMIND_API_URL=http://localhost:3000 HIVEMIND_SESSION_URL=http://localhost:8787 bun run bench:class-c 5
# Worker path: the same command against a deployment whose session Worker sees a worker heartbeat
# (production with the host registered), e.g. HIVEMIND_API_URL=https://hivemind.jryans.dev
```

Revisit when Workers Paid is enabled (platform Sandbox numbers), when a second worker or
the coding runtime (Stage 07) changes the cost picture, or when the Sandbox gains network
capabilities.
