# 19-certifications

REFERENCE ONLY: `docs/mockups/19-certifications.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/19-certifications.png
```

## Purpose

Certification blueprints mapped onto HiveMind skills: coverage, mastery, lab readiness,
weak domains, readiness estimate with confidence; exam metadata; pointers to official
material.

## Stage

Stage 08.

## Visual Reference

`19-certifications.png` shows the **rejected** card/hero layout. Use `12-job-inspector.png` as the structural reference:
a requirements-vs-evidence table per certification.

## Shell

Canonical.

## Layout

- Left: certifications table (name, vendor, level, relevance to active target, coverage,
  mastery with confidence, lab readiness, status).
- Right/center for the selected cert: exam metadata table; objectives table (objective,
  mapped skills, mastery with confidence, evidence, gap); weak domains; `practice biggest
gap`; official resources as tagged pointers.

## Required Data

Certification blueprints (versioned), objective → skill mappings, skill states, role
relevance, exam metadata, sources.

## Lifecycle States

Blueprint freshness.

## Confidence Rules

Coverage is a count-based percentage; mastery and readiness use `ConfidenceScore`;
readiness labelled `not ready / borderline / ready` with the numbers.

## AI Execution

Blueprint refresh is a work order.

## Learner Safety / Leakage

None.

## Corrections From Mockup

- Remove hero image, quote, KPI cards, card grid, "Popular"/"In Demand" badges, progress
  bars, external course logos (Udemy, YouTube) as content.
- Replace with the table layout above; official resources as `external · not ingested`
  pointers.

## Keyboard Shortcuts

`/` filter, `p` practice gap.

## Empty States

`no certifications mapped · add a blueprint (work order)`.

## Error States

Blueprint stale → freshness chip with `refresh via work order`.

## Acceptance Criteria

1. Coverage report lists uncovered objectives as curriculum gaps.
2. No forbidden elements.
