# 04-course-workspace

REFERENCE ONLY: `docs/mockups/04-course-workspace.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/04-course-workspace.png
```

## Purpose

Technical documentation browser for a course: module tree, lesson content, and a right
rail with lab, skills, references, and mastery. Not a course-marketing page.

## Stage

Stage 01 (`Lesson`, `Sources` tabs, tree, versions); `Lab` in Stage 04; `Mastery` in
Stage 06; `Notes` in Stage 05.

## Visual Reference

`04-course-workspace.png`.

## Shell

Canonical. Status bar: content version, QA state, lesson id.

## Layout

- Left: course tree (courses › modules › lessons › labs/assessments) with QA-state dots.
- Center: lesson (compiled Markdown render tree, D-044) with numbered sections, callouts,
  tables, diagrams; prev/next.
- Right: tabs `Lesson | Lab | Notes | Sources | Mastery`.
  - Lesson: objectives checklist, estimated time, prerequisites.
  - Lab: related archetypes with `launch` (Stage 04).
  - Sources: references with trust tier and provenance claims count.
  - Mastery: skills in this lesson with `ConfidenceScore` compact.
- Header: breadcrumb, `LESSON 3 · HM-LESSON-BGP-03`, version + QA badge, `create work
order` action.

## Required Data

Course version, module, compiled lesson tree, metadata (skills, objectives, difficulty, time),
claims with source ids, related archetypes, learner notes, skill states.

## Lifecycle States

QA states on the badge; only `published` content is shown to the learner by default.

## Confidence Rules

Skill bars in Mastery tab use the compact `ConfidenceScore`; "Lesson progress 4/7" is a
checklist count, not mastery.

## AI Execution

`create work order` opens the Work Order panel with lesson context (`lesson.update`).

## Learner Safety / Leakage

Lab tab shows archetype names and difficulty, never faults.

## Corrections From Mockup

- Add version + QA badge and provenance markers on claims (superscript source refs).
- Skill bars → `ConfidenceScore`.
- References: show trust tier (`official`, `vendor`, `secondary`, `internal`) and
  `external · not ingested` for books; "BGP Deep Dive (Book)" is a notes-only source.
- Add `create work order` action; remove "Lab Host Online" duplication in the top bar.

## Keyboard Shortcuts

`j`/`k` next/previous lesson, `t` toggle tree, `1..5` right-rail tabs.

## Empty States

No published lessons: `no published content · run hivemind content publish`.

## Error States

Content version missing → inline error with the requested version id.

## Acceptance Criteria

1. Gold-standard lesson renders from a compiled content version behind Access.
2. Claims link to sources; version and QA badge visible.
3. Tree reflects QA states; unpublished content hidden unless `author view` is on.
