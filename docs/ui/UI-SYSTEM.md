# HiveMind UI System

Canonical, cross-screen rules. Every companion spec in `docs/mockups/NN-name.md` inherits
this file and only adds what is unique to its screen. Where a mockup image disagrees with
this file, this file wins.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md (this file)
3. docs/mockups/NN-name.md (companion specification)
4. STAGES/STAGE_nn.md
5. docs/mockups/NN-name.png (REFERENCE ONLY)
```

Governing decisions: D-009 (AI execution), D-014/D-016 (confidence, hint caps), D-023
(mockups are direction), D-037 (workstation, desktop-first), D-038 (identifiers, lifecycle).

## 1. Canonical shell

The shell is the one used by mockups 12–18 ("HIVEMIND" wordmark, grouped sidebar,
monospace uppercase titles). The rounded "HiveMind" shell in mockups 1–11 is not
canonical; those screens keep their layouts and are re-skinned.

```text
┌ top bar ──────────────────────────────────────────────────────────────────────┐
│ [logo] HIVEMIND │ [⌘K search / commands…] │ Active Target ▾ │ ● Lab Host: online │ ⚙ │ JR │
├ sidebar ─────┬ workspace ─────────────────────────────────────────────────────┤
│ CORE         │ Breadcrumb › Path › HM-LAB-829143                               │
│  …           │ WORKSPACE TITLE                                                 │
│ INTELLIGENCE │ one-line subtitle                                               │
│  …           │ [tabs]                                                          │
│ SYSTEM       │ panes (resizable splits)                                        │
│  …           │                                                                 │
│ ┌ lab host ┐ │                                                                 │
│ │ cpu/mem  │ │                                                                 │
├ status bar ──┴─────────────────────────────────────────────────────────────────┤
│ v0.1.0 │ ● online │ HM-LAB-829143 │ seed 829143 │ FRR 10.2 │ last check PASS │ 00:24:17 │
└────────────────────────────────────────────────────────────────────────────────┘
```

- Top bar: command palette input (`Ctrl/⌘ K`), Active Target selector (D-002), Lab Host
  state, settings, identity. No search bar separate from the palette.
- Sidebar groups and items (final):
  - CORE: Control Center, Courses, Labs, Practice, Skills Graph, Career Target, Career
    Matrix, Job Inspector, Training Queue, Interview, Work Orders, Review Queue
  - INTELLIGENCE: Companies, Jobs, Sources, Certifications, Maintenance
  - SYSTEM: Infrastructure, Runtimes, Settings
- Persistent lab-host widget bottom-left (CPU, memory, envs) and Active Target/readiness
  summary; both read-only.
- Status bar: version, connection state, current workspace id, seed, runtime versions,
  last check, timer. Fields beyond the first three are per-screen.
- Breadcrumb path above every title; title uppercase monospace; subtitle one sentence.

## 2. Typography

- UI text: system sans (Inter/SF/Segoe), 13 px base, 12 px in dense tables, 11 px uppercase
  tracked labels for pane headers and metadata keys.
- Monospace (JetBrains Mono / ui-monospace) for identifiers, seeds, versions, timestamps,
  numeric table columns, terminals, logs, diffs, configuration.
- Titles: 20 px uppercase monospace with +0.04em tracking. No display fonts.
- Numbers are right-aligned in tables and tabular-nums everywhere.

## 3. Density, spacing, surfaces

- 4 px grid. Pane padding 12 px. Table row height 28 px (24 px in "compact" mode).
- Border radius 2–4 px. 1 px borders (`--border`), no shadows, no gradients, no hero areas.
- Panes are resizable splits with a 1 px divider; each pane has an uppercase header row
  with optional actions on the right. Panes remember size per workspace.
- Tabs: text tabs with a 2 px underline; closable tabs show `×` on hover; tabs are
  keyboard-navigable (`[` `]`).
- Cards are not used for metrics. A metric is a row in a table or a status-bar field.

## 4. Color and status

Dark canvas by default (`--bg #0b0e14`, `--panel #10141c`, `--border #1f2630`, text
`#d7dde5` / muted `#8b95a3`). Accent is a single blue for primary actions and selection.
Semantic colors are reserved for state:

| Token           | Use                                              |
| --------------- | ------------------------------------------------ |
| success (green) | passed, ready, current, online                   |
| info (blue)     | active, in_progress, running checks              |
| warning (amber) | needs_review, stale, degraded, capped            |
| danger (red)    | failed, broken, blocking, destroyed-with-error   |
| muted (grey)    | queued, pending, not started, destroyed          |
| violet          | fault_injection / fault_check, AI-derived values |

Heat maps use a five-step scale (`0–19, 20–39, 40–59, 60–79, 80–100`) with a legend and a
low-evidence overlay (hatched or reduced opacity) when evidence count < 5.

## 5. Identifiers and lifecycle vocabulary (D-038)

- `HM-WO-0184` work orders · `HM-LAB-829143` lab sessions · `HM-INC-20260908-001`
  incidents · `HM-INT-00412` interviews · `HM-LESSON-<course>-<nn>` lessons ·
  `HM-JOB-<company>-<nnn>` imported postings · `HM-RVW-nnnn` review items.
- Lab lifecycle chips use RFP §86 names in snake case only: `queued`, `provisioning`,
  `baseline_check`, `fault_injection`, `fault_check`, `ready`, `active`, `grading`,
  `completed`, `destroying`, `destroyed`, `failed`.
- Connection state is a separate chip: `connecting`, `synchronizing`, `online`,
  `offline`, `finished`.
- Content QA states: `draft`, `technical_review`, `instructional_review`,
  `execution_test`, `approved`, `published`, `deprecated`, `archived`.
- Work-order states: `draft`, `exported`, `in_progress`, `implemented`,
  `validation_failed`, `review_required`, `approved`, `done`.
- Maintenance freshness: `current`, `needs_review`, `stale`, `broken`, `update_available`.
- Chips are lowercase monospace text on a tinted background; never title case, never
  "IN PROGRESS".

## 6. Confidence and precision (D-014, RFP §153–154)

Every mastery, readiness, or match number is rendered by one component with four parts:

```text
62%  ·  conf medium  ·  12 evidence  ·  tested 12d ago
```

- Compact variant for tables: `62% ▮▮▯` (bars = confidence low/medium/high) with the full
  form on hover.
- Heat-map cells show the number and the low-evidence overlay.
- Never a bare percentage, never a donut/gauge, never an animated counter.
- Predictions use ranges or labels (`likely +10–15%`, `impact HIGH`), never `71% → 84%`.
- Career pages carry the fixed line: "Readiness is alignment with the modeled role, not a
  hiring probability."
- Hard-requirement gates render a `BLOCKING` chip (danger) on the row and in summaries.

## 7. Tables

Dense, sticky header, sortable columns, monospace numerics, row actions revealed on hover
or via `…`, multi-select with a checkbox column only where bulk actions exist, filters as
a toolbar row above the table, count in the pane header, pagination or virtual scroll
above 200 rows. Empty and error rows render inside the table, not as modals.

## 8. Command palette and keyboard

- `Ctrl/⌘ K` opens the palette. Commands are namespaced: `nav:`, `lab:`, `course:`,
  `wo:`, `career:`, `system:`. Results show the shortcut on the right.
- Global shortcuts: `g c` Courses, `g l` Labs, `g p` Practice, `g s` Skills Graph,
  `g t` Career Target, `g w` Work Orders, `g r` Review Queue, `?` shortcut help,
  `Esc` close, `[` `]` previous/next tab, `` Ctrl+` `` focus terminal,
  `Ctrl+Shift+E` copy context for Claude.
- Shortcuts are displayed as `<kbd>` chips in menus and tooltips.

## 9. AI execution modes (D-009)

- Every AI-assisted action shows an execution badge: `external` (default) or `api`.
- In `external` mode the only affordances are `Copy for Claude`, `Export .md`,
  `Open work order`, `Import result`. No spinners implying a running agent, no "assignee:
  Claude", no live rubric updates, no chat surface.
- In `api` mode (only when an executor is configured) streaming responses and live
  evaluation may appear, always labelled `api · <model tier>` with the budget remaining
  visible in Settings.
- AI-derived values (methodology, safety, communication scores, coaching text) are
  visually separated from deterministic values and tagged `AI`.

## 10. No answer leakage

Learner-facing surfaces never show: the injected fault, the reference solution, hidden
test names or bodies, the exact fix, grader internals, or authored "tips" that name the
fix. Hints are explicit tiered actions that display their mastery cap before use (D-016).
Author-only surfaces (Forge author view, Authoring, Review Queue) may show faults and
solutions and are marked `author view`.

## 11. Forbidden elements (D-037)

KPI cards with giant numbers, donut/gauge charts, streaks, XP, badges, confetti,
motivational quotes, "Welcome back" headers, cartoon illustrations, hero images, gradient
panels, oversized rounded tiles, adjectives about the learner ("good discipline"),
"Happy learning!" strings, external course logos as primary content.

## 12. Empty, loading, error conventions

- Empty: one line of monospace muted text plus the single action that creates the first
  item. No illustrations.
- Loading: skeleton rows in tables, a thin progress bar under the top bar for navigation,
  pane-level `loading…` text for slow panes. No full-page spinners.
- Error: inline banner inside the affected pane with the error code, a `retry` action,
  and a `copy details` action. Session-level errors (lab failed) surface in the status bar
  and the lifecycle chip.

## 13. Source policy on screen (D-011)

External resources are listed as pointers with an `external · not ingested` tag and never
as work items. Work items are HiveMind lessons, labs, problems, or interviews with ids.

## 14. Component inventory

`Shell`, `CommandPalette`, `Breadcrumb`, `WorkspaceTitle`, `Pane`, `SplitLayout`, `Tabs`,
`StatusChip` (lifecycle/connection/QA/work-order/freshness variants), `IdBadge`,
`ConfidenceScore` (full/compact/heat-cell), `DataTable`, `Terminal` (xterm), `Topology`,
`DiffView`, `LogView`, `Timeline`, `Editor` (Monaco), `WorkOrderPanel`, `ExecutionBadge`,
`HintControl`, `ObjectiveList`, `LabHostWidget`, `TargetSummary`, `KbdHint`.

## 15. Desktop-first

Minimum supported viewport 1280 × 720. Below that, panes stack and the sidebar collapses
to icons; nothing is optimized for phones (D-037).
