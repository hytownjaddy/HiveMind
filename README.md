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

The tree holds the initial Cloudflare scaffold (Next 16 on OpenNext, a Durable Object
realtime worker, D1). Per D-007/D-026 the control plane moves to the Worker API, D1, the session object's deadline queue,
and a Python lab worker in Stage 01; the Durable Object, D1, and demo UI are removed then.

```bash
bun install
bun run verify      # TypeScript checks, tests, OpenNext build
```

Stage 01 is the next unit of work: `STAGES/STAGE_01.md`.
