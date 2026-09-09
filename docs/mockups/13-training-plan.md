# 13-training-plan

REFERENCE ONLY: `docs/mockups/13-training-plan.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/13-training-plan.png
```

## Purpose

Technical backlog for the active target: `NOW / NEXT / LATER` work items (lessons, labs,
incidents, interviews, projects) with dependency, role impact, effort, and due/review
state.

## Stage

Stage 06 (prescription), extended by Stages 08–10.

## Visual Reference

`13-training-plan.png`.

## Shell

Canonical (mockup uses it).

## Layout

- Header: target, plan version, created/updated, `export plan`, `regenerate` (deterministic).
- Tabs `Backlog | Weekly Schedule | Environments | Milestones`.
- Backlog: three sections NOW / NEXT / LATER; rows: id, item (HiveMind entity), type chip
  (`lesson`, `lab`, `incident`, `interview`, `project`, `review`), skill, dependency,
  role impact label, effort, due/review state, action.
- Right: expected impact as labels/ranges; milestones checklist; external resources
  (pointers only, tagged); `start next task`.

## Required Data

Plan items with ids and dependencies, readiness snapshot, spaced-repetition due items,
milestones, external resource pointers.

## Lifecycle States

Item states: `now`, `next`, `later`, `in_progress`, `done`, `blocked`.

## Confidence Rules

Impact as ranges/labels; readiness with confidence.

## AI Execution

None (plan is computed). `regenerate` is deterministic.

## Learner Safety / Leakage

None.

## Corrections From Mockup

- Replace INE/EVE-NG/Udemy work items with HiveMind items; move externals to a tagged
  pointer list.
- "71% → 84%" and "+40%" → labels/ranges.
- Priority chips → role impact labels; add dependencies column; group into NOW/NEXT/LATER.

## Keyboard Shortcuts

`Enter` start item, `d` mark done, `1/2/3` move to NOW/NEXT/LATER.

## Empty States

No target: `select a target to generate a plan`.

## Error States

Prescription failure → inline error with the algorithm version.

## Acceptance Criteria

1. Every item resolves to a HiveMind entity id.
2. Spaced-repetition due items appear in NOW automatically.
