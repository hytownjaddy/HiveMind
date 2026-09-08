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

The scaffold's `apps/realtime-worker` (LabSession Durable Object) and the D1 binding were
built for a Cloudflare-only control plane. Under D-007 lab-session authority, lifecycle,
telemetry, and the terminal WebSocket move to FastAPI + PostgreSQL + Redis + the Python lab
worker, reached through Cloudflare Tunnel. D1 is dropped in favour of PostgreSQL. The
Durable Object code is deleted in Stage 1 after its lifecycle and deadline-queue ideas are
carried into the Python state machine. The Next.js on OpenNext frontend, Cloudflare Access,
Tunnel, R2, deploy tooling, lint/format/test tooling, and the app shell are kept.

## D-027 · 2026-09-08 · Derived from D-007, D-021 · Schema source of truth is Pydantic

Shared contracts live as Pydantic models in a Python package (`packages/hivemind-core`),
exported as JSON Schema and OpenAPI. TypeScript types for the frontend are generated from
those exports in CI. No hand-maintained duplicate Zod/TS schema for backend contracts;
frontend-only view models may be TypeScript.

## D-028 · 2026-09-08 · Derived from D-007 · Repository layout and toolchains

Monorepo. `apps/web` (Next.js, bun), `services/api` (FastAPI), `services/lab-worker`
(Python agent), `packages/hivemind-core` (Pydantic contracts, shared Python), `content/`
(courses, skills, sources, careers as versioned files), `schemas/` (exported JSON Schema),
`.hivemind/work-orders/`, `STAGES/`, `docs/`. Python managed with `uv`, linted with `ruff`,
type-checked with `pyright`, tested with `pytest`. TypeScript unchanged (bun, eslint,
prettier, vitest, playwright). Root `make verify` (or equivalent) runs both toolchains.

## D-029 · 2026-09-08 · Open · Where PostgreSQL lives

Options: (a) managed Postgres (Neon/Supabase-class, small tier) with nightly logical
backups to R2; (b) self-hosted on a separate small control host with pgBackRest/WAL to R2;
(c) Postgres on the lab host with backups to R2, accepting that a host loss means restore
from the last backup. D-020 rules out (c) as the end state. Recommendation: (a) for Stage 1,
because it satisfies D-020 with the least operations work; revisit if cost or latency bites.
Owner: Stage 1; must be resolved before Stage 1 acceptance.
