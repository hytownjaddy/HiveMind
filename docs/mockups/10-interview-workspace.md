# 10-interview-workspace

REFERENCE ONLY: `docs/mockups/10-interview-workspace.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/10-interview-workspace.png
```

## Purpose

Engineering assessment console: question/ticket, an environment (terminal, editor,
whiteboard) and notes, timer, rubric. Mock interviews run in the learner's Claude session
by default; the console captures environment and imports results.

## Stage

Stage 08.

## Visual Reference

`10-interview-workspace.png`.

## Shell

Canonical. Status bar: `HM-INT-00412`, question n/m, timer, execution badge.

## Layout

- Left: tabs `Question | Requirements | Hint | Discussion`; environment details;
  evaluation criteria.
- Center: tabs `Topology | Terminal | Config Editor | Packet Capture | Whiteboard` (per
  question type; whiteboard is the §65 canvas, later).
- Right: `Notes | My Approach | Resources | Rubric`; rubric rows show `not rated` until a
  result is imported; `feedback (after session)` pane; `submit answer`.
- Header: `conduct in Claude` (copies the interview prompt pack), `import results`,
  `end session`, `reset environment`.

## Required Data

Interview session, role profile rubric, question families, optional lab session per
question, timer, transcript/result import schema, methodology/interview scores.

## Lifecycle States

Interview: `scheduled`, `active`, `awaiting_result`, `scored`, `abandoned`; embedded lab
uses §86.

## Confidence Rules

Interview readiness shown after import with confidence based on sessions count.

## AI Execution

External default: no live rubric evaluation; `api` mode may enable a live interviewer
pane labelled `api`.

## Learner Safety / Leakage

Question environments hide faults like labs; rubric details visible (they are the
assessment criteria, not the answer).

## Corrections From Mockup

- "Interviewer Rubric (Live) · Auto-evaluating" → rubric rows `not rated` until import;
  add execution badge.
- "Live Session" chip → interview lifecycle chip.
- Add `conduct in Claude` / `import results` actions.
- Identifier `HM-INT-0042` → `HM-INT-00412`.

## Keyboard Shortcuts

`Ctrl+Enter` submit answer, `n` next question, `` Ctrl+` `` terminal.

## Empty States

No interview profile for the role: `create interview profile` (work order).

## Error States

Import schema mismatch → inline error listing missing fields.

## Acceptance Criteria

1. Full mock interview completes in external mode with imported scores.
2. Interview scores update interview readiness only (never skill mastery).
