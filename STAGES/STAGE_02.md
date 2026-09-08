# Stage 02 — Lab worker runtime

## Purpose

Build the Python lab worker that runs on the dedicated Ubuntu x86-64 host and implements the
`LabProvider` interface for `container.linux` (Docker) and `network.containerlab`
(containerlab + FRRouting): provisioning, lifecycle steps, PTY streaming, snapshots,
grading execution hooks, and cleanup. Connect it to the API through a job queue and an
event/PTY relay. Prove it headless from the CLI.

## User-visible outcome

From the control plane, `hivemind lab up linux.basic --seed 1` provisions a lab on the
remote worker and drops Jacob into a terminal in his shell; `hivemind lab up bgp.dual_spine
--seed 7` brings up a multi-node FRR topology with per-node terminals; `hivemind lab down`
removes everything, and `docker ps`/`containerlab inspect` on the host show nothing left.

## In scope

- `services/lab-worker`: agent process (systemd), registration and heartbeat with the API,
  Redis-backed job claiming, per-session working directories, structured logs.
- Providers: `container.linux` (one or more containers on a per-session network, Ubuntu
  base image with the RFP §8 tooling), `network.containerlab` (topology rendering from
  archetype + variation, FRR images, management network, node exec).
- Lifecycle executor for RFP §86 states with idempotent step reporting; hard TTL and idle
  expiry enforced by the API's deadline queue and honoured by the worker.
- PTY: allocate per node, resize, reconnect to an existing PTY, recording to R2 with the
  D-019 redaction filter, 90-day TTL.
- Snapshots: capture node configs and relevant state for grading and replay; reset to
  baseline.
- Safety: per-session Docker networks, cgroup limits, no host socket in labs, default-deny
  egress with allowlist, orphan sweeper, disk quota per session.
- Host provisioning: idempotent script for a fresh Ubuntu host (Docker, containerlab, FRR
  images, agent), Tunnel connector, backups of nothing (worker is disposable, D-020).
- API side: `lab_sessions` state machine, job enqueue, event stream, PTY relay WebSocket,
  worker registry.
- CLI: `hivemind lab up|down|ls|attach|logs`.

## Explicitly out of scope

- Fault injection modules, graders, seeded variation logic beyond topology parameters
  (Stage 03).
- Browser workspace UI (Stage 04); only the relay endpoints exist.
- Coding runtime provider (Stage 07).
- Kubernetes, microVMs, multi-worker scheduling (Stage 10 / later).

## Prerequisites / dependency stages

Stage 01 complete: `LabProvider` interface, `ProblemSpec` topology fields, `lab_sessions`
table, API skeleton, Access, work-order format.

## Architecture decisions already locked

D-001 (accident isolation), D-005, D-006, D-007, D-012 (Linux then BGP within this stage),
D-019, D-020 (worker disposable), D-021.

## Files/modules owned by this stage

`services/lab-worker/**`, `services/api/hivemind_api/labs/**` (state machine, relay,
worker registry), `tools/host/**` (host provisioning), `content/topologies/**` (archetype
definitions: `linux.single`, `linux.pair`, `bgp.dual_spine`, `bgp.route_reflector`),
`LAB_AUTHORING.md` TBD(2) sections.

## Interfaces/contracts consumed

`LabProvider` (Stage 01), `ProblemSpec.topology`, `lab_sessions`, `learner_id`, R2 client,
Redis, Access.

## Interfaces/contracts created

- Worker protocol v1: job claim/ack, step reports, event stream, PTY frames, health.
- Topology archetype format and renderer contract (variation parameters → containerlab
  topology or compose spec).
- `hivemind lab` CLI.
- Recording format (asciicast-compatible) and redaction filter API.

## Data/schema changes

Alembic `0002`: `lab_workers`, `lab_sessions` columns for worker id, topology instance,
node list, recording refs, deadlines; `lab_session_events`.

## Acceptance criteria

1. Fresh Ubuntu host → `tools/host/provision.sh` → worker registered and healthy within 15 min.
2. `hivemind lab up linux.basic` reaches `READY` in under 10 s; `bgp.dual_spine` with 4 nodes
   in under 60 s.
3. Terminals: input echo, resize, reconnect after network drop resume the same PTY; recording
   uploaded to R2 with secrets redacted (test fixture with a fake token).
4. Fault-free pipeline steps run: baseline check passes; fault injection/check are no-op
   hooks until Stage 03 but are exercised.
5. `hivemind lab down` and idle expiry leave no containers, networks, or files; 20 up/down
   cycles show no leak.
6. Inside a lab, a container cannot reach the host Docker socket, the API, or the internet
   except allowlisted destinations; a fork bomb or memory hog is contained by limits.
7. Killing the worker mid-session and restarting it reconciles sessions from the API and
   sweeps orphans.

## Automated test requirements

Unit tests for renderer, state machine, redaction, protocol; integration tests on a Linux
CI runner with Docker (Linux provider) and containerlab (BGP provider, may be a nightly
job); contract tests against the Stage 01 interface.

## Manual QA requirements

Jacob runs both labs from the CLI, tries to break the host from inside a lab, reviews a
recording for redaction, and confirms cleanup on the host.

## Security constraints

Worker reachable only via Tunnel/private network; per-session isolation as listed; no
learner-controlled paths on the host filesystem; images pinned by digest.

## Performance expectations

As in acceptance 2; PTY round trip under 100 ms on the same continent; recording upload does
not block session teardown.

## Migration requirements

Alembic `0002` with downgrade. Host provisioning is idempotent and re-runnable.

## Rollback requirements

Worker versions are deployable independently of the API; a bad worker release is rolled
back by redeploying the previous container image; sessions in flight are destroyed and
recorded as `FAILED` with reason.

## Known risks

- containerlab/FRR behaviour on the rented host's kernel/network stack; validate early.
- Egress allowlisting breaking package installs inside labs; prebake images instead.
- PTY relay complexity through Tunnel; test reconnect under packet loss.

## Forbidden shortcuts

Running labs on macOS as a stand-in; giving labs the host Docker socket "for now"; storing
recordings unredacted; hard-coding BGP-specific behaviour into the generic provider.

## Definition of done

- [ ] Acceptance criteria 1–7 pass; CI green including Linux integration job.
- [ ] `LAB_AUTHORING.md` TBD(2) filled; `ARCHITECTURE.md` worker section updated.
- [ ] Milestone commit `feat(stage-02): lab worker runtime` and tag `stage-02`.
