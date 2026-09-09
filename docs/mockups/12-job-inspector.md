# 12-job-inspector

REFERENCE ONLY: `docs/mockups/12-job-inspector.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/12-job-inspector.png
```

## Purpose

Paste/import a job posting and review it like a PR diff against the learner profile:
extracted requirements, evidence, blockers, gap-closing lessons/labs, and a generated
training plan.

## Stage

Stage 10 (posting import via work order); the diff view reads Stage 06 data.

## Visual Reference

`12-job-inspector.png` (strongest screen; keep its structure).

## Shell

Canonical (this mockup already uses it).

## Layout

- Header: company/role, location, `HM-JOB-META-001`, imported date, source, linked
  canonical profile; actions `save as target`, `refresh posting`, `generate training
plan`.
- Left: posting `Raw | Parsed`.
- Center: requirements table (requirement, type, target, current with confidence,
  evidence, gap, `BLOCKER`); training plan (checklist of HiveMind work items) with a
  diff-style summary.
- Right: match summary with confidence and disclaimer, hard blockers, strengths, key gaps,
  certification alignment.

## Required Data

Posting text, parsed requirements (from a work order import, schema-validated), skill
states, canonical profile inheritance, plan items with ids, certification mappings.

## Lifecycle States

Posting freshness; plan item states `now/next/later/done`.

## Confidence Rules

Match uses full `ConfidenceScore`; impact shown as a range or label; disclaimer line.

## AI Execution

Parsing is a `career.import_posting` work order in external mode; the page imports its
result. Badge shown next to `Parsed`.

## Learner Safety / Leakage

None.

## Corrections From Mockup

- "Estimated role-readiness impact 71% → ~84%" → `likely +10–15%`.
- Add execution badge and `import result` state for parsing.
- Plan items reference HiveMind ids (`HM-LESSON-…`, archetypes), never external courses as
  work items.

## Keyboard Shortcuts

`Ctrl+V` in the raw pane triggers import; `t` add as target; `g` generate plan.

## Empty States

No posting: paste area with `import`.

## Error States

Parse result missing fields → inline list; posting URL unreachable → freshness `stale`.

## Acceptance Criteria

1. Import → diff → plan without any API call in external mode.
2. Blockers reflect hard-requirement gates from the canonical profile.
