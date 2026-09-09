# Course Authoring Guide

Status: Stage 01 contract. Sections marked **TBD(stage)** are completed by that stage.
Governing decisions: D-003, D-004, D-010, D-011, D-013, D-014, D-022 invariants 1, 2, 6,
7, 10, 11; D-042 (gold lesson); D-044 (lesson format, proposed).

## What a course is

A course is a versioned package under `content/courses/<domain>/<course>/` that references
skills from the global registry `content/skills/`, declares the capabilities its labs need,
and contains modules of lessons. Courses never define skills; they reference them.
`hivemind content compile` validates the tree against the canonical contracts in
`packages/schema` (`schemas/*.schema.json`) and produces a `ContentBundle`;
`hivemind content publish` stores it as an immutable content version.

```text
content/
  skills/<domain>/<file>.yaml           SkillDefinition (id, version, prerequisites, related …)
  sources/<domain>/<file>.yaml          SourceRecord (kind, trust_tier, url, ingested …)
  careers/roles/<file>.yaml             RoleProfile   (validated, not bundled; Stage 06 uses them)
  careers/competencies/<file>.yaml      Competency
  courses/<domain>/<course>/
    course.yaml                         CourseManifest minus derived fields; `modules:` lists module dirs in order
    modules/<nn>-<slug>/module.yaml     id, title, summary, `lessons:` lesson dirs in order, optional skill_ids
    modules/<nn>-<slug>/lessons/<nn>-<slug>/
      lesson.md                         the lesson body (see below)
      metadata.yaml                     id, version, slug, title, summary, qa_state, review, objectives,
                                        skill_ids, prerequisite_lesson_ids, difficulty, estimated_minutes, labs
      questions.yaml                    Question[] without lesson_id (prediction, knowledge_check, reflection, mastery)
      claims.yaml                       Claim[] without lesson_id: statement, source_ids, verification
```

Derived by the compiler, never authored: `module_ids`, `lesson_ids`, `order` (directory
lists), `uses_labs` (any lesson with `labs`), `source_ids` on a lesson (union of its claims'
sources), `source_path`, `body_hash`, `content_hash`. Every skill, source, competency, and
lesson id referenced anywhere must exist; the compiler fails otherwise. Ids:
`HM-LESSON-<course>-<nn>` for lessons, `<course>` slug for courses, `<course>.<slug>` for
modules, `domain.area.skill` for skills, `src.<slug>` for sources.

## The lesson body (D-044)

`lesson.md` is CommonMark + GFM plus a fixed directive set. It is compiled to a render tree
(`LessonSection[]`, contracts `BlockNode` and `InlineNode`); nothing is evaluated at render
time and no JSX exists.

`~~~markdown

## Why routes decide everything {#motivation} one `##` per RFP §110 element, any order

### Sub-heading ### and #### allowed inside a section

Body text with **strong**, _emphasis_, `code`, links, and provenance:claim[lpm].
Press :kbd[Ctrl+K]. keyboard chip
:::callout{kind=warning title="Scope"} kind: note | tip | warning | misconception | prediction
…
:::
:::exercise{kind=guided title="Add a static route"} kind: guided | demonstration | independent
…
:::
::question{id=predict-lpm} placeholder for questions.yaml
`ascii … ` `mermaid … ` diagrams; any other fence is a code block
| tables | work | GFM tables; `---` is a thematic break
`~~~

Element ids: `motivation`, `mental_model`, `explanation`, `diagram`, `worked_example`,
`misconception`, `prediction`, `guided_exercise`, `demonstration`, `independent_problem`,
`reflection`, `mastery_evaluation`. Missing elements are warnings for drafts and errors
once `qa_state` is `approved` or `published`. Rejected: H1, HTML, images, footnotes, an
unknown directive, a `:claim[]` without an entry in `claims.yaml`, a `::question` without an
entry in `questions.yaml`. Answers live only in `questions.yaml`; the content service strips
them and the `correct` flags from learner views (UI-SYSTEM §10).

## Lesson quality bar (RFP §110)

A publishable lesson contains: motivation, mental model, rigorous explanation, diagram,
worked example, common misconception, prediction question, guided exercise, real
demonstration, independent problem, reflection, mastery evaluation. The gold-standard
lesson `HM-LESSON-linux-networking-01` (`content/courses/linux/networking/…`) is the
reference; compare against it, not against this list alone.

## Pipeline (D-010, RFP §108)

```text
DRAFT → TECHNICAL_REVIEW → INSTRUCTIONAL_REVIEW → EXECUTION_TEST → APPROVED → PUBLISHED
```

- Drafts are produced by Claude Code executing a work order (`lesson.add`,
  `lesson.update`; `course.create`, `module.add`, `course.audit`, `sources.refresh` arrive
  in Stage 05). The work order names the directory, the schemas, the acceptance criteria,
  and the validation commands.
- Technical review checks commands, protocol behavior, defaults, terminology against
  approved sources; flagged claims become review items. Instructional review checks
  clarity, progression, cognitive load, misconception coverage. Execution test runs any
  claim that can be verified in a lab (RFP §34 stage 10).
- Approval is a file change: `hivemind content approve <lesson-id> --by jacob [--publish]`
  sets `review.approved_by`, `review.approved_at`, and `qa_state`. `hivemind content
publish` refuses a `published` lesson without those fields (invariant 10) and refuses a
  body change without a version bump (invariant 6, `hivemind content diff` shows it).
- Publishing creates an immutable content version (`HM-CV-nnnn`); the learner view shows
  only `published` lessons, `?view=author` shows everything.

```bash
bun run hivemind -- content compile content/          # validate, write .hivemind/build/content-bundle.json
bun run hivemind -- content diff content/             # against the latest published version
bun run hivemind -- content approve HM-LESSON-linux-networking-01 --by jacob --publish
bun run hivemind -- content publish content/ --note "…"
bun run hivemind -- content publish content/ --sql-out out.sql   # offline: SQL for wrangler d1 execute
```

**TBD(5)**: review queue UI, reviewer checklists, the full template catalogue.

## Source policy (D-011, RFP §33)

Ingest and cite: RFCs, standards, official and vendor documentation, certification
objectives, high-quality free material, Jacob's notes. Paid books and courses may inform
Jacob's own notes and curriculum decisions (`kind: book_notes`, `ingested: false`); never
ingest or reproduce their transcripts or text. Every factual claim carries provenance in
`claims.yaml` with at least one `source_id`; the body marks it with `:claim[id]`, rendered as
a superscript that links into the Sources tab. Conflicts between sources are surfaced as
`verification: conflict`, never silently resolved.

## Versioning (invariants 6–7)

Courses, lessons, and skills use semantic versions. A learner's attempts reference the
course, skill, and grader versions in force at the time; new versions never rewrite
history. A lesson body change requires a lesson version bump; a content version is a
snapshot of everything and is never edited. Deprecation follows `ACTIVE → DEPRECATED →
ARCHIVED` with migration notes.

## Authoring with work orders (D-009)

Prompts stay short because the repository carries the rules:

```text
Execute HiveMind Work Order HM-WO-0184.
Follow CLAUDE.md, COURSE_AUTHORING.md, and the referenced schemas.
```

A work order is a D1 row (`schemas/WorkOrder.schema.json`) and a file
`.hivemind/work-orders/<id>.md` whose YAML header is that record and whose body is the
prompt assembled deterministically from it (template, target, Jacob's instructions,
repository paths, schemas, acceptance criteria, validation commands, expected output,
source requirements). Templates in Stage 01: `lesson.add`, `lesson.update`,
`problem.create` (placeholder until Stage 03), `platform.feature`.

```bash
bun run hivemind -- work new lesson.update --lesson HM-LESSON-linux-networking-01 --instructions "…"
bun run hivemind -- work pull                     # write exported orders locally and start them
bun run hivemind -- work validate HM-WO-0001      # file checks, then the validation commands
bun run hivemind -- work complete HM-WO-0001 --summary "what changed"
bun run hivemind -- work list [--status review_required]
```

States: `draft → exported → in_progress → implemented → validation_failed |
review_required → approved → done`; the server enforces transitions. Jacob approves in
the Work Orders screen. **TBD(5)**: template catalogue and batch orders.
