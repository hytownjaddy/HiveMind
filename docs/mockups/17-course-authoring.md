# 17-course-authoring

REFERENCE ONLY: `docs/mockups/17-course-authoring.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/17-course-authoring.png
```

## Purpose

IDE for curriculum: course tree, lesson editor with front matter, skill mappings, sources,
linked labs, QA state, validation checks, and Claude-generated drafts shown as diffs for
approval.

## Stage

Stage 05.

## Visual Reference

`17-course-authoring.png`.

## Shell

Canonical (mockup uses it). Marked `author view`.

## Layout

- Left: course structure tree with QA-state dots; `add`.
- Center: tabs `Edit | Preview | Proposed Changes | Sources | Skill Mapping | Lab | QA`;
  Monaco editor for MDX with front matter; bottom `PROPOSED CHANGES (review & apply)` diff
  (current vs proposed) with `reject` / `apply`.
- Right: lesson properties (id, QA state per §108, owner, version, time, difficulty, tags),
  skill mappings, linked lab, source references, `VALIDATION / QA` checklist with `run
checks`.
- Header actions: `preview`, `save`, `create work order` (replaces "Generate with Claude").

## Required Data

Course package files, lesson metadata, skills, sources, archetypes, QA states, validation
results, proposed change sets (from work-order imports), git status.

## Lifecycle States

QA states per §108; edits create a new draft version.

## Confidence Rules

None.

## AI Execution

External: `create work order` → Claude Code edits files → proposed changes appear as a
diff for approval. No inline generation.

## Learner Safety / Leakage

Author view may show faults and solutions for linked labs.

## Corrections From Mockup

- `Generate with Claude` → `create work order`; `AI Assist` tab → `Proposed Changes`.
- Status dropdown values → §108 states.
- `Owner: jacob` → learner id; `Version 0.3.0` retained.

## Keyboard Shortcuts

`Ctrl+S` save draft, `Ctrl+Shift+V` preview, `Ctrl+Enter` run checks, `a` apply diff.

## Empty States

No proposed changes: `no pending proposals · create a work order`.

## Error States

Validation failures listed with file/line; git conflict → banner with `reload`.

## Acceptance Criteria

1. Apply creates a commit-ready change in `content/` and a review item.
2. QA state transitions enforced by the API.
