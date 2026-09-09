# Stage 03 — Problem engine, faults, graders, validation

## Purpose

Turn ProblemSpecs into reproducible, validated, gradeable problems: seeded instantiation,
topology and narrative variation, fault modules (Linux 10, BGP 10), deterministic graders,
reference solutions, the RFP §46 validation pipeline, and regression suites. Ship enough
archetypes that Linux Networking and BGP can be practised with real variety.

## User-visible outcome

`hivemind problem new bgp.wrong_local_pref --seed 42` instantiates a validated problem;
`hivemind lab up --problem <instance>` brings up the broken environment; running the
reference solution and `hivemind problem grade` returns a passing `GradeResult`; the same
seed reproduces the same problem tomorrow. `hivemind problem validate --all` reports
pass/warn/fail for every archetype.

## In scope

- Instantiation: seed → variation choices → rendered topology → fault parameters →
  narrative → objectives; `ProblemInstance` persisted with all versions and spec hash.
- Fault module API and library: Linux (`bad_permissions`, `disk_full`, `dns_failure`,
  `bad_route`, `systemd_failure`, `port_collision`, `resource_exhaustion`, `wrong_mtu`,
  `firewall_block`, `bad_interface_config`), BGP (`wrong_local_pref`, `invalid_next_hop`,
  `route_filter`, `missing_advertisement`, `bad_as_path_policy`, `session_failure`,
  `wrong_med`, `missing_network_statement`, `rr_client_misconfig`, `ebgp_multihop`).
- Grader API and library: final-state checks with per-objective results and evidence;
  "unrelated systems unchanged" checks; versioned manifests.
- Reference solutions as scripts executed by the worker.
- Validation pipeline CLI with seed sweeps; regression suite storing canonical seeds.
- Hint tiers per archetype with mastery-cap metadata (D-016; consumed by Stage 06).
- Problem review queue items created on `hivemind work validate` for new/changed problems.
- Work-order templates `problem.create`, `fault.create`, `problem.diversify`, `lab.repair`,
  `grader.review`.

## Explicitly out of scope

- Workspace UI, hints display, submit button (Stage 04).
- Mastery updates and difficulty calibration (Stage 06); difficulty is authored here.
- Coding mutations (Stage 07).
- IS-IS/MPLS/DC fault libraries (Stage 09).

## Prerequisites / dependency stages

Stage 01 (contracts, work orders), Stage 02 (worker, providers, topology archetypes).

## Architecture decisions already locked

D-003 (generic contracts), D-012, D-013, D-014 (versioned everything), D-016, D-021,
invariants 3, 4, 5, 8.

## Files/modules owned by this stage

`services/lab-worker/hivemind_worker/faults/**`, `.../graders/**`, `.../solutions/**`,
`packages/core/src/problems/**`, `content/problems/linux/**`, `content/problems/bgp/**`,
`content/topologies/**` (additions), `LAB_AUTHORING.md` TBD(3).

## Interfaces/contracts consumed

`ProblemSpec`, `ProblemInstance`, `Grader` manifest, `GradeResult`, worker protocol,
topology renderer, work orders, review items.

## Interfaces/contracts created

- Fault module Python API (`declare`, `preconditions`, `inject`, `verify`).
- Grader Python API (`grade(snapshot) -> GradeResult`) and manifest format.
- `hivemind problem new|validate|grade|list` CLI.
- Regression seed registry format.

## Data/schema changes

D1 migration `0004`: `problem_archetypes`, `fault_modules`, `graders`, `problem_instances`
(filled), `validation_runs`, `hint_tiers`.

## Acceptance criteria

1. 10 Linux and 10 BGP fault modules, at least 4 Linux and 4 BGP archetypes, each passing
   the full §46 pipeline for 25 seeds.
2. Same seed + same versions → identical spec hash and identical rendered environment
   (hash of node configs).
3. Grader rejects an "unrelated route removed" solution for every BGP archetype; accepts
   at least two distinct valid repairs for at least half of them.
4. A deliberately broken archetype fails validation with an actionable report.
5. Regression suite runs in CI (nightly on the Linux runner) and blocks publishing on failure.
6. A `problem.create` work order executed by Claude Code from the file alone yields a
   validated archetype with tests (dry run performed by Jacob once).

## Automated test requirements

Unit tests per fault and grader with recorded snapshots; property tests for
instantiation determinism; pipeline integration tests per archetype (nightly); grader
mutation tests (grader must fail on unfixed baseline).

## Manual QA requirements

Jacob solves at least three Linux and three BGP problems from the CLI, judges realism and
ambiguity, reviews hint tiers, and approves archetypes in the queue.

## Security constraints

Faults only run inside labs; reference solutions execute on the worker within the session
sandbox; graders are read-only against snapshots.

## Performance expectations

Instantiation under 1 s; validation of one seed under 3 min for BGP; grading under 10 s.

## Migration requirements

D1 migration `0004` with downgrade; archetype/fault/grader versions are additive.

## Rollback requirements

Publishing an archetype version is reversible by unpublishing; instances already attempted
keep their versions forever (invariant 9).

## Known risks

- Graders that encode one solution path; mitigate with alternate-repair tests.
- FRR timing (convergence) making checks flaky; graders wait on state with bounded polling.
- Fault realism drift from authored difficulty; Stage 06 recalibrates.

## Forbidden shortcuts

Grading by command history; hard-coding node names into graders; skipping the reference
solution; publishing without the pipeline.

## Definition of done

- [ ] Acceptance 1–6 pass; nightly job green twice in a row.
- [ ] `LAB_AUTHORING.md` TBD(3) filled; templates documented in `COURSE_AUTHORING.md`.
- [ ] Milestone commit `feat(stage-03): problem engine and validation` and tag `stage-03`.
