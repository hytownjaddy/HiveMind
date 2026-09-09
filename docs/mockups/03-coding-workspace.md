# 03-coding-workspace

REFERENCE ONLY: `docs/mockups/03-coding-workspace.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/03-coding-workspace.png
```

## Purpose

IDE-style workspace for coding problems: repository tree, Monaco editor, terminal, test
runner, instructions, runtime state. First problem class: repair an async worker.

## Stage

Stage 07.

## Visual Reference

`03-coding-workspace.png`.

## Shell

Canonical. Status bar: `HM-LAB-829143`, lifecycle, connection, provider (`sandbox` |
`worker`), runtime version, resource limits, timer.

## Layout

- Left: file tree (repository), below it the course tree collapsed.
- Center: editor tabs; bottom tabs `Terminal | REPL | Test Output | Logs`.
- Right: tabs `Instructions | Tests | Runtime | Notes | References`; `Test Results` pane
  with `run tests` and `submit`.

## Required Data

Problem instance (repository template version, mutations hidden), file list and contents
(sync protocol), visible test list with last results, hidden test count, constraints
(time, memory, banned calls), lint results, runtime state, hint tiers with caps.

## Lifecycle States

§86 states; editor enabled in `ready`/`active`; `grading` locks files until results.

## Confidence Rules

None during the attempt.

## AI Execution

`Export context for Claude` (files diff, failing tests, instructions). No inline AI in
external mode.

## Learner Safety / Leakage

Hidden tests appear only as a count (`hidden: 3`) with no names; mutations and reference
fix never sent to the client; `Solution (locked)` item removed from navigation.

## Corrections From Mockup

- Remove `test_hidden_timeout_case` name from Test Results; show the count row.
- Remove the `Solution (locked)` sidebar entry.
- Hints show tier and mastery cap.
- Runtime tab shows provider class and the build-step slot (empty for Python).
- Identifier `HM-3102` → `HM-LAB-…`.

## Keyboard Shortcuts

`Ctrl+S` save (sync), `Ctrl+Enter` run visible tests, `Ctrl+Shift+Enter` submit,
`` Ctrl+` `` terminal, `Ctrl+P` file switcher, `Ctrl+Shift+E` export context.

## Empty States

No files (template failed): inline error with `re-provision`. No test results yet:
`not run`.

## Error States

Sync conflict → banner with `reload from environment`; runtime OOM/timeout → Test Output
shows the limit that was hit.

## Acceptance Criteria

1. Edit → run → submit path works on the Class A provider; hidden tests never reach the
   browser (network capture).
2. Concurrent attempts are isolated; environment removed after grading.
3. Constraints violations are reported by tests, not by AI.
