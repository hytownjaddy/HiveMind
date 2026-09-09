# 07-problem-forge

REFERENCE ONLY: `docs/mockups/07-problem-forge.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/07-problem-forge.png
```

## Purpose

Configure and run problem generation like a build/test job: skills, environment,
scenario parameters, constraints, seed → `generate & validate` → pipeline log → open in
workspace. Author view additionally shows faults and validation internals.

## Stage

Stage 03 (author view, CLI parity); learner Practice view in Stage 06.

## Visual Reference

`07-problem-forge.png` (preferred numbered-steps layout); `07a-problem-forge-alt.png` for
the preview pane only.

## Shell

Canonical. Status bar: last generation id, provider class, worker availability.

## Layout

- Tabs `Configure | Templates | History | Coverage | Documentation`.
- Configure: four numbered panes (Skills tree with selected chips; Environment: runtime,
  topology class, size, base configuration, toggles; Scenario: difficulty, fault count,
  ambiguity, problem type, seed with `random`; Constraints: requirements/exclusions as
  structured tags, not free text sent to AI).
- Right rail: `RECENT GENERATIONS` table; `COVERAGE & DIVERSITY`; `GENERATION OUTPUT` log
  listing the §46 pipeline steps with pass/fail and durations; actions `open in lab
workspace`, `export spec`.
- `preview (dry run)` renders topology and objectives without provisioning.

## Required Data

Skill registry, archetype registry with variation dimensions, capability → provider
availability, difficulty ratings, coverage/diversity metrics, generation history
(instance id, seed, versions, validation status), pipeline run logs.

## Lifecycle States

Generation run states: `queued`, `validating`, `valid`, `failed`; instances link to
sessions with §86 states.

## Confidence Rules

Coverage bars show counts (`36 / 50`), not percentages of mastery.

## AI Execution

None. Generation is procedural. Constraints that require authoring (new archetype) become
a `problem.create` work order via `request archetype`.

## Learner Safety / Leakage

Learner view hides `Sample Faults`, fault count specifics beyond a range, and pipeline
internals; author view (badge `author view`) shows them.

## Corrections From Mockup

- Remove "Sample Faults (hidden in lab)" from the learner preview; keep in author view.
- Constraints become structured tags; no free-text prompt to an AI.
- Output log shows the seven §46 steps explicitly.
- Identifiers `HM-48291` → instance ids; sessions → `HM-LAB-…`.

## Keyboard Shortcuts

`Ctrl+Enter` generate & validate; `Ctrl+Shift+P` preview; `r` new random seed.

## Empty States

No archetypes for the selected skill: `no archetype · request one` (creates work order).

## Error States

Validation failure shows the failing step, seed, and `retry with new seed` /
`open logs`.

## Acceptance Criteria

1. CLI and UI produce identical instances for the same inputs and seed.
2. Pipeline log matches `hivemind problem validate` output.
3. Learner view leaks no fault information (DOM/network check).
