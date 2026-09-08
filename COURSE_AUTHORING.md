# Course Authoring Guide

Status: contract skeleton. Sections marked **TBD(stage)** are completed by that stage.
Governing decisions: D-003, D-004, D-010, D-011, D-013, D-014, D-022 invariants 1, 2, 6,
7, 10, 11.

## What a course is

A course is a versioned package under `content/courses/<domain>/<course>/` that references
skills from the global registry `content/skills/`, declares the capabilities its labs need,
and contains modules of lessons. Courses never define skills; they reference them.

```text
content/
  skills/<domain>/<skill>.yaml          global skill registry (versioned)
  sources/<domain>/<source>.yaml        source records with provenance and trust
  courses/<domain>/<course>/
    course.yaml                         manifest: id, version, prerequisites, skills, tracks, capabilities
    modules/<module>/module.yaml
    modules/<module>/lessons/<lesson>/
      lesson.mdx                        the lesson
      metadata.yaml                     objectives, skills, QA state, difficulty, estimated time
      questions.yaml                    knowledge checks and prediction questions
      claims.yaml                       factual claims with source provenance (RFP §35)
      labs/                             references to problem archetypes and guided labs
  careers/                              role profiles, companies, certifications
```

Schemas: `packages/hivemind-core` (Pydantic) → `schemas/*.json`. **TBD(1)**: exact field
lists.

## Lesson quality bar (RFP §110)

A publishable lesson contains: motivation, mental model, rigorous explanation, diagram,
worked example, common misconception, prediction question, guided exercise, real
demonstration, independent problem, reflection, mastery evaluation. The gold-standard lesson
authored in Stage 1 is the reference; compare against it, not against this list alone.

## Pipeline (D-010, RFP §108)

```text
DRAFT → TECHNICAL_REVIEW → INSTRUCTIONAL_REVIEW → EXECUTION_TEST → APPROVED → PUBLISHED
```

- Drafts are produced by Claude Code executing a work order (`course.create`,
  `module.add`, `lesson.add`, `lesson.update`, `course.audit`, `sources.refresh`).
- Technical review checks commands, protocol behavior, defaults, terminology against
  approved sources; flagged claims become review items.
- Instructional review checks clarity, progression, cognitive load, misconception coverage.
- Execution test runs any claim that can be verified in a lab (RFP §34 stage 10).
- Jacob approves in the review queue. Publishing creates an immutable course version.

**TBD(5)**: review queue UI, reviewer checklists, work-order templates.

## Source policy (D-011, RFP §33)

Ingest and cite: RFCs, standards, official and vendor documentation, certification
objectives, high-quality free material, Jacob's notes. Paid books and courses may inform
Jacob's own notes and curriculum decisions. Never ingest or reproduce their transcripts or
text. Every factual claim carries provenance in `claims.yaml`. Conflicts between sources are
surfaced as `SOURCE CONFLICT`, never silently resolved.

## Versioning (invariants 6–7)

Courses and skills use semantic versions. A learner's attempts reference the course, skill,
and grader versions in force at the time; new versions never rewrite history. Deprecation
follows `ACTIVE → DEPRECATED → ARCHIVED` with migration notes.

## Authoring with work orders (D-009)

Prompts stay short because the repository carries the rules:

```text
Execute HiveMind Work Order HM-WO-0184.
Follow CLAUDE.md, COURSE_AUTHORING.md, and the referenced schemas.
```

**TBD(1)**: `hivemind work` CLI and the work-order YAML schema. **TBD(5)**: template
catalogue.
