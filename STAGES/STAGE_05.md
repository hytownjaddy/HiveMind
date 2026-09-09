# Stage 05 — Authoring pipeline and review queues

## Purpose

Make content production sustainable at 5 hours/week of human review: full work-order
template catalogue, review queues for content and problems, the RFP §108 QA state machine
with reviewer checklists, source library with provenance and policy enforcement, executable
verification hooks, course versioning and publish/deprecate flows.

## User-visible outcome

Jacob opens Review, sees queued lessons/problems/sources with diffs, checklists, and
validation results, approves or rejects with comments, and publishes a course version. From
any course/module/skill page he creates a work order (structured plus freeform request),
copies it for Claude Code, and later sees the resulting change land in his queue.

## In scope

- Work-order template catalogue (course, labs, careers, interviews, certifications,
  maintenance, platform) with deterministic prompt assembly from page context (no AI).
- Review queue UI and API: items, assignment, checklists per item type, comments,
  approve/reject/request-changes, audit trail.
- QA state machine enforcement on lessons, problems, sources; publish creates content
  versions; deprecate/archive flows with migration notes.
- Source library: `SourceRecord` management, trust scores, health checks, policy
  enforcement (D-011) with a blocklist of disallowed source classes; claims linkage.
- Executable verification hooks: lessons can declare verifiable claims that run as
  problems/checks on the worker during `EXECUTION_TEST`.
- Content diff viewer in the web UI: diffs between content versions in D1 and proposed
  change sets imported from work-order results (git stays local to Claude Code; the Worker
  never reads a repository).
- Import of Claude Code change reports into work-order results.

## Explicitly out of scope

- AI executors (Stage 08); everything here is deterministic.
- Autonomous course generation from arbitrary sources (later, Stage 10 territory).
- Maintenance batch scheduling (Stage 10); single work orders only.

## Prerequisites / dependency stages

Stage 01. Runs in parallel with 02–04 once contracts are stable (D-021). Problem review
items require Stage 03 for validation results.

## UI specifications

Implement these companion specifications (authority: `DECISIONS.md` → `docs/ui/UI-SYSTEM.md` → companion → this stage → mockup image):

- `docs/mockups/21-review-queue.md`
- `docs/mockups/17-course-authoring.md`
- `docs/mockups/14-work-orders.md` (full queue, validation, batches)
- `docs/mockups/16-source-library.md`

## Architecture decisions already locked

D-004, D-009, D-010, D-011, D-022 invariants 6, 7, 10, 11, D-030, D-032, D-034, D-041.

## Files/modules owned by this stage

`packages/core/src/review/**`, `.../workorders/**` (templates, assembly),
`.../sources/**`, `apps/web/app/(app)/review/**`, `apps/web/app/(app)/library/**`,
`apps/web/components/workorders/**`, `.hivemind/templates/**`, `packages/cli/src/work/**`,
`packages/cli/src/content/**` (publish/deprecate), `COURSE_AUTHORING.md` TBD(5).

## Interfaces/contracts consumed

`WorkOrder`, `ReviewItem`, content versions, `SourceRecord`, validation runs (03).

## Interfaces/contracts created

- Template format and context-assembly rules.
- Review API and checklist schema.
- Publish/deprecate API.
- Change-report import format.

## Data/schema changes

D1 migration `0006`: `review_comments`, `review_checklists`, `source_health`, `work_order_events`,
content state columns.

## Acceptance criteria

1. Every template renders a work order that Claude Code executes from the file alone
   (spot-check five with Jacob).
2. A lesson cannot reach `published` without passing every state; attempts to skip fail.
3. A source of a disallowed class is rejected at creation with the policy reason.
4. Review of a problem shows validation results inline; rejecting reopens the work order.
5. Publishing a new course version leaves prior attempts pointing at the old version.
6. Jacob clears a queue of ten mixed items in under an hour in a timed session.

## Automated test requirements

State machine tests; template rendering snapshot tests; policy tests; API tests; UI
component tests for the queue.

## Manual QA requirements

Jacob runs the full loop three times: create work order → Claude Code → validate → review
→ publish.

## Security constraints

Work orders never include secrets; review actions are attributed to the learner id; source
URLs fetched server-side with SSRF protections.

## Performance expectations

Queue and diff views under 1 s for 100 items.

## Migration requirements

D1 migration `0006` with down script; existing Stage 01–04 content migrated into QA states
as `published`.

## Rollback requirements

Review data is append-only; UI behind a route flag.

## Known risks

- Templates that grow bloated; enforce that repository docs carry standing rules.
- Review fatigue; measure time per item and simplify checklists.

## Forbidden shortcuts

Calling an AI API to assemble prompts; auto-approving anything; storing paid-course text.

## Definition of done

- [ ] Acceptance 1–6; CI green.
- [ ] `COURSE_AUTHORING.md` complete; template catalogue documented.
- [ ] Milestone commit `feat(stage-05): authoring pipeline and review queues` and tag `stage-05`.
