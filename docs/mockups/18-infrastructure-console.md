# 18-infrastructure-console

REFERENCE ONLY: `docs/mockups/18-infrastructure-console.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/18-infrastructure-console.png
```

## Purpose

Dev-tool console for the platform: Cloudflare side (Durable Objects, D1, R2, Sandbox
sessions) and lab workers (status, resources, running environments, queue, provisioning
failures, runtimes, logs).

## Stage

Stage 02 (workers, sessions, runtimes); Cloudflare side from Stage 01 health endpoints.

## Visual Reference

`18-infrastructure-console.png` (lab-host half only).

## Shell

Canonical (mockup uses it).

## Layout

- Overview row as a table: overall status, workers online, running sessions by provider
  class, Sandbox sessions, D1 status, R2 status, last export.
- Tabs `Workers | Sessions | Queue | Images & Runtimes | Provisioning Jobs | Logs & Events
| Cloudflare | Configuration`.
- Workers table; host resource sparklines; sessions table (id `HM-LAB-…`, problem, provider
  class, host, lifecycle chip, cpu/mem, uptime); queue table; runtimes table with pinned
  digests and `update_available`; system events log.

## Required Data

Worker registry and heartbeats, session index with provider class, deadlines, runtime
versions and digests, provisioning job results, Cloudflare health probes, export history.

## Lifecycle States

§86 for sessions; worker `online/degraded/offline`; runtime `ok/update_available/failed`.

## Confidence Rules

None.

## AI Execution

None.

## Learner Safety / Leakage

None.

## Corrections From Mockup

- Rename to `INFRASTRUCTURE`; add the Cloudflare tab and overview fields.
- Session ids `lab-32781` → `HM-LAB-…`; queue ids → job ids.
- Add provider class column.

## Keyboard Shortcuts

`r` refresh, `/` filter sessions.

## Empty States

No workers: `no lab worker registered · run tools/host/provision.sh`.

## Error States

Worker offline → row `offline` with last heartbeat; provisioning failure rows link to logs.

## Acceptance Criteria

1. Reflects worker registry and session states in real time.
2. Orphan sweeps and failed jobs are visible with reasons.
