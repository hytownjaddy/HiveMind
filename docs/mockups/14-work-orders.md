# 14-work-orders

REFERENCE ONLY: `docs/mockups/14-work-orders.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/14-work-orders.png
```

## Purpose

Developer task queue for Claude work orders: list, detail with prompt, files, tests,
logs, history, and the external-execution actions. GitHub Issues plus CI.

## Stage

Stage 01 (panel: create, copy, export, list); Stage 05 (full queue, validation, batches).

## Visual Reference

`14-work-orders.png`.

## Shell

Canonical (mockup uses it).

## Layout

- Header: `CLAUDE WORK ORDERS`, `new work order`, `bulk actions`, filters.
- Status tabs with counts: all, draft, exported, in_progress, implemented,
  validation_failed, review_required, approved, done.
- Left: table (id, type, title, target, execution badge, status, updated).
- Right detail: id, status chip, priority, type, target skill/course, requested by,
  execution (`external`), repository path under `content/` or code path, labels,
  dependencies, effort; tabs `Overview | Prompt | Files | Validation | Change Report |
History`; actions `copy for Claude`, `export .md`, `mark implemented`, `validate`,
  `approve`.
- Bottom: generated prompt (read-only, regenerate from context), files touched, validation
  checklist with last results, activity log (from imports and CLI, not from an agent).

## Required Data

Work orders (schema), templates, context assembly inputs, validation runs, change
reports, review items link, git refs.

## Lifecycle States

Work-order states per UI-SYSTEM §5; batches share the states.

## Confidence Rules

None.

## AI Execution

External default throughout; no assignee, no agent logs. `api` mode not applicable to
work orders in V1.

## Learner Safety / Leakage

Work orders never contain secrets; prompt preview is redacted.

## Corrections From Mockup

- Statuses `pending/review/completed/blocked` → canonical states.
- Remove `Assignee: Claude (Sonnet 4)` and agent log lines (`Claude agent initialized`).
- `Repository: hivemind-labs` → monorepo path.
- `Run Tests` → `validate` (runs `hivemind work validate`).
- Add `Change Report` tab and batch grouping.

## Keyboard Shortcuts

`n` new, `c` copy for Claude, `e` export, `v` validate, `j/k` rows.

## Empty States

`no work orders · create one from any lesson, skill, or maintenance item`.

## Error States

Validation failure shows the failing step with `open logs`; export failure shows the path.

## Acceptance Criteria

1. Exported file executes in Claude Code from the file alone.
2. State transitions enforced; validation results persisted.
