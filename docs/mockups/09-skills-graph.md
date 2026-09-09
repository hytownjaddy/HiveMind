# 09-skills-graph

REFERENCE ONLY: `docs/mockups/09-skills-graph.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/09-skills-graph.png
```

## Purpose

Knowledge graph explorer: domains → skills → prerequisites with mastery, confidence,
retention risk, evidence history, related labs, sources, job relevance.

## Stage

Stage 06 (mastery data); graph rendering may start in Stage 01 with static registry data.

## Visual Reference

`09-skills-graph.png` (the reference for number presentation across the app).

## Shell

Canonical.

## Layout

- Toolbar: view `Graph | Tree | Domains`, domain filter, show filter, search, fit.
- Left: graph canvas with minimap; node states mastered/proficient/in_progress/not_started.
- Center: selected skill: breadcrumb, id, description, tabs `Overview | Evidence | Labs |
Sources | Jobs | Notes`; summary row (mastery, confidence, last practiced, retention risk)
  using `ConfidenceScore` full form; prerequisites with state; related skills; actions
  `practice this skill`, `add to training queue`.
- Right rail: mastery timeline (sparkline), recent evidence table, related learning,
  job relevance (role weights).

## Required Data

Skill registry with versions and prerequisites, skill states, mastery history,
attempts per skill, archetypes per skill, sources per skill, role weights per skill.

## Lifecycle States

None.

## Confidence Rules

Full form on the summary; compact in tables; retention risk labelled `low/medium/high`
with the review-due date.

## AI Execution

None.

## Learner Safety / Leakage

None.

## Corrections From Mockup

- Job relevance percentages → role weight labels (`critical/high/medium`) with the raw
  weight on hover.
- Identifiers on evidence rows (`HM-LAB-…`).

## Keyboard Shortcuts

`/` search, arrows move selection in tree view, `p` practice, `q` queue.

## Empty States

Skill with no evidence: `no evidence · mastery unseen`.

## Error States

Graph load failure: inline error with `reload registry`.

## Acceptance Criteria

1. Graph renders 300 skills at 60 fps pan/zoom; tree and domain views share selection.
2. Every number shown with confidence and evidence.
