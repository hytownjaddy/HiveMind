# HiveMind — agent guide

HiveMind is the adaptive technical-learning platform specified in `docs/RFP.md`. Work is
organized in stages (`STAGES/`), governed by locked decisions (`DECISIONS.md`) and the
target architecture (`ARCHITECTURE.md`). Read those three before touching code. Process
rules are in `CONTRIBUTING.md`; content and lab rules in `COURSE_AUTHORING.md` and
`LAB_AUTHORING.md`.

## Global invariants (D-022)

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

## Repository state

The tree is transitioning from a Cloudflare-only scaffold to the D-007 hybrid. Until
Stage 1 completes, `apps/realtime-worker`, `packages/protocol`, the D1 binding, and the
demo labs UI are **scheduled for removal** (D-026); do not extend them. Target layout
(D-028):

```text
apps/web/               Next.js 16 (TypeScript) on Cloudflare via OpenNext
services/api/           FastAPI control plane (Python)
services/lab-worker/    Python lab agent on the Ubuntu lab host
packages/hivemind-core/ Pydantic contracts, shared Python
content/                skills, courses, sources, careers (versioned files)
schemas/                exported JSON Schema; TS types generated from these
.hivemind/work-orders/  work orders consumed by Claude Code
STAGES/                 stage plans (one self-contained file per stage)
docs/                   RFP, RFP review
```

## Commands

```text
bun install                      TypeScript deps (bun 1.3.14, see .bun-version)
bun run dev                      web dev server (+ legacy realtime worker until Stage 1 removes it)
bun run verify                   TS format, lint, boundaries, typecheck, tests, OpenNext build
make verify                      (from Stage 1) Python + TypeScript verification
hivemind …                       (from Stage 1) content compile, work orders, problem validation
```

## Conventions

- Python for orchestration, graders, faults, agents, compiler, workflows; TypeScript for
  the frontend (D-007). Contracts are Pydantic; TS types are generated (D-027).
- One coherent commit per task, conventional messages, never a broken commit (D-025).
- Work outside your stage is a proposal in `DECISIONS.md`, not code.
- Never log secrets, cookies, or learner terminal contents outside redacted telemetry storage.

## Next.js

`apps/web` runs Next.js 16 App Router: `proxy.ts` replaced middleware; `params` and
`searchParams` are Promises. Read `node_modules/next/dist/docs/` from `apps/web` before
writing Next code. `next dev` re-adds a notice block below this line.
