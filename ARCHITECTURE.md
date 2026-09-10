# HiveMind Architecture

Status: as built at the end of Stage 02 (2026-09-09), per `DECISIONS.md` D-030 to D-052
(which supersede the earlier FastAPI/PostgreSQL/Redis direction). Cloudflare owns the
durable/control-plane side; a disposable Ubuntu lab worker exists only for workloads
Cloudflare cannot faithfully execute. Read `DECISIONS.md` first; this document explains how
the pieces fit, not why they were chosen.

## Topology

```text
                        CLOUDFLARE

                 hivemind.jryans.dev
                           │
                    Cloudflare Access (Google IdP)
                           │
                    Next.js / Workers  (apps/web)
                           │
          ┌────────────────┼────────────────┐
          │                │                │
         D1         Durable Objects         R2
          │       (apps/session-worker)     │
   durable records    live authority    artifacts/
                                         backups
                           │
                    Lab Provider API
                           │
              ┌────────────┴────────────┐
              │                         │
      Cloudflare Sandbox          Cloudflare Tunnel
              │                         │
      coding / simple Linux             ▼
      (Class A / C)               Ubuntu Lab Worker (Class B / C)
                                         │
                                  Python Lab Agent
                                         │
                         ┌───────────────┼──────────────┐
                         │               │              │
                       Docker       containerlab       FRR
                         │               │              │
                         └────── real network labs ─────┘
```

Claude Code (Jacob's Claude Max subscription) is the external agent: it reads work orders
from `.hivemind/work-orders/` and commits content and code; the `hivemind` CLI validates and
publishes. No AI API call is required for normal operation (D-009, D-036).

## Layering (D-031)

```text
UI  →  Route Handler (thin adapter)  →  Application Service  →  Domain Logic  →  D1 / DO / R2
```

Route handlers in `apps/web` and the fetch handlers in `apps/session-worker` only parse,
authenticate, call a service in `packages/core`, and serialize. Domain logic (lifecycle
rules, mastery formulas, readiness, work-order state machines) has no knowledge of HTTP.

## Components and ownership

| Component             | Language         | Owns                                                                                                                                              | Never does                                                             |
| --------------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `apps/web`            | TypeScript       | Rendering, navigation, workspace panes (xterm, Monaco, topology), thin route handlers, work-order copy/export UI                                  | Business rules inline; calling AI unless an API executor is configured |
| `apps/session-worker` | TypeScript       | `LabSession` Durable Object: session lifecycle, leases, deadlines/alarm queue, WebSocket termination, PTY relay, provider selection by capability | Durable cross-session records (those go to D1 via `packages/core`)     |
| `packages/core`       | TypeScript       | Application services and domain logic; D1 repositories; R2 clients; algorithms (versioned); work orders; review queues; content compiler          | Framework specifics                                                    |
| `packages/schema`     | TypeScript (Zod) | Canonical contracts; JSON Schema export; Pydantic generation                                                                                      | Runtime logic                                                          |
| `packages/cli`        | TypeScript (Bun) | `hivemind` CLI: content, sources, work orders, careers, certs, validate, export, orchestration commands                                           | Lab execution                                                          |
| `services/lab-worker` | Python 3.13      | Lab agent; providers for Class B/C; fault modules; graders; reference solutions; validation runner; worker CLI                                    | Holding authoritative state; deciding mastery                          |
| `content/`            | YAML/Markdown    | Skills registry, courses, sources, careers, problem archetypes, topology archetypes, declarative parts of faults/graders                          | Code that bypasses contracts                                           |
| Cloudflare            | —                | DNS, Access, Tunnel, Workers, D1, Durable Objects, R2, Sandbox (Class A), Queues/KV as needed                                                     | Privileged networking                                                  |

Data ownership (D-030): D1 = learner, courses, skills, mastery, attempts, career targets,
certifications, role profiles, work orders, metadata. R2 = recordings, exports/backups,
PCAPs, generated artifacts, large attempt artifacts, course assets. Durable Objects =
active lab session state, lifecycle, leases, timers, connections, workspace coordination.
Git = content and work orders (compiled into D1 by the CLI/API). The lab worker holds
nothing that cannot be rebuilt.

## Execution classes and provider selection (D-035)

A lab declares required capabilities; the session Worker selects a provider that satisfies
all of them.

| Capabilities (examples)                                                                           | Class | Provider                                                                      |
| ------------------------------------------------------------------------------------------------- | ----- | ----------------------------------------------------------------------------- |
| `runtime.python`, `runtime.node`, `compiler.cpp`                                                  | A     | Cloudflare Sandbox (`wrangler.sandbox.jsonc`; needs Workers Paid)             |
| `network.namespace`, `network.veth`, `network.containerlab`, `routing.frr`, `privilege.net_admin` | B     | Ubuntu lab worker (Python agent, `container.linux` + `network.containerlab`)  |
| `shell.linux` only (single-node Linux)                                                            | C     | lab worker when one is online, else the Sandbox (D-048, `CLASS_C_PREFERENCE`) |

Sandbox Docker-in-Docker is rootless with no privileged containers or iptables, so Class B
is never moved to Class A. Selection runs in `packages/core/src/labs/selection.ts` over the
worker registry (`lab_workers`, fed by heartbeats) plus the Sandbox descriptor; an
unsatisfiable spec fails at `POST /session/labs` with the missing capabilities named.

Runtime providers live in `apps/session-worker/src/providers`: `WorkerProvider` pushes
worker-protocol jobs to the agent's Tunnel hostname and receives events on the callback
path; `SandboxProvider` drives the Sandbox SDK in-process; the loopback agent
(`gateway/loopback.ts`) emulates a worker for dev and tests (D-052).

## Core flows

**Launch a lab.** Browser or `hivemind lab up` → `POST /session/labs` on the session
Worker (through the web Worker's `/session/*` proxy; Access identity or a `lab:operate`
service token, D-049) → `LabSessionService` in `packages/core` resolves the archetype,
instantiates the `TopologyInstance` by seed (D-050), selects a provider by capability, and
allocates `HM-LAB-nnnnnn` from the D1 index → the `LabSession` object persists the
session in its SQLite, mirrors the row to D1, and drives RFP §86 with its alarm-fed
deadline queue (provision start, job timeout, idle expiry, hard TTL, destroy timeout,
cleanup) → Class B/C: `job.provision` pushed to the agent, `event.status`/`event.result`
called back; Class A/C on the Sandbox: in-process → status events stream over the session
WebSocket; per-node PTY frames relay client ↔ object ↔ provider, with the provider keeping
the PTY alive across reconnects. Terminal output is recorded per node (asciicast v2,
redacted before storage, D-051) and uploaded to R2 at teardown without blocking it.

**Submit.** `POST /api/labs/sessions/{id}/submit` → object requests `grade` from the
provider (Python grader on the worker, or the Sandbox test runner) → `GradeResult`
persisted on an immutable `attempts` row in D1 → versioned mastery update → optional AI
methodology review as an External Work Order prompt (default) or via an API executor →
destroy; recording finalized to R2 with redaction, 90-day TTL unless pinned.

**Author content.** Work order created from page context (deterministic assembly, D1 row)
→ `hivemind work pull` writes `.hivemind/work-orders/HM-WO-nnnn.md` → Claude Code executes
in the repo → `hivemind work complete` records the change report → `hivemind work validate`
checks the file and runs its validation commands (Stage 03 adds the RFP §46 pipeline for
problems) → review item in Jacob's queue → approve → `hivemind content approve` records
approval in `metadata.yaml` → `hivemind content publish` compiles `content/` (Markdown +
directives → render tree, D-044) and creates an immutable content version in D1.

**Maintenance.** Same loop in batches: `packages/core` computes what is due and emits a
batch work order; Claude Code runs it; results and change reports are imported.

## Contracts (canonical in `packages/schema`, D-032, D-046)

Learner, SkillDefinition/SkillGraph, SourceRecord/Claim, the lesson render tree
(InlineNode/BlockNode/LessonSection), Question/Lesson/Module/CourseManifest,
ContentBundle/ContentVersion, Capability, LabSpec and the `LabProvider` interface with its
request/result messages, CheckSpec/FaultSpec, GraderManifest/GraderResult,
ProblemSpec/ProblemInstance (seed, pinned versions, spec hash, §46 validation steps),
Attempt/AttemptResult/Evidence/MasteryUpdate (algorithm version recorded),
Competency/RoleProfile/CareerProfile/ReadinessSnapshot (gates, confidence), WorkOrder
(with the state machine) and ReviewItem, and the worker protocol envelope with named job,
event, and result messages. `bun run schema:export` writes `schemas/<Contract>.schema.json`
with relative `$ref`s, validated fixtures under `schemas/fixtures/`, and the append-only
`schemas/contracts.lock.json`; Pydantic models for `services/lab-worker` are generated with
`datamodel-code-generator` (D-043) and every fixture round-trips through them. Drift on
either side fails CI.

## Identity (D-033, D-045)

Google → Cloudflare Access → both Workers verify the Access JWT (`jose`, team JWKS with
rotation, application AUD) through `packages/core` → `learner_id`. The seeded learner
binds to the first validated identity; other identities get 403. Service tokens are
recognised by `common_name` and scoped per caller (`SERVICE_TOKEN_SCOPES`): `hivemind`
publishes with `content:publish`. Local development uses `ACCESS_DEV_BYPASS_EMAIL` only
when `HIVEMIND_ENV=development`. Runbook and break-glass: `docs/runbooks/access.md`.

## Security model (D-001)

- Access on the web app and every API hostname; the lab worker is reachable only through
  Tunnel with a service token; no public ports.
- Labs protect the host from accidents: per-session Docker networks, cgroup limits, no
  host Docker socket, default-deny egress with allowlist, orphan sweeper, hard TTL.
- Recordings redacted (tokens, passwords, private keys) before R2; 90-day TTL; pinning is
  explicit (D-019).
- Secrets only in Cloudflare secrets and the host secret store; never in content or work
  orders.

## Durability (D-020, D-030)

D1 Time Travel (30 days) plus the nightly export (`.github/workflows/d1-export.yml` →
`tools/backup/nightly-export.sh` → R2 `hivemind-exports/exports/d1/`) plus `hivemind export`
for a portable archive of learner history and content. `tools/backup/restore-drill.sh`
restores an export into a fresh database and checks it; `packages/core/test/restore-drill.test.ts`
reads the gold lesson back through the service layer; CI runs both on every push after
seeding a disposable database with `hivemind content publish --sql-out`. Runbook:
`docs/runbooks/recovery.md`. The lab worker is rebuilt from `tools/host/provision.sh`
(Stage 02) and holds no history.

## Environments and deployment

Top-level wrangler config is `dev`; `--env production` selects `hivemind-web` and
`hivemind-session`. Bindings are repeated per environment. Deploy order: D1 migrations →
session Worker → web Worker → lab worker. The web app stays on OpenNext (D-031). Domain:
`jryans.dev`, app at `hivemind.jryans.dev` (D-047).

## UI direction (D-037)

Engineering workstation, desktop-first. Global status bar (command palette, active target,
workspace, environment, seed, runtime versions, last check), dense panes, trees, tabs, diffs,
logs, terminals. Identifier formats and lifecycle vocabulary per D-038. Global UI rules live in
`docs/ui/UI-SYSTEM.md`; per-screen contracts in `docs/mockups/NN-name.md` (D-041).

## Lab worker (Stage 02)

`services/lab-worker` runs as a systemd unit on the Ubuntu host (`tools/host/provision.sh`,
`docs/runbooks/lab-host.md`): an aiohttp agent on loopback behind a Cloudflare Tunnel and
an Access application; Docker and containerlab do the work. Safety: per-session networks
(internal when egress is denied, DOCKER-USER rules with an allowlist otherwise), cgroup
and pid limits, capability drop except what routing exercises need, no host Docker
socket, hard-TTL labels, and an orphan sweeper reconciled with the session Worker every
60 s. The Infrastructure console (`/system/infrastructure`) shows the registry, sessions
by class, runtime pins with `update_available`, failures, and the event log.

## State after Stage 01

`apps/web` (OpenNext, canonical shell, Control Center, Courses/Course Workspace, Work
Orders, Settings, API v1 thin handlers), `apps/session-worker` (renamed from the
scaffold's realtime Worker; Access identity, learner-owned sessions, shared D1 binding),
`packages/schema`, `packages/core`, `packages/cli`, `services/lab-worker` (skeleton),
`content/` (registry plus the gold lesson), `schemas/`, `.hivemind/work-orders/`,
`docs/runbooks/`, `tools/backup/`. Removed: guest HMAC sessions, placeholder pages, the
demo labs UI, the scaffold D1 helpers. D1 migrations live in `apps/web/migrations/` (with
down scripts under `down/`) because the web Worker owns the binding; the session Worker
binds the same database.

## State after Stage 02

The session Worker runs the capability/provider model (session transport v2 in
snake_case, D-046 realigned), the Python agent and both worker providers exist with
Docker and containerlab tests in CI, `content/topologies` holds four archetypes,
`hivemind lab` and `hivemind topology` exist, D1 migration 0003 adds the worker
registry, session columns, and the event log, recordings go to R2
(`hivemind-artifacts`), and the Infrastructure console is live. Not yet real: a rented
Ubuntu host (the runbook and provisioning script are ready; acceptance 1 and the host
halves of 2, 5, 6, 7 are Jacob's manual QA), and the Sandbox on the platform (needs
Workers Paid; `wrangler.sandbox.jsonc` is ready, the provider is exercised under local
`wrangler dev`). The echo provider is gone.

## Open points

- Sandbox on the platform: enable Workers Paid, deploy with `--sandbox`, re-run the
  Class C benchmark for the edge half (D-048).
- Topology renderer (React Flow vs Cytoscape), decided with the Lab Workspace mockup.
- Queues for provisioning jobs stay out: the object pushes jobs directly and guards them
  with deadlines; revisit only when more than one worker exists.
- Mermaid rendering in lessons (source is shown verbatim until a renderer ships with the
  Lab Workspace); an asset pipeline for images.
- Disk quotas on the worker need overlay2 on xfs with `pquota`; until the host has it the
  provider relies on the tmpfs at `/tmp` and the hard TTL.
