# Stage 01 — Foundation and contracts

## Purpose

Establish the shared source of truth every later stage builds on: canonical Zod contracts
with generated JSON Schema and Pydantic, the D1 data model, course package format, global
skill registry, `LabProvider` interface and capability model, ProblemSpec, grader contract,
role-profile schema, work-order format, and the `hivemind` CLI. Reshape the scaffold into
the D-039 layout with the D-031 layering, identity through Cloudflare Access + Google,
durability through D1 Time Travel plus R2 exports, the persistent documentation set, and
the gold-standard lesson authored with Jacob against the `docs/mockups/` direction.

## User-visible outcome

Jacob signs in with Google through Cloudflare Access at `hivemindjrr.com`, opens the Course
Workspace, and reads the gold-standard Linux networking lesson rendered from versioned files
in `content/`. The Control Center shell shows the seeded learner, environment status, and
an empty work-order queue. `hivemind` compiles and publishes content, creates and validates
work orders, and exports learner data. Restoring D1 from an R2 export onto a fresh database
leaves the lesson and learner intact.

## In scope

- Repository re-layout to D-039: `apps/web`, `apps/session-worker` (renamed from
  `apps/realtime-worker`, untouched functionally beyond the rename and Access integration),
  `packages/schema` (from `packages/protocol`), `packages/core`, `packages/cli`,
  `services/lab-worker` (skeleton only: pyproject, generated models, worker CLI stub),
  `content/`, `schemas/`, `.hivemind/work-orders/`, `docs/mockups/`.
- Python toolchain for the worker skeleton (Python 3.13, `uv`, `ruff`, `pyright`, `pytest`);
  root verification runs both toolchains; CI updated.
- `packages/schema` v1 (Zod, canonical): `Learner`, `SkillDefinition`, `SkillGraph`,
  `CourseManifest`, `Module`, `Lesson`, `Question`, `Claim`/`SourceRecord`, `Capability`,
  `LabSpec`, `LabProvider` interface types, `ProblemSpec`, `ProblemInstance`, `FaultSpec`,
  `Grader` manifest and `GraderResult`, `Attempt`/`AttemptResult`/`Evidence` (types only),
  `RoleProfile`/`CareerProfile`, `Competency`, `WorkOrder`, `ReviewItem`, worker protocol
  envelope; versioning helpers; JSON Schema export to `schemas/`; Pydantic generation into
  `services/lab-worker`; CI drift check (D-032).
- `packages/core`: application services and domain modules with D1 repositories, R2 client,
  Access identity → `learner_id` mapping, content compiler, work-order state machine,
  structured logging. Thin route handlers in `apps/web` (D-031).
- D1 schema v1 via wrangler migrations (see Data/schema changes); seeded learner.
- Content compiler and publisher: `hivemind content compile|diff|publish` (validate files →
  content bundle → immutable content version in D1 through the API with a service token).
- Work orders v1: file format under `.hivemind/work-orders/` (YAML header + prompt),
  `hivemind work new|pull|validate|complete`, status machine, minimal templates
  (`lesson.add`, `lesson.update`, `problem.create` placeholder, `platform.feature`),
  identifiers per D-038.
- Identity: Cloudflare Access application with Google IdP for `hivemindjrr.com`; JWT
  validation in the Worker; service tokens for CLI/worker; remove guest HMAC sessions.
- Durability (D-020, D-030): nightly GitHub Actions `wrangler d1 export` to R2 with
  retention; `hivemind export`; scripted restore drill; recovery runbook.
- `apps/web`: shell aligned to the Control Center and Course Workspace mockups (status bar,
  left tree, command palette scaffold, tabs `Lesson | Lab | Notes | Sources | Mastery` with
  only Lesson and Sources live); remove placeholder pages and demo labs UI; Work Order
  copy/export panel (deterministic assembly).
- Gold-standard lesson: topic agreed with Jacob (proposed: the Linux routing table and
  `ip route`, anchor of the first Linux Networking module); coverage and sequencing
  grounded in named authoritative sources (iproute2 documentation, `ip-route(8)`, RHCSA
  objectives, Red Hat networking guide, relevant RFCs), original wording; `claims.yaml`
  provenance; meets RFP §110.
- Documentation set: `ARCHITECTURE.md` updated to actual, `COURSE_AUTHORING.md` TBD(1)
  filled, `CONTRIBUTING.md` verified; companion specs already exist for every screen
  (D-041) and are inputs, not deliverables.

## Explicitly out of scope

- Lab execution: no provider implementations, no Sandbox or worker integration beyond the
  interface and the worker skeleton (Stage 02). The `LabSession` object keeps its current
  behaviour under the new name.
- Problem instantiation, faults, graders as code (Stage 03).
- Mastery/readiness computation (Stage 06); only tables and types.
- Review queue UI and full template catalogue (Stage 05).
- Any API-based AI executor (Stage 08).
- Multi-user identity (D-033).
- Migrating OpenNext to `vinext` (D-031).

## Prerequisites / dependency stages

None. Inputs: `docs/mockups/` companions for Lab Workspace, Career Target, Course
Workspace, Claude Work Orders, Coding Workspace. Must complete before parallel work (D-021).

## UI specifications

Implement these companion specifications (authority: `DECISIONS.md` → `docs/ui/UI-SYSTEM.md` → companion → this stage → mockup image):

- `docs/mockups/01-control-center.md`
- `docs/mockups/04-course-workspace.md` (Lesson, Sources tabs, tree)
- `docs/mockups/14-work-orders.md` (panel)
- `docs/mockups/22-settings.md` (identity, export)

## Architecture decisions already locked

D-001, D-002, D-008, D-009, D-010, D-011, D-014, D-019, D-020, D-021, D-022, D-023,
D-024, D-025, D-030, D-031, D-032, D-033, D-034, D-036, D-037, D-038, D-039, D-040.

## Files/modules owned by this stage

`packages/schema/**`, `packages/core/**`, `packages/cli/**`, `schemas/**`,
`services/lab-worker/` (skeleton: `pyproject.toml`, `hivemind_worker/contracts/` generated,
`hivemind_worker/cli.py` stub), `content/skills/**` (initial entries),
`content/courses/linux/networking/**` (gold lesson), `content/careers/**` (schema
fixtures), `.hivemind/work-orders/**`, `apps/web/**` (shell, learn, work-order panel),
`apps/session-worker/**` (rename + Access), `migrations/**` (D1), `.github/workflows/**`,
`tools/backup/**`, all root docs.

## Interfaces/contracts consumed

External only: Cloudflare Access (JWKS), D1, R2, GitHub Actions.

## Interfaces/contracts created

- Zod contracts v1, `schemas/*.json`, generated Pydantic package.
- API v1 (thin handlers over `packages/core`): `GET /api/health`, `GET /api/me`,
  `GET /api/courses`, `GET /api/courses/{id}/versions/{v}`, `GET /api/lessons/{id}`,
  `GET|POST /api/work-orders`, `POST /api/work-orders/{id}/export`,
  `POST /api/content/versions` (service token).
- `hivemind` CLI: `content compile|diff|publish`, `work new|pull|validate|complete`,
  `export`, `db migrate`.
- Work-order file format and status machine; identifier formats.
- `LabProvider` interface and capability vocabulary for Stage 02.

## Data/schema changes

D1 migration `0002` (replacing the scaffold's `0001`): `learners`, `content_versions`,
`courses`, `course_versions`, `modules`, `lessons`, `lesson_questions`, `skills`,
`skill_versions`, `skill_relationships`, `sources`, `content_claims`, `role_profiles`,
`competencies`, `role_competencies`, `work_orders`, `review_items`, `attempts` (empty;
append-only enforced in `packages/core`), `lab_sessions` (index only; live state stays in
the object), `problem_instances` (empty), `algorithm_versions`. Every learner-scoped table
carries `learner_id`.

## Acceptance criteria

1. `bun run verify` and the Python checks pass on a clean checkout; CI green.
2. `hivemind content compile content/ && hivemind content publish` loads the gold lesson;
   `GET /api/lessons/{id}` returns it; the Course Workspace renders it behind Access.
3. Changing a Zod contract without a version bump fails CI; `schemas/` and the generated
   Pydantic package are drift-checked in CI.
4. `hivemind work new lesson.update --lesson <id>` produces a valid `HM-WO-nnnn` work order
   executable by Claude Code from the file alone; `hivemind work validate` rejects an
   invalid one.
5. Restore drill: nightly export exists in R2 → import into a fresh D1 → acceptance 2
   passes. Scripted and documented.
6. Unauthenticated requests are rejected by Access; the Worker rejects requests with an
   invalid Access JWT; `/api/me` returns the seeded `learner_id`.
7. No business logic in route handlers: a lint rule or review checklist item enforces
   that handlers only call `packages/core` services (documented in `CONTRIBUTING.md`).
8. Guest HMAC sessions, placeholder pages, and the demo labs UI are gone; the session
   Worker still passes its workerd tests under the new name.
9. Gold lesson approved by Jacob and `PUBLISHED`.

## Automated test requirements

Contract round-trip and version tests; compiler tests with valid/invalid fixture courses;
`packages/core` service tests against a local D1 (miniflare); CLI tests; workerd tests for
the session Worker; a CI job for the restore drill against a disposable D1.

## Manual QA requirements

Jacob: sign in with Google, read the lesson, create a work order from the UI, paste it
into Claude Code, confirm it is executable without extra context; compare the shell to
the Control Center and Course Workspace mockups.

## Security constraints

Access JWT validated with key rotation; service tokens scoped per caller; no secrets in
`content/` or work orders; R2 exports in a private bucket with restricted credentials.

## Performance expectations

Lesson page under 300 ms at the edge; compile of initial content under 10 s.

## Migration requirements

D1 migrations from the scaffold's `0001` (dropped, nothing real) to `0002`. Document how
content versions are re-published after a schema migration.

## Rollback requirements

Every D1 migration has a tested down script. Content versions are immutable; rollback of
content is publishing a previous version. Scaffold removals are single reviewable commits.

## Known risks

- Over-designing contracts without content: mitigate with the gold lesson plus a drafted
  BGP `ProblemSpec` fixture used only to validate schemas.
- Access misconfiguration locking Jacob out: document a break-glass path.
- Pydantic generation fidelity for discriminated unions: choose the generator early and
  test with the worker protocol envelope.

## Forbidden shortcuts

Hand-written Pydantic copies of contracts; business logic in `route.ts`; storing content
only in D1 without files; `learner_id` defaults that assume one user; skipping the restore
drill; introducing a hosted database "temporarily".

## Definition of done

- [ ] All acceptance criteria pass; CI green.
- [ ] `ARCHITECTURE.md`, `COURSE_AUTHORING.md`, `AGENTS.md` reflect the real tree.
- [ ] `STAGES/README.md` status updated; milestone commit `chore(stage-01): foundation and contracts` and tag `stage-01`.
