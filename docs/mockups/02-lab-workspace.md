# 02-lab-workspace

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

HiveMind's signature screen: a network-operations debugging console for one lab session.
Topology, per-node terminals, ticket and objectives, environment state, grader results,
tiered hints, snapshot/reset, and context export.

## Stage

Stage 04 (UI), built on Stage 02 (session object, providers) and Stage 03 (problems,
graders). Incident mode variant is specified in `20-incident-command-center.md`.

## Visual Reference

`02-lab-workspace.png` (primary layout). The earlier "lab run" variant (removed) contributed
the Event Timeline and Logs panes, which are merged into this screen as tabs.

## Shell

Canonical. Status bar fields: `HM-LAB-829143`, lifecycle chip, connection chip, seed,
runtime versions, idle-expiry countdown, recording indicator.

## Layout

- Header: breadcrumb `Labs › <course> › <archetype> › HM-LAB-829143`; title; mode chip
  (`guided` | `challenge` | `incident`); difficulty; environment; topology summary; seed
  and versions block (generator, topology, faults, grader) shown once.
- Center-top: tabs `Topology | Nodes | Routing Table | BGP Neighbors | Links | Metrics`
  (protocol-specific tabs come from the archetype's declared views).
- Center-bottom: tabs `Terminals | Timeline | Logs`; terminals have one tab per node with
  a connection dot, plus `+` for a second view of a node.
- Right: tabs `Objectives | Hints | Resources | Notebook`; below it `LAB STATE` (lifecycle,
  provider class, node table with CPU/mem) and `ENVIRONMENT ACTIONS`
  (`reset to baseline`, `new seed`, `snapshot`, `destroy`, each with confirmation).
- Right-bottom: `GRADER` pane: objective checks with last-run results; `run checks` runs
  non-final validation; `Submit` triggers final grading and moves to `grading`.
- Header actions: `Export context for Claude` (execution badge `external`), `Open in
editor` (when the lab has files).

## Required Data

Session id, problem instance (archetype, seed, versions, spec hash), mode, lifecycle,
connection, provider class, node list with state, topology graph, objectives with check
results, hint tiers with caps and usage, timeline events, logs (system/grader/network),
metrics series, snapshots, recording status, deadlines (idle expiry, hard TTL).

## Lifecycle States

All §86 states are reachable; the terminal pane is enabled only in `ready`/`active`; an
overlay names the state otherwise. `grading` shows a progress line in the Grader pane;
`completed` links to `08-lab-review`; `destroyed`/`failed` show the reason and a `re-run
with same seed` action.

## Confidence Rules

None on this screen (no mastery numbers shown during a lab).

## AI Execution

`Export context for Claude` copies lesson context, topology, node states, command history
(redacted), and objectives in a prompt pack. In `api` mode a tutor pane may appear under
`Resources`, labelled `api`.

## Learner Safety / Leakage

- Never show fault module names, fault parameters, reference solution, or grader
  internals; the ticket text is the only narrative.
- In `challenge` mode the domain of the fault is hidden in the ticket; in `incident` mode
  see spec 20.
- Hints: each tier shows `reveals: <scope>` and `mastery gain cap: <x%>` before opening;
  opening is logged.
- Command history export is passed through the redaction filter.

## Corrections From Mockup

- Remove the duplicate `Seed` field; add generator/topology/fault/grader versions.
- `IN PROGRESS` chip → lifecycle chip (`active`) plus a connection chip.
- Add idle-expiry countdown and recording indicator to the status bar.
- Grader pane: "Run Tests" → `run checks` (non-final); add `Submit` and the
  "unrelated systems unchanged" check row after final grading.
- Add Timeline and Logs as center-bottom tabs (from the removed run variant); never add a
  "Lab Tips" banner that names the fix, nor a "send a command to all devices" box.
- Hints tab must show tier and cap; the sidebar `CURRENT LAB` tree is replaced by the
  pane tabs.
- Identifier `HM-48291` → `HM-LAB-829143`.

## Keyboard Shortcuts

`` Ctrl+` `` focus terminal; `Ctrl+1..9` switch node terminal; `Ctrl+Shift+E` export
context; `Ctrl+Enter` run checks; `Ctrl+Shift+Enter` submit (confirm); `[` `]` tabs.

## Empty States

Session `queued`/`provisioning`: topology renders greyed with the lifecycle chip; terminals
disabled with the state name. No nodes yet: `waiting for provider`.

## Error States

Provider failure → lifecycle `failed` with reason and `re-run`; socket loss → connection
`offline` with backoff countdown and manual `reconnect`; grader error → Grader pane
inline error with `copy details`.

## Acceptance Criteria

1. One Linux and one BGP archetype playable end to end (launch → fix → submit → review) with
   3 seeds each, per Stage 04.
2. Reconnect resumes the same PTY and objective state.
3. Hint usage recorded with tier and cap shown before use.
4. No fault, solution, or grader internals reachable in DOM, network responses, or bundles
   (Playwright check).
5. Timeline and Logs show provisioning steps, checks, hints, and submissions with
   timestamps.
