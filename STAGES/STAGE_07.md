# Stage 07 — Coding lab runtime and Modern Python module

## Purpose

Add the coding runtime class under the same contracts: a `python` provider (Class A on
Cloudflare Sandbox per the Stage 02 evaluation, with the Linux worker as fallback) running
container-per-attempt execution with visible and hidden tests, linting, and profiling
hooks; the Coding Workspace (Monaco, file tree, terminal, tests, instructions, runtime
state); repository templates; the code mutation system; and one excellent Modern Python
module (D-013, RFP §119 item 13). The abstraction must accommodate compiled languages
(build step) without implementing C++ (D-018).

## User-visible outcome

Jacob opens a Python problem such as repairing an async worker, edits a small repository in
the browser, runs visible tests and lint, submits, and receives deterministic results from
hidden tests plus a graded attempt that feeds mastery like any lab. The module teaches
modern typing, asyncio, and testing with debugging and repository-task problems.

## In scope

- Provider `python` (and the `node` slot) on the Class A/C provider chosen in Stage 02:
  pinned image, per-attempt isolated environment with repository checkout, pytest runner,
  ruff, optional profiling, build-step hook for future compiled runtimes; grading executed
  provider-side and returned as `GraderResult`.
- `CodingProblemSpec` extension of ProblemSpec: repository template, mutations, visible and
  hidden tests, constraints (time, memory, banned calls).
- Mutation system (RFP §45): controlled, seeded mutations (missing await, boundary
  condition, resource leak, wrong data structure, missing validation, poor complexity);
  validation runs the reference fix.
- Coding Workspace per the mockup: Monaco with file tree and tabs, terminal, test output
  with hidden-test count shown but never opened, runtime state, instructions, submit.
- Coding graders: tests pass, hidden tests pass, lint clean, constraints met.
- Modern Python module: lessons for typing/protocols/dataclasses, asyncio, pytest;
  archetypes for implementation, debugging, refactoring, repository task.

## Explicitly out of scope

- C++ and Node runtimes beyond the build-step hook and provider slot (Phase 2).
- Browser-side runtimes (Pyodide).
- AI code review (Stage 08).

## Prerequisites / dependency stages

Stages 01, 02 (Class A provider and benchmark), 03 (grader/validation contracts). Runs
alongside 04–06.

## UI specifications

Implement these companion specifications (authority: `DECISIONS.md` → `docs/ui/UI-SYSTEM.md` → companion → this stage → mockup image):

- `docs/mockups/03-coding-workspace.md`

## Architecture decisions already locked

D-013, D-017, D-018, D-030, D-032, D-035, D-041, invariants 1, 3, 4, 5, 8.

## Files/modules owned by this stage

`packages/core/src/providers/sandbox/python/**` (or the worker equivalent if Stage 02 chose
Class B for coding), `packages/core/src/problems/coding/**`, `content/problems/python/**`,
`content/courses/python/modern/**`, `apps/web/app/(app)/code/**`,
`apps/web/components/code/**`, `packages/schema/src/problems/coding/**`.

## Interfaces/contracts consumed

`LabProvider`, `ProblemSpec`, `Grader`, `GraderResult`, attempts and telemetry (04), work
orders (05).

## Interfaces/contracts created

- `CodingProblemSpec`, `RepositoryTemplate`, `Mutation` contracts (Zod, generated Pydantic
  for any worker-side runner).
- Workspace file-sync protocol (editor ↔ environment) and test-run events.

## Data/schema changes

D1 migration `0008`: `repository_templates`, `mutations`, `code_events`.

## Acceptance criteria

1. Isolation: two concurrent attempts cannot see each other's files; limits enforced;
   environment removed after grading.
2. Hidden tests never reach the browser (Playwright network capture).
3. Each mutation type validated across 10 seeds: baseline passes, mutated fails intended
   tests, reference fix passes.
4. Build-step hook demonstrated with a trivial compiled-language stub in tests.
5. Modern Python module published with ≥ 6 archetypes and lessons meeting the bar.
6. Coding attempts update mastery through the same Stage 06 path as labs.

## Automated test requirements

Provider integration tests; mutation property tests; grader tests; Playwright for edit →
run → submit.

## Manual QA requirements

Jacob completes the module and judges editor ergonomics and problem realism against the
Coding Workspace mockup.

## Security constraints

No network from attempt environments; banned-call constraints enforced by tests, not AI;
file size and count limits.

## Performance expectations

Visible test run round trip under 5 s; submit results under 30 s.

## Migration requirements

D1 `0008` with down script.

## Rollback requirements

Provider deployable independently; workspace route flagged.

## Known risks

- Editor/file-sync complexity; keep repositories small and sync whole files.
- Overfitting to Python; the compiled stub test guards this.

## Forbidden shortcuts

Grading in the browser; shipping hidden tests to the client; C++ "while we're here".

## Definition of done

- [ ] Acceptance 1–6; RFP §119 item 13 true.
- [ ] Milestone commit `feat(stage-07): coding lab runtime` and tag `stage-07`.
