# Stage 10 — Maintenance workflows, agent CLI, scaling, hardening

## Purpose

Keep HiveMind current and durable with the Work Order machinery: workflow registry,
due-date computation, maintenance batches executed by Claude Code, change-report import,
drift detection for roles/companies/certifications/sources/runtimes, lab regression
scheduling, problem-diversity and grader-quality audits, and a maintenance console. Add
Project mode and portfolio, multi-worker scheduling, and an assessment (not
implementation) of multi-user readiness.

## User-visible outcome

Maintenance shows what is due; "Prepare batch" writes a batch work order; Jacob runs it in
Claude Code; proposals land in review with diffs and evidence; approved changes publish as
versions and the health report updates. Career data (Meta profile, local Louisiana
opportunities, certifications) refreshes through the same loop. Projects track multi-session
work and feed portfolio evidence.

## In scope

- Workflow registry (`workflows/**/*.yaml`) with modes manual/scheduled/event-triggered,
  dry-run by construction (everything is a proposal), research depth levels, confidence
  scores, conflict surfacing (RFP §157–216 as applicable to external execution).
- Due computation and Maintenance page; batch work orders; change-report import; health
  report.
- Drift detection data model: role requirement versions, company profile freshness, source
  health, runtime version tracking; job posting import as a work order.
- Lab regression scheduler on the worker (nightly/weekly) with results into the maintenance
  queue; problem diversity and grader quality audits as computed reports.
- `hivemind` agent CLI completion (`refresh`, `audit`, `health`) mapping to templates.
- Project mode and portfolio (RFP §3.7, §72, §139): project specs, milestones, evidence.
- Multi-worker scheduling and capacity accounting; optional worker sleep/wake behind a
  flag (D-006 still default always-on).
- Hardening review: backups verified, restore drill automated monthly, secrets rotation,
  dependency updates, multi-user readiness assessment written to `DECISIONS.md`.

## Explicitly out of scope

- Scheduled server-side AI execution (D-009): schedules produce work orders, not API calls,
  unless an API executor is explicitly enabled per workflow.
- Multi-user implementation; public identity flows.

## Prerequisites / dependency stages

Stages 05, 06, 08, 09.

## Architecture decisions already locked

D-001, D-006, D-009, D-020, D-025, invariants 10, 13, 15.

## Files/modules owned by this stage

`workflows/**`, `services/api/hivemind_api/maintenance/**`, `.../projects/**`,
`.../scheduling/**`, `apps/web/app/(app)/{maintenance,projects}/**`,
`docs/wireframes/maintenance-console/**`, `docs/MAINTENANCE.md`.

## Interfaces/contracts consumed

Work orders, review, content versions, role profiles, validation runs, worker registry.

## Interfaces/contracts created

- Workflow definition schema; batch work-order format; change-report schema; health report.
- Project spec and milestone contracts.

## Data/schema changes

Alembic `0010`: `workflows`, `workflow_runs`, `maintenance_items`, `drift_events`,
`projects`, `project_milestones`, `worker_capacity`.

## Acceptance criteria

1. A weekly batch covering role refresh, source health, and lab regression is generated,
   executed in Claude Code from the file alone, and imported with a change report.
2. Approving a proposal publishes a new version; rejecting leaves everything unchanged;
   both are auditable.
3. Lab regression runs unattended on the worker and files failures as maintenance items.
4. Job posting import creates a temporary target with inheritance from a canonical role and
   a freshness record.
5. Restore drill automated and green for three consecutive months (may be verified after
   stage close).
6. Multi-worker: two workers registered; sessions scheduled by capacity; one worker loss
   fails only its sessions.

## Automated test requirements

Workflow schema tests; due computation tests; import tests with golden reports; scheduler
tests; project state tests.

## Manual QA requirements

Jacob runs one full monthly maintenance cycle and one project milestone.

## Security constraints

Web research happens in Claude Code, not the server; imported content passes schema and
policy checks; no autonomous publishing.

## Performance expectations

Maintenance page under 1 s; batch generation under 5 s.

## Migration requirements

Alembic `0010`.

## Rollback requirements

Every published change is a version; workflow definitions are files in git.

## Known risks

- Maintenance becoming busywork; measure accepted vs rejected proposals and prune workflows.
- Scheduler complexity; keep capacity model simple (slots per worker).

## Forbidden shortcuts

Cron jobs that call AI APIs by default; auto-applying "safe" changes without a change
report; deleting deprecated content instead of archiving.

## Definition of done

- [ ] Acceptance 1–6; `docs/MAINTENANCE.md` complete; multi-user assessment recorded.
- [ ] Milestone commit `feat(stage-10): maintenance workflows and hardening` and tag `stage-10`.
