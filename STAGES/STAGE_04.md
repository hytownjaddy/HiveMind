# Stage 04 — Lab workspace and guided/challenge modes

## Purpose

Make labs usable from the browser: a workspace with per-node terminals, topology view,
objectives, tiered hints, timer, reset, and submit → deterministic grade → results, with
telemetry capture and immutable attempts. Deliver Linux Networking and BGP modules that
Jacob can practise daily (RFP §119 items 1–6, D-012).

## User-visible outcome

From a lesson or the Labs page, Jacob launches a guided lab or a challenge; the workspace
shows the ticket, topology, and terminals; he diagnoses and fixes the fault, presses
Submit, sees per-objective results and the reference approach, and the attempt appears in
History with a replayable timeline.

## In scope

- Wireframes for the lab workspace first (D-023), against Jacob's mockups.
- Workspace UI: xterm.js tabs per node with reconnect, topology (React Flow or Cytoscape;
  decide here), objectives panel, tiered hints with cap notice, timer, reset-to-baseline,
  submit, results view, notes.
- Guided Lab mode (objectives + hints visible) and Challenge mode (domain known, fault
  unknown); mode is a property of the instance presentation, not of content.
- Telemetry capture (RFP §50): commands, hints, resets, submissions, config changes →
  `attempt_events`; recording links; redaction applied.
- Immutable `attempts` with grader version, seed, versions, `GradeResult`.
- Labs page: launch from skill/lesson/archetype, list of sessions, resume.
- History page v1: attempt list and replay (timeline + terminal recording playback).
- Linux Networking module: lesson set around the gold lesson plus 4 guided labs and
  challenge access to all Linux archetypes; BGP module: lessons for sessions, attributes,
  best path, policy plus 4 guided labs and challenge access to all BGP archetypes.

## Explicitly out of scope

- Mastery, difficulty adaptation, spaced repetition, "New Problem" (Stage 06).
- AI hints/tutor/review (Stage 08); authored hints only.
- Coding workspace (Stage 07); incident command center (Stage 09).

## Prerequisites / dependency stages

Stages 01, 02, 03. Stage 05 not required (content for these modules may be authored via
work orders using the Stage 01 minimal templates).

## Architecture decisions already locked

D-003, D-012, D-013, D-016, D-019, D-023, D-024 (remove the demo labs UI entirely),
invariants 2, 3, 5, 9.

## Files/modules owned by this stage

`apps/web/app/(app)/labs/**`, `apps/web/app/(app)/history/**`, `apps/web/components/labs/**`,
`apps/web/components/topology/**`, `packages/core/src/attempts/**`,
`content/courses/linux/networking/**` (module), `content/courses/networking/bgp/**` (module),
`docs/wireframes/lab-workspace/**`.

## Interfaces/contracts consumed

Session WebSocket and PTY relay (02), `ProblemInstance`, hints, `GradeResult` (03), content
API (01), generated TS types.

## Interfaces/contracts created

- Attempt API: `POST /labs/sessions/{id}/submit`, `GET /attempts`, `GET /attempts/{id}/replay`.
- Telemetry event schema (`attempt_events`).
- Workspace layout components reusable by Stages 07 and 09.

## Data/schema changes

D1 migration `0005`: `attempts` filled with immutability trigger, `attempt_events`,
`hint_usage`, session ↔ attempt links.

## Acceptance criteria

1. End-to-end in the browser: launch → fix → submit → results for one Linux and one BGP
   archetype, each with 3 seeds, no console errors.
2. Reconnect: close the tab mid-lab, reopen, terminals resume and objectives persist.
3. Hint usage recorded with tier; results show cap notice; attempts row is immutable
   (update attempt fails at the database).
4. Replay of an attempt shows timeline and terminal playback with secrets redacted.
5. Both modules published with lessons meeting the gold-standard bar (Jacob approves).
6. Playwright covers launch → submit for both runtimes against the dev worker.

## Automated test requirements

Component tests for workspace state; API tests for submit/attempt immutability; Playwright
e2e (Chromium) on the launch → submit path; contract tests on generated types.

## Manual QA requirements

Jacob completes each guided lab and at least two challenges per module, at desktop and
laptop widths; reviews wireframes before implementation; judges whether the challenge
mode hides enough.

## Security constraints

No solution data in DOM or client bundles; terminal input never logged unredacted; Access
on every route.

## Performance expectations

Workspace interactive under 2 s after session `READY`; terminal latency under 150 ms;
results under 10 s after submit.

## Migration requirements

D1 migration `0005` with downgrade.

## Rollback requirements

UI deploys independent of API; feature flag for the workspace route during rollout.

## Known risks

- Topology library choice; timebox to a spike with both.
- Content volume for two modules with 5 h/week review; use work orders aggressively and
  accept "good" over "perfect" for non-gold lessons.

## Forbidden shortcuts

Client-side grading; storing solution text in the instance payload sent to the browser;
reusing the scaffold's demo workspace as-is.

## Definition of done

- [ ] Acceptance 1–6; Playwright in CI.
- [ ] RFP §119 items 1–6 demonstrably true for Linux and BGP.
- [ ] Milestone commit `feat(stage-04): lab workspace` and tag `stage-04`.
