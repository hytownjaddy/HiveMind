# 20-incident-command-center

REFERENCE ONLY: `docs/mockups/02-lab-workspace.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/02-lab-workspace.png
```

## Purpose

Blind-incident variant of the lab workspace (RFP §3.5, §92): a SEV ticket, topology,
terminals, metrics, logs, deployments, notes, timeline. The failing domain is hidden.

## Stage

Stage 09.

## Visual Reference

No dedicated mockup. Derive from `02-lab-workspace.png` with the changes below.

## Shell

Canonical. Status bar: `HM-INC-20260908-001`, lifecycle, connection, elapsed time.

## Layout

- Left: `TICKET` (severity, symptoms, affected services, SLO impact, timeline of reports),
  `NOTES` (learner's investigation log, becomes part of the review).
- Center: `Topology | Terminals | Metrics | Logs | Deployments`; topology shows systems,
  not just routers.
- Right: `LAB STATE`, `ACTIONS` (declare mitigation, declare root cause, submit); no
  objectives list, no hints by default (a single `ask for a nudge` action at a stated cap).
- Timeline pane records detect/scope/diagnose/mitigate/repair/verify/communicate steps as
  the learner marks them (RFP §24).

## Required Data

Incident scenario (composed faults hidden), affected systems, telemetry series, logs,
deployment history, ticket, learner notes, grading on final state plus mitigation
declaration.

## Lifecycle States

§86 plus incident phases `detect`, `scope`, `diagnose`, `mitigate`, `repair`, `verify`,
`communicate` as learner-declared markers.

## Confidence Rules

None during the incident.

## AI Execution

`export context` only.

## Learner Safety / Leakage

No domain words in ticket, tab names, or logs beyond what a real system would show; fault
count shown as a range; no objectives that name systems.

## Corrections From Mockup

n/a; differences from spec 02 are listed above.

## Keyboard Shortcuts

As spec 02; `m` mark phase.

## Empty States

Scenario `provisioning`: ticket visible, panes disabled.

## Error States

As spec 02.

## Acceptance Criteria

1. Ten validated incident scenarios play with hidden domain (DOM/network check).
2. Phase markers persist and appear in the review timeline.
