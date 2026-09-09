# 06-career-matrix

REFERENCE ONLY: `docs/mockups/06-career-matrix.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/06-career-matrix.png
```

## Purpose

Competencies × roles heat map to compare readiness and find the highest-leverage gaps
across targets.

## Stage

Stage 06.

## Visual Reference

`06-career-matrix.png`.

## Shell

Canonical.

## Layout

- Tabs `Skill Readiness | Role Comparison | Domain View | Opportunity Fit`.
- Toolbar: skill search, domain filter, role selector, legend (five-step scale + low
  evidence overlay).
- Matrix: rows competencies/skills, columns roles (sticky first column and header);
  cells show value with overlay; `BLOCKING` glyph on gated cells.
- Right rail: selected role details, `your fit` with `ConfidenceScore`, top gaps,
  `generate training plan` (deterministic).

## Required Data

Selected roles, competency → skill mapping, skill states, per-role readiness snapshots,
gates.

## Lifecycle States

None.

## Confidence Rules

Cells: value + low-evidence overlay; hover shows full `ConfidenceScore`. Right-rail
readiness uses the full form; disclaimer line present.

## AI Execution

None.

## Learner Safety / Leakage

None.

## Corrections From Mockup

- Add low-evidence overlay and gate glyphs; "Your Readiness 58%" → full form.
- "Generate Training Plan" is deterministic (Stage 06 prescription), badge-free.
- Group rows by competency with collapsible domains.

## Keyboard Shortcuts

Arrow keys move the cell cursor; `Enter` opens the skill; `c` compare selected columns.

## Empty States

Fewer than two roles selected: `add a role to compare`.

## Error States

Snapshot missing for a role → column renders `no data` with `compute`.

## Acceptance Criteria

1. Matrix renders 25+ rows × 6 roles under 1 s with sticky headers.
2. Gates and low evidence visible; hover shows full confidence.
