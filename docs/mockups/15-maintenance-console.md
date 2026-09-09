# 15-maintenance-console

REFERENCE ONLY: `docs/mockups/15-maintenance-console.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/15-maintenance-console.png
```

## Purpose

Freshness/health console over courses, companies, jobs, sources, certifications, labs,
and runtimes; each item can generate a maintenance work order; batches are prepared here.

## Stage

Stage 10 (deterministic checks like source health and lab regression may arrive with
Stages 05 and 03).

## Visual Reference

`15-maintenance-console.png`.

## Shell

Canonical (mockup uses it).

## Layout

- Tabs by item type; filters (status, type, staleness, owner, tags); table (type, name,
  status chip, last checked, freshness, issues, actions).
- Right: selected item details, detected issues, `generate maintenance work order`,
  `re-check now` (deterministic checks only), `view historical diffs`, related items.
- Bottom: overview counts, items by type, recent activity, quick actions (`prepare
batch`, `check broken labs`, `check sources`, `view scheduled checks`).

## Required Data

Maintenance items with freshness policy, last checks, issues, workflow registry, batch
work orders, regression results.

## Lifecycle States

Freshness per UI-SYSTEM §5.

## Confidence Rules

Proposal confidence labels (`high/medium/low`) on imported proposals.

## AI Execution

`Run Full Refresh` → `prepare batch` (work order). Deterministic checks run server-side.

## Learner Safety / Leakage

None.

## Corrections From Mockup

- Rename `Run Full Refresh` → `prepare maintenance batch`; `Update All Sources` →
  `check sources` (deterministic) plus a batch for content refresh.
- Add execution badges on actions that create work orders.

## Keyboard Shortcuts

`w` generate work order for selection, `b` prepare batch, `/` filter.

## Empty States

`all items current`.

## Error States

Check failures show the check name and error; batch export failure shows path.

## Acceptance Criteria

1. Due computation matches the workflow registry schedules.
2. Batch work order executes in Claude Code and imports a change report.
