# Stage 07 — Coding lab runtime and Modern Python module

## Purpose

Add the coding runtime class under the same contracts: a `runtime.python` provider with
container-per-attempt execution, visible and hidden tests, linting, and profiling hooks; a
browser coding workspace (Monaco, file tree, terminal, test runner); repository templates;
the code mutation system; and one excellent Modern Python module (D-013, RFP §119 item 13).
The abstraction must already accommodate compiled languages (build step) without
implementing C++ (D-018).

## User-visible outcome

Jacob opens a Python problem, edits a small repository in the browser, runs visible tests
and lint, submits, and receives deterministic results from hidden tests plus a graded
attempt that feeds mastery like any lab. The module teaches modern typing/asyncio topics
with debugging and repository-task problems.

## In scope

- Worker provider `runtime.python`: pinned Python image, per-attempt container with
  repository checkout, test runner (pytest), lint (ruff), optional profiling; build-step
  hook in the interface for future compiled runtimes.
- `CodingProblemSpec` extension of ProblemSpec: repository template, mutations, visible
  and hidden tests, constraints (time, memory, banned calls).
- Mutation system (RFP §45): controlled, seeded code mutations applied to templates
  (missing await, boundary condition, resource leak, wrong data structure, missing
  validation, poor complexity); validation runs the reference fix.
- Workspace UI: Monaco with file tree and tabs, terminal, test output, submit; wireframes
  first (D-023).
- Coding graders: tests pass, hidden tests pass, lint clean, constraints met; produce
  `GradeResult` in the shared contract.
- Modern Python module: lessons for typing/protocols/dataclasses, asyncio, testing with
  pytest; problem archetypes: implementation, debugging, refactoring, repository task.

## Explicitly out of scope

- C++, Node runtimes (Phase 2) beyond the build-step hook.
- Browser-side runtimes (Pyodide) (later).
- AI code review (Stage 08).

## Prerequisites / dependency stages

Stages 01, 02 (worker), 03 (grader/validation contracts). Can run alongside 04–06.

## Architecture decisions already locked

D-013, D-017, D-018, invariants 1, 3, 4, 5, 8.

## Files/modules owned by this stage

`services/lab-worker/hivemind_worker/providers/python/**`, `.../mutations/**`,
`content/problems/python/**`, `content/courses/python/modern/**`,
`apps/web/app/(app)/code/**`, `apps/web/components/code/**`, `docs/wireframes/coding-workspace/**`.

## Interfaces/contracts consumed

`LabProvider`, `ProblemSpec`, `Grader`, `GradeResult`, attempts and telemetry (04), work
orders (05).

## Interfaces/contracts created

- `CodingProblemSpec`, `RepositoryTemplate`, `Mutation` contracts.
- Coding workspace file sync protocol (editor ↔ container) and test-run events.

## Data/schema changes

Alembic `0007`: `repository_templates`, `mutations`, `code_events` (typed telemetry).

## Acceptance criteria

1. Container-per-attempt: two concurrent attempts cannot see each other's files; resource
   limits enforced; container removed after grading.
2. Hidden tests are never sent to the browser (network capture in Playwright).
3. Each mutation type validated across 10 seeds: baseline passes, mutated fails intended
   tests, reference fix passes.
4. Build-step hook demonstrated with a trivial compiled-language stub in tests (no C++ content).
5. Modern Python module published with ≥ 6 archetypes and lessons meeting the bar.
6. Coding attempts update mastery through the same Stage 06 path as labs.

## Automated test requirements

Provider integration tests on Linux CI; mutation property tests; grader tests; Playwright
for edit → run → submit.

## Manual QA requirements

Jacob completes the module; judges editor ergonomics and problem realism.

## Security constraints

No network from attempt containers; banned-call constraints enforced by tests, not by AI;
file size and count limits.

## Performance expectations

Visible test run round trip under 5 s; submit results under 30 s.

## Migration requirements

Alembic `0007` with downgrade.

## Rollback requirements

Provider deployable independently; workspace route flagged.

## Known risks

- Editor/file-sync complexity; keep repositories small and sync whole files.
- Overfitting the abstraction to Python; the compiled stub test guards this.

## Forbidden shortcuts

Grading in the browser; shipping hidden tests to the client; C++ "while we're here".

## Definition of done

- [ ] Acceptance 1–6; RFP §119 item 13 true.
- [ ] Milestone commit `feat(stage-07): coding lab runtime` and tag `stage-07`.
