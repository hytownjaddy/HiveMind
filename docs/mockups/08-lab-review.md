# 08-lab-review

REFERENCE ONLY: `docs/mockups/08-lab-review.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/08-lab-review.png
```

## Purpose

Post-lab review as a CI run/postmortem: objectives, grader output, command log, config
diffs, timeline, unsafe actions, skill evidence deltas, and the next action.

## Stage

Stage 04 (deterministic review), Stage 06 (mastery deltas), Stage 08 (AI methodology,
external mode).

## Visual Reference

`08-lab-review.png`.

## Shell

Canonical. Status bar: session id, seed, versions, duration, final lifecycle chip.

## Layout

- Header: `LAB REVIEW · HM-LAB-829143`, lifecycle chip (`completed`/`failed`), grade,
  actions `re-run same seed`, `re-run new seed`, `open workspace`, `export context`.
- Summary row as a compact table (score, objectives passed, time vs target, hints used
  with cap applied, resets, status).
- Tabs `Overview | Timeline | Command Log | Config Diffs | Grader Output | Metrics | Skill
Evidence | Methodology (AI) | Next Steps`.
- Overview: objective results table; final topology; relevant config diff (intended vs
  yours); command log excerpt; skill evidence deltas with confidence.
- Methodology (AI): separate pane tagged `AI`, empty in external mode until a result is
  imported (`copy review prompt` → `import result`).

## Required Data

Attempt (immutable), grade result per objective, telemetry events, recording reference,
config snapshots (baseline/final), mastery updates with algorithm version, hint usage,
recommended next actions, optional AI review result.

## Lifecycle States

`completed`, `failed`, `destroyed`.

## Confidence Rules

Skill evidence deltas show mastery before/after with confidence and evidence count.

## AI Execution

External by default: `copy review prompt` (scenario, redacted command log, grader output,
diff, rubric) and `import result`; in `api` mode the pane fills automatically, labelled.

## Learner Safety / Leakage

After completion the reference approach may be shown; the fault module name may be shown
only after a passing grade or explicit reveal; unfinished sessions show nothing.

## Corrections From Mockup

- "Hints used 2 (-10% each)" → "2 hints · mastery gain capped at X%".
- Remove "Good discipline" and similar adjectives.
- Split "What Went Well / Areas to Improve" into the AI Methodology tab; the Overview
  keeps deterministic results only.
- Score cards → summary table row.

## Keyboard Shortcuts

`1..9` tabs; `d` toggle diff side-by-side/inline; `Ctrl+Shift+E` export context.

## Empty States

Grading in progress: `grading…` with the lifecycle chip; no AI result: `import result`.

## Error States

Grader error → Grader Output tab shows the error and `re-run grading`.

## Acceptance Criteria

1. Attempt rows are immutable; review reads only stored results.
2. Deterministic and AI sections are visually and structurally separate.
3. Command log and diffs render redacted recordings.
