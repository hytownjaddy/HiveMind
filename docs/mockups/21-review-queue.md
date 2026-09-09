# 21-review-queue

REFERENCE ONLY: `docs/mockups/17-course-authoring.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/17-course-authoring.png
```

## Purpose

Jacob's five-hours-a-week surface: a queue of items awaiting human review (lessons,
problems, sources, proposals, work-order results) with diffs, checklists, validation
results, and approve/reject/request-changes actions.

## Stage

Stage 05.

## Visual Reference

No dedicated mockup. Use `14-work-orders.png` for the list/detail structure and
`17-course-authoring.png` for the diff pane.

## Shell

Canonical. Marked `author view`.

## Layout

- Left: queue table (id `HM-RVW-nnnn`, type chip, title, QA state, validation status, age,
  source work order).
- Right: item detail with tabs `Diff | Checklist | Validation | Context | Comments`;
  checklist per item type (technical, instructional, adversarial for lessons; pipeline
  results for problems; policy for sources); actions `approve`, `request changes`,
  `reject`, each requiring a comment for non-approve.
- Header: counts by type and age; `next item` action.

## Required Data

Review items, linked entities and versions, diffs, checklists, validation runs, comments,
publish action.

## Lifecycle States

Review item: `open`, `changes_requested`, `approved`, `rejected`; entity QA states.

## Confidence Rules

Proposal confidence labels shown for imported AI proposals.

## AI Execution

Items originate from work orders; the queue itself has no AI actions.

## Learner Safety / Leakage

Author view may show faults/solutions.

## Corrections From Mockup

n/a.

## Keyboard Shortcuts

`j/k` items, `a` approve, `x` request changes, `n` next, `d` diff toggle.

## Empty States

`queue empty`.

## Error States

Publish failure shows the compile error inline.

## Acceptance Criteria

1. Ten mixed items reviewable in under an hour (timed session).
2. No entity reaches `published` without passing through the queue.
