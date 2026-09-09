# HiveMind

Adaptive technical mastery platform specified in [`docs/RFP.md`](docs/RFP.md): structured
courses, real infrastructure labs, infinite validated practice, mastery tracking, and
career readiness.

## Start here

| Read                                                                                 | For                                                                                                                   |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------- |
| [`DECISIONS.md`](DECISIONS.md)                                                       | Locked decisions and their consequences (D-001…)                                                                      |
| [`ARCHITECTURE.md`](ARCHITECTURE.md)                                                 | Target topology: Next.js edge, the Worker API/D1/the session object's deadline queue control plane, Python lab worker |
| [`STAGES/`](STAGES/README.md)                                                        | Development stages; each file is executable by a fresh Claude Code context                                            |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                                                 | Process, verification, commits, work orders                                                                           |
| [`COURSE_AUTHORING.md`](COURSE_AUTHORING.md), [`LAB_AUTHORING.md`](LAB_AUTHORING.md) | Content and lab contracts                                                                                             |
| [`docs/RFP_REVIEW.md`](docs/RFP_REVIEW.md)                                           | Review that preceded the decisions                                                                                    |

## Current state

Stage 01 (foundation and contracts) is complete: canonical Zod contracts with JSON Schema,
an append-only version lock, and generated Pydantic; D1 schema v1 with a tested down
script; `packages/core` services behind thin route handlers; Cloudflare Access identity;
the `hivemind` CLI; the content compiler and the gold-standard lesson; the canonical
workstation shell with the Control Center, Course Workspace, Work Orders, and Settings;
nightly exports and a restore drill. Stage 02 (lab worker runtime) is next:
`STAGES/STAGE_02.md`.

```bash
bun install && brew install uv
bun run db:migrate:local && bun run dev      # http://localhost:3000 with the Access dev bypass in apps/web/.dev.vars
bun run verify && bun run verify:py
```
