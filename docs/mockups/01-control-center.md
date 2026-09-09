# 01-control-center

REFERENCE ONLY: `docs/mockups/01-control-center.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/01-control-center.png
```

## Purpose

Developer-workstation landing page: what is running, what is due, what Claude work is
pending, and the one next action for the active target. It establishes the shell and is
not a progress dashboard.

## Stage

Stage 01 (shell, learner, work-order queue, environment status); readiness summary and due
reviews light up in Stages 05–06.

## Visual Reference

`01-control-center.png` (2026-09-09 redo) is in the canonical shell and is the layout
reference: Active Target, Environment Status, Quick Actions, Current Work Queue, Recent
Labs, Claude Work Orders, Recent Activity, Skills Readiness, Upcoming Deadlines.

## Shell

Canonical shell per UI-SYSTEM §1. This screen defines the shell for all others.

## Layout

- Left: sidebar (CORE / INTELLIGENCE / SYSTEM).
- Top of workspace: title `CONTROL CENTER`, subtitle "active target, queues, environment".
- Two-column grid of dense panes, each a table or list:
  - `ACTIVE TARGET` (name, readiness with confidence, top 3 blocking gaps, one next action)
  - `WORK QUEUE` (NOW items from the Training Queue with ids and due state)
  - `DUE REVIEWS` (Review Queue items with QA state and age)
  - `RECENT LABS` (last 8 sessions: id, problem, lifecycle chip, grade, age)
  - `WORK ORDERS` (pending/exported/review_required counts and the 5 most recent)
  - `ENVIRONMENT` (lab hosts, Sandbox availability, D1/R2 status, runtime versions)
- Status bar: version, connection, environment summary.

## Required Data

`learner_id`, active `role_profile_id`, `readiness_snapshot` (score, confidence,
evidence count, gates), training-queue items, review items, `lab_sessions` index rows,
work orders with states, infrastructure health, runtime versions.

## Lifecycle States

Lab rows use §86 chips; work orders use work-order states; reviews use QA states.

## Confidence Rules

Readiness renders with the full `ConfidenceScore`; gaps show `BLOCKING` where gated. The
§154 disclaimer line sits under the readiness value.

## AI Execution

Work-order pane shows execution badges; no AI-generated text on this screen.

## Learner Safety / Leakage

None specific. Recent labs never show fault names for unfinished sessions.

## Corrections From Mockup

- Remove the header tagline ("Build real skills. Deploy your career.") and the quote
  ("Knowledge is infrastructure."); the title row is `CONTROL CENTER` + subtitle only.
- Active Target `71%` bar and sidebar `Profile Readiness 71%` → full `ConfidenceScore`
  with gates; "Next Milestone" stays as one next action with reason.
- Skills Readiness bars → compact `ConfidenceScore`; gap column keeps the number.
- Work-queue status chips `pending` → canonical states (`draft`/`exported` for work
  orders, `queued` for labs); `Claude` type chip → `work order` with execution badge.
- Recent Labs ids `HM-48291` → `HM-LAB-…`; result column shows `7/8 objectives`, not
  Pass/Fail alone.
- Quick Actions keep their shortcuts; `Open Terminal` opens the last active session.
- Notification bell only if there is a real notification source; otherwise omit.

## Keyboard Shortcuts

Global only. `Enter` on a row opens it; `n` on Work Orders pane creates a new order.

## Empty States

Each pane: `no items` plus the creating action (`launch a lab`, `set a target`, `new work
order`). First run shows the seeded learner and an empty target pane with `select target`.

## Error States

Infrastructure pane shows per-component errors inline; a failed health fetch shows
`unreachable` with retry.

## Acceptance Criteria

1. Shell components render with the canonical groups and status bar; sidebar collapses
   below 1280 px.
2. Panes are real tables driven by the API; none are static.
3. No forbidden elements present (checked against UI-SYSTEM §11 in review).
4. Readiness never appears without confidence and evidence count.
