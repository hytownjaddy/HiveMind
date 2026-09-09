# 22-settings

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

Learner identity, AI execution mode per feature, API executor configuration and budget,
data export/backup status, runtime pins, keyboard shortcuts.

## Stage

Stage 01 (identity, export); Stage 08 (AI modes, budget).

## Visual Reference

No dedicated mockup; a dense two-column settings table in the canonical shell.

## Shell

Canonical.

## Layout

- Sections as tables: `IDENTITY` (Access identity, learner id), `AI EXECUTION` (per
  feature: tutor, review, interview, coach → `external | api`; provider; model tiers;
  monthly ceiling; spend to date; kill switch), `DATA` (last D1 export, R2 retention,
  `export now`, recording retention 90 d, pinned recordings), `RUNTIMES` (pinned versions),
  `SHORTCUTS` (editable list), `ABOUT` (versions).

## Required Data

Learner, settings document, budget ledger, export history, runtime pins, shortcut map.

## Lifecycle States

None.

## Confidence Rules

None.

## AI Execution

This is where modes are chosen; default `external` everywhere; enabling `api` requires a
configured key and ceiling.

## Learner Safety / Leakage

API keys are write-only; never displayed.

## Corrections From Mockup

n/a.

## Keyboard Shortcuts

`?` opens the shortcut list from anywhere.

## Empty States

No API executor configured: `external mode · no API key`.

## Error States

Export failure → last successful export shown with `retry`.

## Acceptance Criteria

1. Switching a feature to `api` without a key is impossible; ceiling enforced.
2. Export status reflects the nightly job.
