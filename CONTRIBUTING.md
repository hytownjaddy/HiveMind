# Contributing to HiveMind

This repository is worked on by Jacob and by Claude Code sessions. The rules below exist so
that a fresh context can contribute without re-deriving decisions.

## Before you start

1. Read `CLAUDE.md` (→ `AGENTS.md`), `DECISIONS.md`, `ARCHITECTURE.md`.
2. Read the stage you are working on in `STAGES/` and its prerequisites.
3. If you are executing a work order, read it from `.hivemind/work-orders/` and the authoring
   guide it references (`COURSE_AUTHORING.md`, `LAB_AUTHORING.md`).
4. Do not start work that belongs to another stage. Propose a decision entry instead.

## Working rules

- Contracts first (D-021). Changes to schemas, the D1 model, the course format, the
  lab-provider interface, ProblemSpec, or the grader contract are made in
  `packages/schema` (Zod) with a version bump, regenerated JSON Schema and Pydantic, and a
  D1 migration where needed, never ad hoc elsewhere.
- TypeScript for the control plane, application services, content compiler, and CLI;
  Python only on the lab worker for providers, faults, graders, reference solutions, and
  validation runners (D-030, D-034). Contracts are Zod; Pydantic is generated (D-032).
- No business logic in route handlers or Durable Object fetch handlers: thin adapters over
  `packages/core` services (D-031). See "Route handler checklist" below; ESLint
  (`no-restricted-imports` on `apps/web/app/api/**/route.ts`) and dependency-cruiser
  (`route-handlers-are-thin`) enforce the import boundary.
- Every acceptance criterion in a stage is a test or a scripted check. Do not weaken one to
  pass (invariant 13).
- Content is data: no course-specific branches in application code (invariants 1–2).
- Historical rows are immutable (invariant 9): new algorithm or grader versions produce new
  rows, never rewrites.
- Anything AI-generated that executes goes through a schema and a controlled implementation
  (invariant 4) and through review before publication (invariant 10).

## Route handler checklist (D-031, Stage 01 acceptance 7)

A `route.ts` (and the session gateway's `fetch`) does exactly four things, in order:

1. Parse: read params, query, and body through a Zod schema (`readJson`).
2. Authenticate: `withAuth(request, { learner: true } | { scope })`; failures map to 401/403.
3. Call one `packages/core` service method from `lib/server/services`.
4. Serialize: return the service result as JSON with a status code.

Not allowed: SQL or repositories, loops that combine several services, conditionals that
encode a rule (state machines, visibility, versioning), `fetch` to other systems, or
imports from components, client code, or `packages/core/src/db`. When a handler needs
logic, add a service method and a test in `packages/core`. Reviewers reject handlers that
break this shape even when lint passes.

## Verification

Run the full verification before any commit that claims a task is done:

```bash
bun run verify          # TypeScript: format, lint, boundaries, typecheck, tests, build
uv run --directory services/lab-worker task verify   # once Stage 1 lands: ruff, pyright, pytest
```

Worker/provider tests that need Docker run on a Linux host (CI runner or the lab host), not
on macOS.

## Commits (D-025)

- One coherent commit per completed task or change-set.
- Conventional-style messages: `feat(labs): …`, `fix(grading): …`, `test(bgp): …`,
  `docs(stage-02): …`, `chore: …`, `refactor(api): …`.
- Never commit a knowingly broken state. At stage milestones the tree is clean, all
  verification passes, and a milestone commit (and tag if useful) is created.
- Claude Code makes the commits; Jacob reviews diffs.

## Work orders (D-009)

- Work orders live in `.hivemind/work-orders/<id>.md` with a YAML header and a human prompt.
- Statuses: `draft → exported → in_progress → implemented → validation_failed |
review_required → approved → done`.
- A work order is done only when its validation commands pass and its change report is
  written back.

## Documentation duties

When a task changes topology, contracts, or conventions, update `ARCHITECTURE.md`,
the relevant authoring guide, and the stage file in the same change-set. Add a `DECISIONS.md`
entry for anything a future context would otherwise have to guess.
