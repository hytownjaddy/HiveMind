# Stage 01 — Foundation and contracts

## Purpose

Establish the shared source of truth every later stage builds on: Pydantic contracts,
PostgreSQL model, course package format, skill registry, lab-provider interface,
ProblemSpec, grader contract, role-profile schema, and the work-order format. Stand up the
FastAPI control plane, identity through Cloudflare Access, data durability, the content
compiler, and the persistent documentation set. Retire the parts of the scaffold that
conflict with D-007. Author the gold-standard lesson with Jacob.

## User-visible outcome

Jacob signs in through Cloudflare Access, opens Learn, and reads the gold-standard Linux
networking lesson rendered from versioned files in `content/`. A dashboard shows the seeded
learner and platform health. `hivemind` CLI compiles content, creates and validates work
orders, and exports/restores learner data. Destroying the database and restoring from the
R2 backup leaves the lesson and learner intact.

## In scope

- Repository re-layout to D-028; Python toolchain (`uv`, `ruff`, `pyright`, `pytest`);
  root `make verify` running Python and TypeScript checks; CI updated.
- `packages/hivemind-core` v1 contracts: `Learner`, `SkillDefinition`, `SkillGraph`,
  `CourseManifest`, `Module`, `Lesson`, `Question`, `Claim`/`SourceRecord`, `Capability`,
  `LabProvider` (abstract interface only), `ProblemSpec`, `ProblemInstance`, `Grader`
  manifest and `GradeResult`, `Attempt`/`Evidence` (types only), `RoleProfile`,
  `Competency`, `WorkOrder`, `ReviewItem`; versioning helpers; JSON Schema export.
- Generated TypeScript types from the exported schemas (D-027) wired into `apps/web`.
- `services/api`: FastAPI skeleton, settings, health, Access JWT validation → `learner_id`,
  PostgreSQL via SQLAlchemy + Alembic, Redis client, structured logging, OpenAPI.
- PostgreSQL schema v1 (see Data/schema changes).
- Content compiler `hivemind content compile` (validate → load into Postgres as an
  immutable content version) and `hivemind content diff`.
- Work orders v1: YAML+Markdown format under `.hivemind/work-orders/`, `hivemind work
new|pull|validate|complete`, status machine, minimal template set (`lesson.add`,
  `lesson.update`, `problem.create` placeholder, `platform.feature`).
- Durability (D-020, D-029): nightly logical backup to R2, `hivemind export`, scripted
  restore drill, documented recovery runbook.
- `apps/web`: keep shell and tooling; add Learn (course → module → lesson) reading from
  the API; remove placeholder pages and demo labs UI; add a Work Order copy/export panel
  fed by the API (no AI).
- Remove `apps/realtime-worker`, `packages/protocol`, D1 config and migrations (D-026),
  carrying the lifecycle/deadline-queue design into `services/api` design notes.
- Gold-standard lesson: topic chosen with Jacob (recommend: Linux routing table and
  `ip route`, as the first Linux Networking module's anchor), authored collaboratively,
  meeting RFP §110, with `claims.yaml` provenance.
- Documentation set completed: `ARCHITECTURE.md` updated to actual, `COURSE_AUTHORING.md`
  TBD(1) sections filled, `CONTRIBUTING.md` verified against reality.

## Explicitly out of scope

- Any lab execution or worker code (Stage 02). The `LabProvider` interface is defined, not
  implemented.
- Problem instantiation, faults, graders as code (Stage 03).
- Mastery/readiness computation (Stage 06); only the tables and types.
- Review queue UI and authoring templates beyond the minimal set (Stage 05).
- Any API-based AI executor (Stage 08).
- Multi-user identity (D-008).

## Prerequisites / dependency stages

None. This stage must complete before parallel work begins (D-021).

## Architecture decisions already locked

D-001, D-002 (schemas early), D-007, D-008, D-009 (work-order format), D-010 (gold
lesson), D-011, D-014 (algorithm version fields exist), D-019 (retention fields), D-020,
D-021, D-022, D-024, D-025, D-026, D-027, D-028. D-029 must be resolved in this stage.

## Files/modules owned by this stage

`packages/hivemind-core/**`, `services/api/**` (skeleton), `schemas/**`, `content/skills/**`
(initial registry entries), `content/courses/linux/networking/**` (gold lesson),
`content/careers/**` (schema fixtures only), `.hivemind/work-orders/**` (format + examples),
`apps/web/app/(app)/learn/**`, `apps/web/lib/api/**` (generated client), `Makefile`,
`tools/backup/**`, `.github/workflows/ci.yml`, all root docs.

## Interfaces/contracts consumed

None from other stages. External: Cloudflare Access (JWT/JWKS), PostgreSQL, Redis, R2 (S3
API).

## Interfaces/contracts created

- Pydantic contracts v1 and `schemas/*.json`; generated `apps/web/lib/api/types.ts`.
- API v1: `GET /health`, `GET /me`, `GET /courses`, `GET /courses/{id}/versions/{v}`,
  `GET /lessons/{id}`, `GET/POST /work-orders`, `POST /work-orders/{id}/export`,
  `GET /content/versions`.
- `hivemind` CLI: `content compile|diff`, `work new|pull|validate|complete`, `export`,
  `restore`, `db migrate`.
- Work-order file format and status machine.
- `LabProvider` abstract interface (Python Protocol) for Stage 02 to implement.

## Data/schema changes

PostgreSQL v1 (Alembic `0001`): `learners`, `content_versions`, `courses`,
`course_versions`, `modules`, `lessons`, `lesson_questions`, `skills`, `skill_versions`,
`skill_relationships`, `sources`, `content_claims`, `role_profiles`, `competencies`,
`role_competencies`, `work_orders`, `review_items`, `attempts` (created empty with
immutability trigger), `lab_sessions` (empty), `problem_instances` (empty),
`algorithm_versions`. Every learner-scoped table carries `learner_id`.

## Acceptance criteria

1. `make verify` passes on a clean checkout (Python + TypeScript).
2. `hivemind content compile content/` loads the gold lesson; `GET /lessons/{id}` returns it;
   Learn renders it behind Access.
3. Changing any Pydantic contract without bumping its version fails CI; `schemas/` and the
   generated TS types are checked for drift in CI.
4. `hivemind work new lesson.update --lesson <id>` produces a valid work order that Claude
   Code can execute from the file alone; `hivemind work validate` rejects an invalid one.
5. Restore drill: run backup → drop database → `hivemind restore <snapshot>` → acceptance 2
   passes again. Scripted and documented.
6. Unauthenticated requests to the API and web hostnames are rejected by Access; the API
   rejects requests without a valid Access JWT.
7. `apps/realtime-worker`, `packages/protocol`, D1 config, placeholder pages, and demo labs
   UI are gone; `bun run verify` still passes.
8. Gold lesson approved by Jacob and marked `PUBLISHED` in its content version.

## Automated test requirements

Unit tests for every contract (round-trip, version bump detection); compiler tests with
fixture courses including invalid ones; API tests with a test database; CLI tests; a CI job
that runs the restore drill against a disposable Postgres.

## Manual QA requirements

Jacob: sign in, read the lesson on desktop and phone width, create a work order from the
UI, paste it into Claude Code, confirm it is executable without extra context.

## Security constraints

Access JWT validated with key rotation; no secrets in `content/` or work orders; backups
encrypted at rest in R2 with restricted credentials; database credentials only in the host
secret store.

## Performance expectations

Lesson page under 500 ms server time from the API; compile of the initial content under
10 s. Nothing else is performance-sensitive yet.

## Migration requirements

Alembic from empty. Scaffold's D1 data is discarded (nothing real). Document how content
versions are re-compiled after a schema migration.

## Rollback requirements

Every Alembic migration has a tested downgrade. Content versions are immutable; rollback of
content is publishing a previous version, not deleting rows. Removal of scaffold code is a
single reviewable commit that can be reverted.

## Known risks

- Over-designing contracts without real content: mitigate with the gold lesson plus a
  drafted BGP `ProblemSpec` fixture used only to validate schemas.
- Access misconfiguration locking Jacob out: document a break-glass path.
- D-029 left open blocks acceptance 5.

## Forbidden shortcuts

Hand-written TypeScript copies of backend schemas; storing content only in Postgres without
files; `learner_id` defaults that assume one user; skipping the restore drill; keeping the
Durable Object "because it works".

## Definition of done

- [ ] All acceptance criteria pass; `make verify` green in CI.
- [ ] D-029 resolved and recorded in `DECISIONS.md`.
- [ ] `ARCHITECTURE.md`, `COURSE_AUTHORING.md`, `AGENTS.md` reflect the real tree.
- [ ] `STAGES/README.md` status updated; milestone commit `chore(stage-01): foundation and contracts` and tag `stage-01`.
