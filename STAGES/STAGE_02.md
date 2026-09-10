# Stage 02 — Lab runtime: execution classes, providers, and the Linux worker

## Purpose

Implement lab execution under the capability-based provider model (D-035): evaluate
Cloudflare Sandbox (Class A) for coding and single-node Linux exercises, build the Python
lab worker on the dedicated Ubuntu x86-64 host for privileged networking (Class B:
containerlab + FRRouting), benchmark Class C, and evolve the `LabSession` Durable Object
into the provider-selecting authority with PTY relay, recordings, deadlines, and cleanup.
Prove everything headless from the CLIs.

## User-visible outcome

`hivemind lab up linux.basic --seed 1` provisions a single-node Linux lab on the provider
Stage 2 selects for Class C and drops Jacob into a terminal in his shell; `hivemind lab up
bgp.dual_spine --seed 7` brings up a multi-node FRR topology on the Ubuntu worker with
per-node terminals; `hivemind lab down` removes everything; `docker ps` and `containerlab
inspect` on the host show nothing left. A written benchmark records the Class C decision.

## In scope

- `LabSession` object: provider selection by declared capabilities; lifecycle executor for
  RFP §86 with idempotent step reporting and the alarm-fed deadline queue (idle expiry, hard
  TTL, cleanup); session WebSocket; PTY relay to providers; recording writer to R2 with the
  D-019 redaction filter; leases; orphan reconciliation.
- Class A: Sandbox SDK provider (`shell.linux`, `python` at minimum): create, exec, PTY,
  file sync, snapshot/reset semantics, teardown; cost and latency measurements.
- Class B: `services/lab-worker` Python agent (systemd) on Ubuntu: registration/heartbeat
  with the session Worker over Tunnel with a service token, job protocol (generated
  Pydantic), providers `container.linux` and `network.containerlab` (topology rendering
  from archetype + variation, FRR images, management network, node exec), PTY per node,
  snapshots, safety (per-session networks, cgroup limits, no host socket, default-deny
  egress with allowlist, orphan sweeper, disk quota), worker CLI (`lab provision|destroy`,
  `topology validate`).
- Class C benchmark: single-node Linux on Sandbox vs worker across startup latency,
  fidelity, cost, isolation, filesystem, network capabilities, terminal streaming,
  snapshot/reset, operational complexity; decision recorded in `DECISIONS.md`.
- Host provisioning: idempotent script for a fresh Ubuntu host (Docker, containerlab, FRR
  images pinned by digest, agent, Tunnel connector); host holds no data.
- `hivemind lab up|down|ls|attach|logs` in the TypeScript CLI invoking the worker protocol
  through the session Worker.
- Topology archetypes: `linux.single`, `linux.pair`, `bgp.dual_spine`,
  `bgp.route_reflector`.

## Explicitly out of scope

- Fault modules, graders, seeded variation beyond topology parameters (Stage 03).
- Browser workspace UI (Stage 04); only the WebSocket and relay endpoints exist.
- Coding-specific runtime features (tests, Monaco) (Stage 07); the Sandbox provider here
  only proves `shell.linux`/`python` execution and PTY.
- Kubernetes, microVMs, multi-worker scheduling (Stage 10 / later).

## Prerequisites / dependency stages

Stage 01: `LabProvider` interface, capability vocabulary, `LabSpec`, worker protocol
contracts with generated Pydantic, `lab_sessions` index, Access service tokens, CLI.

## UI specifications

Implement these companion specifications (authority: `DECISIONS.md` → `docs/ui/UI-SYSTEM.md` → companion → this stage → mockup image):

- `docs/mockups/18-infrastructure-console.md`

## Architecture decisions already locked

D-001, D-005, D-006, D-012 (Linux then BGP within this stage), D-019, D-020, D-030, D-031,
D-032, D-034, D-035, D-036, D-038.

## Files/modules owned by this stage

`apps/session-worker/**` (refactor), `packages/core/src/labs/**` (session services,
provider registry), `packages/core/src/providers/sandbox/**`, `services/lab-worker/**`,
`tools/host/**`, `content/topologies/**`, `docs/benchmarks/class-c.md`,
`LAB_AUTHORING.md` TBD(2).

## Interfaces/contracts consumed

`LabProvider`, `LabSpec`, `Capability`, `ProblemSpec.topology`, worker protocol (01),
Access service tokens, R2 client.

## Interfaces/contracts created

- Provider registry and selection algorithm (capabilities → provider).
- Worker protocol v1 wire behaviour: job claim/ack, step reports, event stream, PTY frames,
  health, reconciliation.
- Topology archetype format and renderer contract.
- Recording format (asciicast-compatible) and redaction filter.
- `hivemind lab` CLI and the Python worker CLI.

## Data/schema changes

D1 migration `0003`: `lab_workers`, `lab_sessions` columns (provider class, worker id,
topology instance, node list, recording refs), `lab_session_events`.

## Acceptance criteria

1. Fresh Ubuntu host → `tools/host/provision.sh` → worker registered and healthy within
   15 min; Tunnel and service token in place; no public ports.
2. `linux.basic` reaches `ready` in under 10 s on the chosen Class C provider;
   `bgp.dual_spine` (4 nodes) in under 60 s on the worker.
3. Terminals: echo, resize, reconnect after a network drop resumes the same PTY; recordings
   in R2 with secrets redacted (fixture with a fake token).
4. Capability selection: a spec declaring `routing.frr` never lands on Sandbox; a spec
   declaring only `shell.linux` lands on the Class C choice; unsatisfiable specs fail
   with a clear error.
5. Cleanup: `hivemind lab down` and idle expiry leave no containers, networks, sandboxes,
   or files; 20 up/down cycles per class show no leak.
6. Host safety: from inside a Class B lab, no reach to the host Docker socket, the Worker,
   or the internet except allowlisted destinations; fork bomb and memory hog contained.
7. Killing the worker mid-session and restarting reconciles sessions with the objects and
   sweeps orphans; object alarm processing is idempotent under replay.
8. Class C benchmark document written with measurements and a recorded decision.

## Automated test requirements

workerd tests for the object (lifecycle, deadlines, selection, relay); unit tests for
renderer, redaction, protocol; Sandbox provider integration tests; Linux CI job with
Docker for the container provider and a nightly containerlab job for BGP; contract tests
against generated Pydantic.

## Manual QA requirements

Jacob runs both labs from the CLI, tries to break the host from inside a lab, reviews a
recording for redaction, confirms cleanup, and reads the benchmark.

## Security constraints

As listed under In scope (safety) plus: Sandbox instances per session with no shared
filesystem; provider credentials only in Worker secrets; learner never controls host paths;
images pinned by digest.

## Performance expectations

Acceptance 2; PTY round trip under 100 ms same-continent; recording upload does not block
teardown; Sandbox idle cost bounded by TTL.

## Migration requirements

D1 `0003` with down script; host provisioning idempotent.

## Rollback requirements

Worker releases roll back by redeploying the previous image; the session Worker rolls back
independently; in-flight sessions become `failed` with reason.

## Known risks

- containerlab/FRR behaviour on the rented host's kernel; validate early.
- Sandbox capabilities or pricing changing during the stage; the benchmark is dated.
- PTY relay through the object and Tunnel; test reconnect under packet loss.

## Forbidden shortcuts

Running labs on macOS; giving labs the host Docker socket; storing recordings unredacted;
hard-coding BGP behaviour into the generic provider; skipping the Class C benchmark and
choosing by preference.

## Definition of done

- [x] Acceptance 1–8; CI green including the Linux job. (Acceptance 1 and the host halves
      of 2, 5, 6, 7 are demonstrated on the GitHub Ubuntu runner and wait for the rented
      host and Jacob's manual QA; the Sandbox half of the benchmark waits for Workers
      Paid; see "Closing notes".)
- [x] `LAB_AUTHORING.md` TBD(2) filled; `ARCHITECTURE.md` execution-class table updated;
      Class C decision in `DECISIONS.md` (D-048).
- [x] Milestone commit `feat(stage-02): lab runtime and providers` and tag `stage-02`.

## Closing notes (2026-09-09)

What each acceptance criterion rests on, and what a future context must not guess:

1. **Host.** No Ubuntu host was rented during the stage. `tools/host/provision.sh` and
   `docs/runbooks/lab-host.md` are complete; the script's `--ci` path runs on every nightly
   containerlab job. "Registered and healthy within 15 min, Tunnel and service token in
   place, no public ports" is checked by the script itself (`--check`) and remains Jacob's
   manual QA on the real host.
2. **Ready times.** `linux.single` reaches `ready` in 0.14 s on the Docker provider
   (Docker Desktop, arm64) and in 1.3 s on the local Sandbox; the Linux CI job asserts
   under 10 s; the nightly containerlab job asserts `bgp.dual_spine` under 60 s on the
   GitHub runner. The rented host is expected to be faster than the runner.
3. **Terminals.** Echo, resize (`stty size`), and reconnect to the same PTY are tested
   through the LabSession object with the loopback agent (workerd), against Docker
   (`test_docker_integration.py`), and against the Sandbox by hand (`bench:class-c`).
   Recordings land in R2 with the token fixture redacted (`lab-session.test.ts`).
4. **Selection.** `routing.frr` never lands on the Sandbox, `shell.linux` lands on the
   Class C choice, unsatisfiable specs fail with the missing capabilities named
   (`labs.test.ts`, gateway tests).
5. **Cleanup.** 20 up/down cycles on Docker in CI leave no containers or networks; the
   containerlab job checks containers, lab directories, and iptables rules; idle expiry
   and hard TTL are deadlines in the object. `hivemind lab down --all` waits for `destroyed`.
6. **Host safety.** Internal networks (or DOCKER-USER drops) block egress, no Docker
   socket is mounted, the fork bomb hits the pid limit and the memory hog the cgroup, both
   proven on Docker in CI. Reaching the Worker from a lab is blocked by the same egress
   rule; reaching the host is blocked by the INPUT drop (containerlab labs) or the
   internal network (Docker labs).
7. **Reconciliation.** The agent reports local sessions on start and every 60 s; the
   gateway fails sessions the worker no longer has and answers with the expected set; the
   agent destroys orphans and TTL-expired labs. Alarm replay is idempotent
   (`expire?kind=job_timeout` fired twice yields one failure event).
8. **Benchmark.** `docs/benchmarks/class-c.md`; decision D-048: lab worker first, Sandbox
   as fallback and the Class A home.

Deviations and proposals recorded in `DECISIONS.md`: D-048 (Class C), D-049
(`lab:operate` service scope for the CLI), D-050 (archetype format and generator
placement), D-051 (recording format and redaction point), D-052 (loopback agent as the
worker test double). The Cloudflare account is on Workers Free, so the Sandbox container
cannot be deployed; production runs without it (`wrangler.jsonc`) and `wrangler.sandbox.jsonc`
plus `tools/deploy.sh session production --sandbox` are ready for the upgrade.
`linux.basic` from the user-visible outcome is an alias of `linux.single`. Queues for
provisioning jobs were not added (jobs are pushed directly and guarded by deadlines).
Disk quotas need overlay2 on xfs with `pquota` on the host; until then the provider uses
a tmpfs at `/tmp` plus the hard TTL.

Left for Jacob: rent the host and run the runbook; upgrade to Workers Paid and deploy
`--sandbox`; the manual QA list above; grant the worker's service token `worker:callback`
and the CLI token `lab:operate` (the latter is done in production).
