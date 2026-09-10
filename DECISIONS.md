# HiveMind Decisions Log

Append-only. Each entry is a decision Jacob has locked or a consequence derived from one.
Change a decision by adding a new entry that supersedes the old one; never edit history.
Fresh Claude contexts must read this file before `STAGES/` work.

Format: `D-nnn` · date · status · decision · consequences.

---

## D-001 · 2026-09-08 · Locked · Single learner through at least Phase 3

Design so multi-user can be added cleanly, but build no public-user abuse handling,
billing, quotas, organizations, or hostile-user isolation in the first year unless needed.
Isolation exists to protect Jacob's infrastructure from accidental damage by lab commands,
not to defend against strangers. MicroVM-grade isolation is later work.

Consequences: no signup/teams; resource limits and network isolation per lab still
required (see D-026 security notes in `ARCHITECTURE.md`); `learner_id` everywhere anyway (D-008).

## D-002 · 2026-09-08 · Locked · Career targeting is a first-class pillar on a generic platform

Hierarchy: Career/Job Target → Required Competencies → Courses → Skills →
Labs/Challenges/Interviews → Evidence → Readiness. HiveMind must work without a career
target, but targets are a main reason it exists. Role/profile schemas are built in Stage 1;
a functional Career/Readiness Engine lands in Stage 6 once mastery data exists.

## D-003 · 2026-09-08 · Locked · Six-month definition of done

Jacob can genuinely train for and complete the Meta / network-infrastructure track with
real labs: Linux, TCP/IP, networking, BGP, IS-IS, MPLS basics, data-center networking,
network automation, relevant Python, incident response, interview preparation, career
readiness. All course/runtime/problem contracts must be generic: adding Rust later means
content plus a runtime capability, not a redesign. Depth of the first track beats breadth.

## D-004 · 2026-09-08 · Locked · About 5 hours/week of human review

AI does drafting, research organization, source comparison, and initial QA. Jacob's time
goes to accept/reject, checking key technical claims, trying labs, reviewing faults, and
judging instructional quality. Review queues are required so nothing depends on manual
authoring.

## D-005 · 2026-09-08 · Locked · Labs run on a dedicated x86-64 Ubuntu host

Not the Mac. A rented Linux server is acceptable initially, roughly $50–100/month for the
first serious lab host. Must be easy to move to a stronger server, home hardware, or
multiple workers without changing the course engine. macOS Docker is never the canonical
networking runtime.

## D-006 · 2026-09-08 · Locked · Always-on lab worker, ephemeral labs

Provision → Use → Grade → Destroy per lab; the worker stays up. No wake/sleep
orchestration or cold starts in the practice loop for V1.

## D-007 · 2026-09-08 · Locked · Hybrid architecture; do not force everything into Cloudflare

> **Partially SUPERSEDED by D-030 and D-034 (2026-09-08): the FastAPI/PostgreSQL/Redis core is dropped; Cloudflare edge usage and Python on the lab worker stand.**

Cloudflare for DNS, Access, Tunnel, frontend hosting where appropriate, caching/storage
where useful. Core: Next.js (TypeScript) → FastAPI/Python → PostgreSQL, Redis → Python lab
worker/agent → Docker, containerlab, FRRouting. Python is preferred for orchestration, AI
workflows, graders, fault modules, lab agents, the content compiler, and maintenance
workflows. TypeScript is preferred for the frontend. Do not rewrite natural Python
orchestration into TypeScript for language uniformity.

Consequences: D-026, D-027, D-028.

## D-008 · 2026-09-08 · Locked · Cloudflare Access in front; no account system yet

Model a `learner_id` from the start; seed one learner record. No signup, password reset,
teams, organizations, or public identity flows until multi-user is a real requirement.

## D-009 · 2026-09-08 · Locked · AI: $0 default API budget; Work Orders; external agent by default

Jacob's Claude Max subscription and Claude Code are the primary mechanism for course
creation, lesson authoring, curriculum review, source research, lab/problem/fault
authoring, grader review, company and job-profile research, certification refreshes,
maintenance workflows, bulk content QA, and development. HiveMind implements a first-class
**Work Order** system: for any AI-assisted authoring or maintenance operation it generates a
self-contained prompt (task, IDs, repository paths, schemas, acceptance criteria, source
requirements, validation commands, expected output, Jacob's freeform instructions) with
"Copy for Claude" and "Export Work Order"; work orders also exist as structured
YAML/Markdown under `.hivemind/work-orders/` so Claude Code can consume them directly.

APIs (Anthropic first, provider-abstracted) are optional executors for UX that genuinely
benefits from in-app inference: contextual tutoring, instant methodology feedback, live
adaptive interviews. Even those support an **External Agent** mode that produces a
context-rich prompt. Default for Jacob's installation: External Agent. Never use a
logged-in consumer session or Claude Code as an undocumented server-side API.

Supersedes the earlier "$50/month normal, $100 ceiling" answer; that ceiling now applies
only if an API executor is configured.

## D-010 · 2026-09-08 · Locked · AI-drafted, human-reviewed content from day one

Create one gold-standard lesson/module collaboratively first; it is the instructional
benchmark. Then: AI draft → technical review → instructional review → executable
verification where possible → Jacob's approval → publish.

## D-011 · 2026-09-08 · Locked · Source policy: authoritative material first

Allowed: RFCs, official documentation, standards, certification objectives, vendor
documentation, high-quality free educational material, Jacob's own notes, notes Jacob
creates while using books/paid courses. Paid books/courses inform notes and curriculum
decisions only. Never ingest or reproduce full paid-course transcripts or copyrighted
course content unless licensing explicitly permits. Learn concepts and coverage, not wording.

## D-012 · 2026-09-08 · Locked · Linux Networking first, BGP immediately after

Linux stabilizes the core lifecycle with the simplest real runtime. BGP then proves
containerlab, FRR, multi-node topology, fault injection, deterministic grading, topology
UI. Do not spend months polishing Linux before BGP exists.

## D-013 · 2026-09-08 · Locked · One deep module per runtime class before whole courses

Proving set: Modern Python (one excellent coding module), Linux Networking (one excellent
Linux/container module), BGP (one excellent multi-node networking module). Then expand.

## D-014 · 2026-09-08 · Locked · Define and version the learner-model formulas

Mastery: evidence-weighted scoring from correctness, independence, difficulty, blind vs
guided, repeated success. Difficulty: Elo-like adaptive calibration. Retention: FSRS-style
principles once history exists. All algorithms versioned so improvements never rewrite
historical results. Never present mastery as scientifically exact; always show confidence
and evidence volume. Do not build a research-grade learner model for V1.

## D-015 · 2026-09-08 · Locked · AI methodology scores never determine technical mastery

Separate dimensions: technical correctness, skill mastery, methodology, safety,
efficiency, communication, interview performance. AI evaluation may influence coaching,
interview readiness, operational judgment, safety score. It never overrides executable truth.

## D-016 · 2026-09-08 · Locked · Hints cap mastery gain; they do not subtract

No hints → full potential gain; minor hint → reduced maximum; strong hint → significantly
reduced; solution revealed → little or no independent-mastery credit. Always record that
the problem was eventually solved.

## D-017 · 2026-09-08 · Locked · Containers are canonical for coding labs

Python, Node, and C++ compiler containers with visible tests, hidden tests, linting,
execution, profiling where appropriate. Browser runtimes (Pyodide) may be added later for
lightweight exercises; authoritative grading runs in controlled containers.

## D-018 · 2026-09-08 · Locked · C++ is Phase 2

Phase 1: Python, Linux, BGP. Phase 2: C++, JavaScript/TypeScript. The coding-lab
abstraction must already support compiled languages (build step) so C++ is straightforward.

## D-019 · 2026-09-08 · Locked · Retention and sensitivity of session data

Indefinitely retain structured history: commands/events, problem id, score, environment
changes, important diffs, solution state, mastery updates, AI review, summarized timeline.
Raw PTY/session recordings expire after ~90 days unless pinned. Treat terminal contents as
potentially sensitive: redact obvious API tokens, passwords, private keys, secrets.

## D-020 · 2026-09-08 · Locked · Data durability is a Stage 1 requirement

"Destroy the entire lab server and my learning history still exists." Protect at minimum:
Postgres, course definitions, skill/mastery data, problem history, career targets, source
metadata, approved generated content. Lab workers are disposable. Automated backups and
export exist early.

## D-021 · 2026-09-08 · Locked · Contracts first, then parallelize

Schemas, database model, course format, lab-provider interface, ProblemSpec, and grader
contract become shared source of truth before content and runtime work proceed in parallel
contexts. Two agents must never independently invent competing abstractions.

## D-022 · 2026-09-08 · Locked · Stage file contract, global invariants, persistent docs

Every `STAGES/STAGE_nn.md` contains: Purpose; User-visible outcome; In scope; Explicitly
out of scope; Prerequisites / dependency stages; Architecture decisions already locked;
Files/modules owned; Interfaces/contracts consumed; Interfaces/contracts created;
Data/schema changes; Acceptance criteria; Automated test requirements; Manual QA
requirements; Security constraints; Performance expectations; Migration requirements;
Rollback requirements; Known risks; Forbidden shortcuts; Definition of done.

Global invariants (repeated in `AGENTS.md`, reminded to every fresh context):

1. No hard-coded assumption that HiveMind only teaches networking.
2. No hard-coded assumption that every course uses labs.
3. AI never determines authoritative technical correctness.
4. AI-generated executable behavior must pass a schema/controlled implementation boundary.
5. Labs must be reproducible by seed/version.
6. Course content is versioned.
7. Skill definitions are versioned.
8. Graders are versioned.
9. Historical attempts are immutable.
10. No unreviewed AI-generated course content goes directly to published.
11. Do not reproduce copyrighted paid course material.
12. Prefer deterministic automated tests.
13. Do not silently weaken an acceptance criterion to make a test pass.
14. Do not preserve bad architecture merely because it already exists in the scaffold.
15. Every major change should be explainable and reversible.

Persistent docs: `ARCHITECTURE.md`, `DECISIONS.md`, `STAGES/`, `CONTRIBUTING.md`,
`COURSE_AUTHORING.md`, `LAB_AUTHORING.md` (plus `docs/` for RFP and reviews).

## D-023 · 2026-09-08 · Locked · Mockups exist and guide direction, not pixels

Jacob will provide current mockups as product-direction and information-architecture
references. Backend/foundation stages do not block on wireframes. Workspace-heavy
functionality gets wireframes before implementation: lab workspace, incident command
center, coding workspace, career/company view, interview mode, course authoring,
maintenance/workflow console.

## D-024 · 2026-09-08 · Locked · Scaffold: keep infrastructure, remove placeholder product code stage by stage

Keep deployment, configuration, build tooling, Cloudflare plumbing, reusable components,
useful application shell. Do not preserve fake lab architecture, placeholder pages,
hard-coded course assumptions, or demo data abstractions because they exist. Replace
stage by stage, not in one deletion.

## D-025 · 2026-09-08 · Locked · Claude handles Git commits

One coherent commit per completed task/change-set. Conventional-style messages
(`feat(labs): …`, `fix(grading): …`, `test(bgp): …`, `docs(stage-02): …`). At each stage
milestone: all tests pass, verification passes, working tree clean, milestone commit/tag if
useful. Never commit knowingly broken intermediate states.

---

## Derived decisions

## D-026 · 2026-09-08 · Derived from D-007 · Retire the Durable Object / D1 control plane

> **SUPERSEDED by D-030 and D-031 (2026-09-08): Durable Objects and D1 are retained as the control plane.**

The scaffold's `apps/realtime-worker` (LabSession Durable Object) and the D1 binding were
built for a Cloudflare-only control plane. Under D-007 lab-session authority, lifecycle,
telemetry, and the terminal WebSocket move to FastAPI + PostgreSQL + Redis + the Python lab
worker, reached through Cloudflare Tunnel. D1 is dropped in favour of PostgreSQL. The
Durable Object code is deleted in Stage 1 after its lifecycle and deadline-queue ideas are
carried into the Python state machine. The Next.js on OpenNext frontend, Cloudflare Access,
Tunnel, R2, deploy tooling, lint/format/test tooling, and the app shell are kept.

## D-027 · 2026-09-08 · Derived from D-007, D-021 · Schema source of truth is Pydantic

> **SUPERSEDED by D-032 (2026-09-08): TypeScript/Zod is canonical; Pydantic is generated.**

Shared contracts live as Pydantic models in a Python package (`packages/hivemind-core`),
exported as JSON Schema and OpenAPI. TypeScript types for the frontend are generated from
those exports in CI. No hand-maintained duplicate Zod/TS schema for backend contracts;
frontend-only view models may be TypeScript.

## D-028 · 2026-09-08 · Derived from D-007 · Repository layout and toolchains

> **SUPERSEDED by D-039 (2026-09-08).**

Monorepo. `apps/web` (Next.js, bun), `services/api` (FastAPI), `services/lab-worker`
(Python agent), `packages/hivemind-core` (Pydantic contracts, shared Python), `content/`
(courses, skills, sources, careers as versioned files), `schemas/` (exported JSON Schema),
`.hivemind/work-orders/`, `STAGES/`, `docs/`. Python managed with `uv`, linted with `ruff`,
type-checked with `pyright`, tested with `pytest`. TypeScript unchanged (bun, eslint,
prettier, vitest, playwright). Root `make verify` (or equivalent) runs both toolchains.

## D-029 · 2026-09-08 · Open · Where PostgreSQL lives

> **SUPERSEDED by D-030 (2026-09-08): there is no PostgreSQL; durability is D1 Time Travel plus exports to R2.**

Options: (a) managed Postgres (Neon/Supabase-class, small tier) with nightly logical
backups to R2; (b) self-hosted on a separate small control host with pgBackRest/WAL to R2;
(c) Postgres on the lab host with backups to R2, accepting that a host loss means restore
from the last backup. D-020 rules out (c) as the end state. Recommendation: (a) for Stage 1,
because it satisfies D-020 with the least operations work; revisit if cost or latency bites.
Owner: Stage 1; must be resolved before Stage 1 acceptance.

---

## Cloudflare-native revision (2026-09-08, confirmed by Jacob)

## D-030 · 2026-09-08 · Locked · Cloudflare owns the durable/control-plane side; the Linux box exists only for workloads Cloudflare cannot faithfully execute

Supersedes the FastAPI/PostgreSQL/Redis core of D-007, and D-026, D-029. Reason: economic
and operational simplicity; managed Cloudflare primitives already satisfy the single-user
control-plane requirements.

Use: Cloudflare Workers, Durable Objects, D1, R2 (plus Access, Tunnel, DNS, Queues/KV where
useful). Drop from the primary architecture: FastAPI control plane, PostgreSQL, Redis.

Ownership:

- **D1** owns durable cross-session application data: learner, courses, skills, mastery,
  attempts, career targets, certifications, role profiles, work orders, metadata.
- **R2** owns blob-like data: recordings, exports/backups, PCAPs, generated artifacts,
  large attempt artifacts, course assets.
- **Durable Objects** own authoritative live/session-oriented state where serialization
  matters: active lab session state, lifecycle, leases, timers, connections, interactive
  workspace coordination.
- **Python** remains on the external Linux lab runtime for: lab agent, containerlab
  providers, FRR orchestration, fault modules, deterministic graders, reference solutions,
  validation runners, network-specific tooling.

Durability: D1 Time Travel (30-day point-in-time recovery on Workers Paid) plus scheduled
long-term exports to R2 satisfy D-020. The Ubuntu host is disposable compute holding no
authoritative learner/course/mastery data: `rm -rf lab-worker`, replace the machine,
reconnect a worker, lose no meaningful history.

## D-031 · 2026-09-08 · Locked · No business logic in route handlers; keep OpenNext until migration has a real benefit

Layering: UI → Route Handler (thin transport adapter) → Application Service → Domain Logic
→ D1 / DO / R2. Never a giant `route.ts` containing the application. Reusable TypeScript
application/domain services live in a package shared by the web app and the session
Worker.

Deployment adapter: as of September 2026 Cloudflare recommends `vinext` for new
Next.js-on-Workers apps while OpenNext remains supported. The scaffold is healthy on
OpenNext; preserve it until migration provides an actual benefit.

## D-032 · 2026-09-08 · Locked · Schema source of truth is TypeScript/Zod; Python consumes generated Pydantic

Supersedes D-027. `packages/schema/` holds Zod schemas and generated JSON Schema; Pydantic
models are generated from the JSON Schema for the Python lab worker. Applies particularly to
ProblemSpec, LabSpec, FaultSpec, GraderResult, AttemptResult, WorkOrder, CourseManifest,
SkillDefinition, CareerProfile. CI fails if generated Python schemas are out of sync with
the TypeScript source. No manually maintained parallel TS/Python definitions.

## D-033 · 2026-09-08 · Locked · Authentication is Cloudflare Access with Google

Google → Cloudflare Access → HiveMind Worker → Access identity → `learner_id`. HiveMind
trusts the validated Access identity and maps it to the internal learner record; the
internal `learner_id` keeps authorization decoupled from an email or from Cloudflare. No
Auth.js/in-app authentication, signup, password management, recovery, or organizations now.
If HiveMind becomes multi-user/public, the authentication layer is replaced or augmented
without redesigning learner/course/mastery data.

## D-034 · 2026-09-08 · Locked · CLI split: TypeScript `hivemind` via Bun; Python worker CLI

Supersedes the D-007 preference for a Python compiler/toolchain. The main
content/work-order CLI is TypeScript run through Bun: `hivemind course|source|work|career|
cert|validate|export …`, plus orchestration commands that invoke the worker protocol. Python
owns a separate worker/runtime CLI beside the lab implementation: `lab provision|destroy`,
`fault inject|validate`, `problem validate`, `grader execute`, `reference-solution execute`,
`topology validate`.

## D-035 · 2026-09-08 · Locked · Three execution classes; Stage 2 must evaluate them; capability-based provider selection

- **Class A, Cloudflare-native sandbox** (Sandbox SDK on Containers): candidate for Python,
  JavaScript/TypeScript, eventually C++ coding problems, unit tests, repository/debugging
  exercises, shell exercises, isolated single-node Linux exercises.
- **Class B, external Linux network worker**: required for containerlab, FRRouting
  topologies, Linux network namespaces, veth pairs, bridges, realistic L2, multi-router BGP,
  IS-IS, MPLS, topology-level faults. Non-negotiable: Sandbox Docker-in-Docker is rootless
  and cannot use privileged containers or manipulate iptables.
- **Class C, either**: single-node Linux exercises; benchmark startup latency, fidelity,
  cost, isolation, filesystem behaviour, network capabilities, terminal streaming,
  snapshot/reset, operational complexity; choose the simplest provider that faithfully
  implements the exercise.

Invariant: a lab declares required capabilities (e.g. `shell.linux`, `python` vs
`network.namespace`, `network.veth`, `network.containerlab`, `routing.frr`,
`privilege.net_admin`); HiveMind selects a provider capable of satisfying them. Do not
pursue uniformity for its own sake.

## D-036 · 2026-09-08 · Locked · Cost principle

Minimize recurring infrastructure and API expenditure: prefer managed/serverless
control-plane infrastructure, Jacob's existing Claude Max/Claude Code subscription for
AI-heavy authoring and maintenance, and disposable compute only where real execution
requires it. The likely recurring expense is the Linux network-lab worker. Do not introduce
a continuously hosted application/database/cache tier unless a demonstrated limitation
requires one. AI API usage remains optional, never fundamental.

## D-037 · 2026-09-08 · Locked · UI direction: engineering workstation, desktop-first

HiveMind is an engineering workstation / developer tool: Cursor/VS Code + Grafana + GitHub +
Datadog + a network operations console. It is not a game and must not resemble a consumer
learning SaaS. Avoid streak flames, XP, badges, confetti, giant donut charts, motivational
quotes, cartoon illustrations, "Welcome back!" heroes, giant gradient cards, excessive
rounded tiles, big KPI cards. Use dense panes, trees, tabs, a command palette (Ctrl+K),
terminals, diffs, status bars, logs, structured tables, sparklines, keyboard shortcuts,
breadcrumb paths, monospace identifiers, resizable panels, persistent context. Desktop-first;
do not optimize initial workstation pages for mobile. Every percentage shows confidence and
evidence count (D-014).

Mockups in `docs/mockups/` are Stage 1 product-direction inputs (direction, not pixel
spec, per D-023). Each mockup ships as `NN-name.png` plus `NN-name.md` recording purpose,
panes, visible state, interactions, lifecycle state, data requirements, unresolved
questions. Order: Lab Workspace (BGP) → Career Target → Course Workspace → Claude Work Orders
→ Coding Workspace, then the Control Center, then the rest.

## D-038 · 2026-09-08 · Locked · Identifier formats and canonical lifecycle vocabulary

`HM-WO-0184` work orders, `HM-LAB-829143` lab sessions, `HM-INC-20260908-001` incidents,
`HM-INT-00412` interviews. Lifecycle names are RFP §86 verbatim in lowercase snake case
(`queued`, `provisioning`, `baseline_check`, `fault_injection`, `fault_check`, `ready`,
`active`, `grading`, `completed`, `destroying`, `destroyed`, `failed`) everywhere: UI, API,
CLI, logs, D1.

## D-039 · 2026-09-08 · Locked · Repository layout and toolchains (revised)

Supersedes D-028.

```text
apps/web/               Next.js 16 on Workers via OpenNext; UI + thin route handlers
apps/session-worker/    Worker with the LabSession Durable Object, gateway, lab provider API
packages/schema/        Zod schemas (canonical) → schemas/*.json → generated Pydantic
packages/core/          TypeScript application services + domain logic (D1/DO/R2 access)
packages/cli/           `hivemind` CLI (Bun)
services/lab-worker/    Python 3.13 lab agent + worker CLI (uv, ruff, pyright, pytest)
content/                skills, courses, sources, careers, problems, topologies (versioned)
docs/mockups/           product-direction mockups with companion .md
.hivemind/work-orders/  work orders for Claude Code
STAGES/                 stage contracts
```

The scaffold's `apps/realtime-worker` becomes `apps/session-worker`; `packages/protocol`
becomes `packages/schema`. TypeScript tooling unchanged (bun, eslint, prettier, vitest,
playwright, vitest-pool-workers). Root verification runs both toolchains.

## D-040 · 2026-09-08 · Locked · Domain

`hivemindjrr.com` on Cloudflare: web app, Access application, Tunnel hostname for the lab
worker, and any API hostnames hang off this zone.

## D-041 · 2026-09-09 · Locked · Companion specifications are the UI contract; mockup images are reference only

Each screen has `docs/mockups/NN-name.md` as its implementation contract and
`docs/ui/UI-SYSTEM.md` carries the global rules (shell, navigation, typography, density,
status colours, lifecycle names, confidence presentation, tables, command palette,
shortcuts, AI execution modes, leakage rules, forbidden elements). Implementation
authority order: `DECISIONS.md` → `UI-SYSTEM.md` → companion spec → stage spec → mockup
image. Every companion carries `REFERENCE ONLY` and this order. The canonical shell is the
one in mockups 12–18; screens 1–11 keep their layouts and are re-skinned. Stage files list
the companions they implement.

## D-042 · 2026-09-09 · Locked · Gold-standard lesson topic: the Linux routing table and `ip route`

The first lesson (D-010) is "The Linux routing table and `ip route`": how the kernel
selects a route (longest-prefix match), reading and querying the table (`ip route show`,
`ip route get`), default routes and metrics, adding and removing routes, and the common
failures (wrong gateway, missing route, asymmetric return path). It anchors the first
Linux Networking module, needs only a single container for its guided lab, and is a
prerequisite for the BGP track. Sources: iproute2 manual pages (`ip-route(8)`), Linux
kernel networking documentation, RHCSA networking objectives, RFC 1812 for forwarding
semantics; wording original per D-011. It must meet all twelve RFP §110 elements and is
the benchmark for every later lesson.

## D-043 · 2026-09-09 · Locked · Pydantic generation uses `datamodel-code-generator`

Generated Pydantic v2 models for `services/lab-worker` come from `schemas/*.json` via
`datamodel-code-generator` (pinned version, `--output-model-type pydantic_v2.BaseModel`,
`--use-annotated`, `--collapse-root-models`, `--use-title-as-name` off). Generation runs
in CI and drift fails the build (D-032). A dedicated test round-trips the worker protocol
envelope and every discriminated union through both TypeScript and the generated Python.
If the generator cannot represent a construct faithfully, the Zod schema is simplified
rather than the Python hand-edited.

---

## Stage 01 proposals (2026-09-09, for Jacob to lock or amend)

## D-044 · 2026-09-09 · Proposed (Stage 01) · Lesson bodies are Markdown with a fixed directive set, compiled to a render tree; no MDX

`lesson.md` is CommonMark + GFM plus a closed set of directives (`:::callout`,
`:::exercise`, `::question{id}`, `:claim[id]`, `:kbd[…]`, fenced `ascii`/`mermaid`
diagrams) with each `##` section tagged by its RFP §110 element (`{#motivation}` …
`{#mastery_evaluation}`). `hivemind content compile` turns it into the `LessonSection[]`
render tree in `packages/schema` (contract `BlockNode`/`InlineNode`); the web app renders
that tree with React components. Reason: MDX evaluates JSX with `new Function`, which
Workers forbid, and it would let executable content bypass the schema boundary
(invariant 4). Questions and claims are structured data in `questions.yaml` and
`claims.yaml`, never markup. Consequence: `ARCHITECTURE.md` and the course-workspace
companion say "compiled Markdown" where they said MDX; the compiler rejects HTML, images
(until an asset pipeline exists), and footnotes.

## D-045 · 2026-09-09 · Proposed (Stage 01) · Identity binding: the seeded learner binds to the first validated Access identity; pinned keys are an explicit option

`resolveLearner` maps a validated Access identity to a learner by email. While exactly
one learner exists and has no email, the first validated identity binds to it; afterwards
only that email maps, and any other identity gets 403 even when Access admits it. This
keeps the Access policy and the application record independent (D-033) and makes
multi-user a matter of adding learner rows. Verification uses the team JWKS by default;
`ACCESS_JWKS` pins a key set for tests and air-gapped drills and must stay unset in
production. Break-glass: clear the learner's email with one SQL statement
(`docs/runbooks/access.md`).

## D-046 · 2026-09-09 · Proposed (Stage 01) · Contract conventions: snake_case fields, UTC string timestamps, and an append-only version lock

All `packages/schema` contracts use snake_case field names shared verbatim by D1
columns, YAML content, and generated Pydantic; timestamps are UTC ISO-8601 strings with a
trailing `Z`; UUIDs, emails, and URLs are pattern-checked strings rather than JSON Schema
`format`s so the generated Python round-trips documents byte for byte (D-043).
`schemas/contracts.lock.json` records a SHA-256 per `<Contract>@<version>` and is
append-only: a schema whose hash changes at an unchanged version fails
`bun run schema:export`, `schema:check`, and CI (acceptance 3); bump the version in
`packages/schema/src/contracts.ts` instead. The scaffold's browser↔session transport
(`lab-session.ts`) keeps its camelCase wire format until Stage 02 realigns it.

## D-047 · 2026-09-09 · Locked · Domain is `jryans.dev`; the app is `hivemind.jryans.dev`

Supersedes D-040. `hivemindjrr.com` was never registered. The zone on Cloudflare is
`jryans.dev`: the web Worker's custom domain is `hivemind.jryans.dev`, the Access
application protects that hostname (team `royal-breeze-2b7c.cloudflareaccess.com`), and
the lab worker's Tunnel hostname will be `lab-worker.jryans.dev` (Stage 02). Every
reference to `hivemindjrr.com` outside this log is updated; D-040 stays as history.

---

## Stage 02 proposals and decisions (2026-09-09)

## D-048 · 2026-09-09 · Proposed (Stage 02 benchmark decision) · Class C runs on the lab worker when one is online; the Cloudflare Sandbox is the fallback and the Class A home

The single-node Linux benchmark (`docs/benchmarks/class-c.md`) places `shell.linux`-only
specs on a registered lab worker first and on the Sandbox only when no worker is online.
Reasons: the worker gives a full Linux userland with `CAP_NET_ADMIN`, real interfaces,
`iptables`-enforced egress, and the same image the multi-node labs use, so a Class C
exercise behaves exactly like the first node of a Class B one; the Sandbox is rootless
with no `NET_ADMIN`, so routing-table exercises (D-042) cannot run there faithfully; and
the worker's start time (under two seconds on the CI runner) meets acceptance 2 with a
wide margin. The Sandbox keeps Class A (coding, Stage 07) and stands in for Class C when
the host is down. The preference is data (`CLASS_C_PREFERENCE` in
`packages/core/src/labs/selection.ts`) and is revisited by re-running the benchmark.

Consequence: the Sandbox needs Cloudflare Containers, which need the Workers Paid plan;
the account is on Workers Free as of 2026-09-09. `apps/session-worker/wrangler.jsonc`
deploys without the Sandbox; `wrangler.sandbox.jsonc` adds it and
`tools/deploy.sh session <env> --sandbox` deploys it once the plan allows. The platform
half of the benchmark (edge start latency, cost) is measured then.

## D-049 · 2026-09-09 · Proposed (Stage 02) · Service tokens may operate labs for the single learner (`lab:operate`)

The `hivemind lab` CLI authenticates with the Access service token, which the session
gateway would otherwise reject because it is not a learner. A token granted the
`lab:operate` scope acts for the one learner with a bound identity (D-001, D-008); if
zero or several learners are bound the request gets 403 `no_operator_learner`. Scopes are
still keyed by the token's Client ID (D-045 mechanics). Multi-user later means an explicit
learner selection on the token, not a change to sessions.

## D-050 · 2026-09-09 · Proposed (Stage 02) · Topology archetypes are YAML plus a named TypeScript generator; the worker renders LabSpec, never archetypes

`content/topologies/<id>.yaml` (contract `TopologyArchetype`) declares the seeded
parameters, digest-pinned images per role, resources, egress policy, TTL, aliases, and
the id of a generator in `packages/core/src/labs/generators`. `instantiateTopology`
(seed → parameters → `LabSpec` → `spec_hash`) is the only place variation is resolved, so
the session object, the CLI, and Stage 03's problem instantiation share it. The Python
worker receives a concrete `LabSpec` and renders it to containerlab and FRR files; it
never sees an archetype. Archetype YAML compiles into
`packages/core/src/labs/archetypes.generated.json` (`hivemind topology compile`; drift
fails the unit suite) because Workers cannot read the filesystem. A generator change
that alters output requires bumping every archetype version that names it (invariant 5).

## D-051 · 2026-09-09 · Proposed (Stage 02) · Recordings are asciicast v2 per node, redacted before any durable write

One `.cast` per node per session under `recordings/<session>/<node>-<stamp>.cast` in R2
(`hivemind-artifacts`, 90-day lifecycle rule on the prefix; pinning is a later
explicit copy). The header (`RecordingHeader`) names the redaction filter version. The
live relay to the learner is unredacted; the D-019 filter (`packages/core/src/labs/redaction.ts`,
`REDACTION_VERSION`) runs on the recording path before frames reach the object's SQLite,
so no durable store ever holds an unredacted terminal byte. Terminal bytes never enter
D1; the durable event log keeps lifecycle, notices, and provider log lines only.

## D-052 · 2026-09-09 · Proposed (Stage 02) · The loopback agent is the test double for lab workers

`apps/session-worker/src/gateway/loopback.ts` emulates the Python agent's wire behaviour
(job intake, asynchronous events, per-node PTY WebSockets with scrollback replay) inside
the session Worker, registered as `loopback-worker` when `PROVIDER_LOOPBACK=true` and
never in production. workerd tests and `wrangler dev` exercise the real LabSession code
paths (job push, callbacks, deadlines, relay, recordings) without a host; provider code
is tested against Docker and containerlab in the Linux CI jobs and on the host. Magic
seeds (`424242` fail, `434343` hang, `444444` slow) drive failure paths deterministically.
