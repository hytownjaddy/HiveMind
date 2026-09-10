# HiveMind — agent guide

HiveMind is the adaptive technical-learning platform specified in `docs/RFP.md`. Work is
organized in stages (`STAGES/`), governed by locked decisions (`DECISIONS.md`) and the
target architecture (`ARCHITECTURE.md`). Read those three before touching code. Process
rules are in `CONTRIBUTING.md`; content and lab rules in `COURSE_AUTHORING.md` and
`LAB_AUTHORING.md`; UI rules in `docs/ui/UI-SYSTEM.md` and per-screen contracts in `docs/mockups/NN-name.md` (images are reference only; authority order in D-041).

## Starting a stage (the only entry point for implementation work)

Jacob will say "do stage 03" or run `/stage 03`. Then, before writing any code:

1. Read in this order: `DECISIONS.md` (all entries; later entries supersede earlier ones),
   `ARCHITECTURE.md`, `STAGES/README.md`, the stage file `STAGES/STAGE_nn.md`, each
   prerequisite stage's "Definition of done" checklist, `docs/ui/UI-SYSTEM.md`, and every
   companion spec listed under the stage's "UI specifications". Read `docs/RFP.md` sections
   the stage cites; do not read the whole RFP unless the stage says so.
2. Pre-flight: `git status` is clean and on `main`; prerequisite stages are marked done in
   `STAGES/README.md`; the stage's "Open questions" (if any) are answered by Jacob; the
   toolchains install (`bun install`, and `uv sync` in `services/lab-worker` once it
   exists).
3. Post a short plan to Jacob: work breakdown in dependency order, the first three
   commits, and anything in the stage file that conflicts with the current tree. Wait for
   a go only if the plan changes scope; otherwise proceed.
4. Execute in the stage's work-breakdown order. One coherent commit per task (D-025).
   Run `bun run verify` (and the Python checks) before every commit. Never weaken an
   acceptance criterion (invariant 13). Anything outside the stage becomes a proposal in
   `DECISIONS.md`, not code.
5. Finish: every acceptance criterion demonstrated, docs updated in the same change-set,
   the stage's "Definition of done" boxes ticked, `STAGES/README.md` status updated,
   milestone commit and tag per the stage file, push, and a closing report to Jacob
   listing what was left out and why.

If anything in this file, a stage file, or a spec disagrees with `DECISIONS.md`, the
decision wins; say so and propose an edit rather than silently picking one.

## Global invariants (D-022, D-031, D-035)

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
16. No business logic in route handlers or Durable Object fetch handlers; thin adapters
    over `packages/core` services.
17. A lab declares capabilities; HiveMind selects a provider that satisfies them.

## Architecture in one paragraph

Cloudflare owns the durable/control-plane side: Next.js on Workers (OpenNext) for UI and
thin route handlers, a Worker with the `LabSession` Durable Object for live session
authority, D1 for durable records, R2 for blobs and backups, Access with Google for
identity, Sandbox for coding and simple Linux exercises. A disposable Ubuntu x86-64 host
running a Python lab agent exists only for privileged networking (containerlab, FRR).
Claude Code executes work orders from `.hivemind/work-orders/`; no AI API is required for
normal operation. Domain: `jryans.dev`; the app is `hivemind.jryans.dev` (D-047).

## Repository layout (D-039, as of Stage 02)

Stages 01 and 02 are done: the layout below is real. `apps/session-worker` runs the
capability/provider model (lab workers over the Tunnel, the Cloudflare Sandbox when the
plan allows, an in-Worker loopback agent for dev and tests); `services/lab-worker` is the
Python agent for the Ubuntu host; `content/topologies` holds the archetypes.

```text
apps/web/               Next.js 16 (TypeScript) on Workers via OpenNext; UI + thin route handlers; D1 migrations
apps/session-worker/    LabSession Durable Object, gateway (Access identity), lab provider API
packages/schema/        Zod contracts (canonical) → schemas/*.schema.json + lock + fixtures → generated Pydantic
packages/core/          application services + domain logic (D1/R2 access, identity, work orders, content compiler)
packages/cli/           `hivemind` CLI (Bun): content, work, export, db
services/lab-worker/    Python 3.13 lab agent + worker CLI (uv, ruff, pyright, pytest); generated contracts
content/                skills, sources, careers, courses (gold lesson: linux/networking), topologies (archetypes)
docs/mockups/           NN-name.png + NN-name.md product-direction inputs; docs/runbooks/ recovery, Access, lab host
docs/benchmarks/        Class C benchmark (D-048)
.hivemind/work-orders/  work orders consumed by Claude Code
tools/backup/           nightly export and restore drill; tools/host/ provisions the Ubuntu lab worker
STAGES/                 stage contracts; docs/ holds the RFP and its review
```

## Commands

```text
bun install                      TypeScript deps (bun 1.3.14, see .bun-version); `brew install uv` for Python
bun run dev                      web dev server + session worker side by side (needs apps/*/.dev.vars, see .dev.vars.example)
bun run db:migrate:local         apply D1 migrations to the local database before the first dev run
bun run verify                   TS format, lint, boundaries, typecheck, schema lock, tests, OpenNext build
bun run verify:py                ruff, pyright, contract drift check, pytest (uv run --directory services/lab-worker task verify)
bun run hivemind -- …            content …, work …, export, db migrate, topology compile|list|render, lab up|down|ls|attach|logs
bun run test:e2e                 Playwright smoke against next dev (bunx playwright install chromium once)
uv run pytest -m docker          lab worker provider tests against a Docker daemon (Linux CI, lab host)
bun run bench:class-c            Class C benchmark against a session Worker (docs/benchmarks/class-c.md)
```

## Conventions

- TypeScript for the control plane, services, compiler, CLI; Python only on the lab worker
  (D-030, D-034). Zod is canonical; Pydantic is generated; CI fails on drift (D-032).
- Identifiers: `HM-WO-0184`, `HM-LAB-829143`, `HM-INC-20260908-001`, `HM-INT-00412`.
  Lifecycle names are RFP §86 verbatim in snake case (D-038).
- UI is an engineering workstation, desktop-first (D-037). No gamification.
- One coherent commit per task, conventional messages, never a broken commit (D-025).
- Work outside your stage is a proposal in `DECISIONS.md`, not code.
- Never log secrets, cookies, or learner terminal contents outside redacted telemetry storage.
- Labs declare capabilities; providers are selected, never hard-coded (invariant 17). The
  worker renders `LabSpec`s; only `packages/core` resolves archetypes and seeds (D-050).

## Next.js

`apps/web` runs Next.js 16 App Router: `proxy.ts` replaced middleware; `params` and
`searchParams` are Promises. Read `node_modules/next/dist/docs/` from `apps/web` before
writing Next code. Keep OpenNext until migration to `vinext` has a real benefit (D-031).
`next dev` re-adds a notice block below this line.
