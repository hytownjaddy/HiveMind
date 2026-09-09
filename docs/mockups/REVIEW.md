# Mockup Review (2026-09-09)

Reviewed: 22 images in `docs/mockups/`. Governing rules: D-037 (engineering workstation,
desktop-first, no gamification, confidence with every percentage), D-038 (identifiers and
lifecycle vocabulary), D-009 (AI runs as External Work Orders by default), D-014/D-016
(no false precision; hints cap gain), D-023 (mockups are direction, not pixel spec).

## Verdict

Screens 2–10 and 12–18 are the right product. Two of them (1, 11(1)) are the old SaaS
language and should be redone; one (11(2)) is not HiveMind at all. The set contains two
different visual systems, and the later one (12–18) is the one to keep. Details below.

## File → screen map (updated 2026-09-09 after Jacob's second pass)

| File                                                 | Screen                                         | Status                                             |
| ---------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------- |
| `01-control-center.png`                              | Control Center (redone in the canonical shell) | Keep; small corrections in spec                    |
| `02-lab-workspace.png`                               | Lab Workspace, BGP route reflection            | Keep, signature screen                             |
| `03-coding-workspace.png`                            | Coding Workspace                               | Keep                                               |
| `04-course-workspace.png`                            | Course Workspace                               | Keep                                               |
| `05-career-target.png`                               | Career Target                                  | Keep                                               |
| `06-career-matrix.png`                               | Career Matrix                                  | Keep                                               |
| `07-problem-forge.png` / `07a-problem-forge-alt.png` | Problem Forge (preferred / alt)                | Keep / reference                                   |
| `08-lab-review.png`                                  | Post-Lab Review                                | Keep                                               |
| `09-skills-graph.png`                                | Skills Graph                                   | Keep, reference for numbers                        |
| `10-interview-workspace.png`                         | Interview Workspace                            | Keep, AI-mode fix                                  |
| `11-company-intelligence.png`                        | Company Intelligence (new)                     | Keep; corrections in spec                          |
| `12-job-inspector.png`                               | Job Inspector                                  | Keep, strongest                                    |
| `13-training-plan.png`                               | Training Plan                                  | Keep                                               |
| `14-work-orders.png`                                 | Claude Work Orders                             | Keep, status/AI-mode fix                           |
| `15-maintenance-console.png`                         | Maintenance Console                            | Keep                                               |
| `16-source-library.png`                              | Source Library                                 | Keep                                               |
| `17-course-authoring.png`                            | Course Authoring                               | Keep                                               |
| `18-infrastructure-console.png`                      | Infrastructure (Lab Host) Console              | Keep, add Cloudflare side                          |
| `19-certifications.png`                              | Certifications                                 | Rejected layout; spec 19 defines the table version |

Removed by Jacob: the old SaaS Control Center, the DNS-manager stray, and the alternate
lab-run page (its Timeline/Logs panes are folded into spec 02).

Specs without an image: `20-incident-command-center.md`, `21-review-queue.md`,
`22-settings.md` (derived from 02, 14/17, 14 respectively). Each companion `.md` is the
implementation contract; the images are reference only (D-041).

## Cross-cutting findings

1. **Two visual systems.** Screens 2–11 use the rounded "HiveMind" shell with a flat
   sidebar; screens 12–18 use the monospace "HIVEMIND" shell with uppercase titles and a
   grouped sidebar (CORE / INTELLIGENCE / SYSTEM). The second is closer to the D-037 rule
   and its navigation groups map directly onto stages. Recommendation: adopt the 12–18
   system as the design language and re-skin 2–10; their layouts are right.
2. **Navigation.** Unify on the grouped sidebar. Proposed groups: CORE (Control Center,
   Courses, Labs, Practice/Forge, Skills Graph, Career Matrix, Job Inspector, Training
   Queue, Interview, Work Orders); INTELLIGENCE (Companies, Jobs, Sources, Certifications,
   Maintenance); SYSTEM (Runtimes, Lab Hosts, Settings). The persistent "Lab Host / CPU /
   Memory / Envs" widget and the Active Target selector in the header are good; keep both.
3. **Identifiers.** The set uses `HM-48291`, `HM-3102`, `HM-INT-0042`, `HM-COURSE-02-01`,
   `lab-32781`, `q-9012`. Normalize to D-038: `HM-LAB-829143`, `HM-WO-0184`,
   `HM-INC-20260908-001`, `HM-INT-00412`; add `HM-LESSON-…` and `HM-JOB-…` if needed.
4. **Lifecycle vocabulary.** Chips say IN PROGRESS, Running, Ready, Completed, Live
   Session. Use the RFP §86 names in snake case everywhere (`provisioning`, `ready`,
   `active`, `grading`, `completed`, `destroyed`) and show connection state separately.
5. **Confidence.** Screens 5, 9, 12 show confidence next to numbers; 1, 4, 6, 8, 13 show
   bare percentages. Every mastery or readiness number needs confidence and evidence count
   (D-014), including heat-map cells (e.g., a dot or opacity for low evidence).
6. **False precision.** "+13%", "71% → 84% (est.)", "+1.4% readiness" appear in 12, 13.
   RFP §149/§154 allow approximate planning signals only: use ranges or labels
   (`likely +10–15%`, `HIGH impact`) and keep the "alignment, not hiring probability" line
   visible on career pages.
7. **AI execution mode.** Several screens imply server-side AI: Interview "Interviewer
   Rubric (Live), auto-evaluating"; Work Orders "Assignee: Claude (Sonnet 4)" and
   "Claude agent initialized" log lines; Authoring "Generate with Claude". Under D-009 the
   default is External: show `Copy for Claude` / `Export .md` / `Import result`, an
   execution-mode badge (`external` | `api`), and only show live evaluation when an API
   executor is configured.
8. **Hints and answers leaking.** 11(3) has a "Lab Tips" banner that states the fix
   (next-hop-self). 7(1) previews "Sample Faults (hidden in lab)" in the learner's view.
   Hints must be tiered, deliberate, and show their mastery cap (D-016); fault previews are
   author-only or Guided-mode-only.
9. **Hidden tests.** Screen 3 lists `test_hidden_timeout_case` by name before submit. Show
   a count (`hidden: 3`) that cannot be opened.
10. **Source policy on screen.** 13 recommends INE, Udemy, EVE-NG; 11(1) links Udemy and
    YouTube courses. External pointers are allowed, but the plan's work items must be
    HiveMind labs and lessons, external resources marked `external, not ingested`, and
    EVE-NG replaced by our runtime (containerlab).
11. **Motivational residue.** "Good discipline" (8), "Happy learning!" (11(3)),
    "Certifications open doors" and the mountain hero (11(1)), quotes in 1. Remove.

## Per-screen notes

- **02 Lab Workspace.** Keep as the anchor. Add: lifecycle chip separate from connection
  state; idle-expiry countdown; recording indicator; seed shown once (it appears twice)
  next to generator/topology/fault/grader versions; per-objective grader results after
  Submit including an "unrelated systems unchanged" check; a mode indicator (Guided /
  Challenge / Incident) that changes what the ticket pane reveals. Merge the Event
  Timeline and Logs panes from 11(3) as tabs beside Terminals. "Run Validation" mid-lab is
  fine if labelled as a check, with grading on Submit.
- **03 Coding Workspace.** Right shape. Hidden tests as count only; runtime state should
  name the provider class (Sandbox) and show the build-step slot; hints show cap.
- **04 Course Workspace.** Add content version + QA state badge, provenance markers on
  claims linking to Sources, and "Create work order from this lesson". The right-rail skill
  bars need confidence.
- **05 Career Target.** Good; add a `BLOCKING` marker for hard-requirement gates (reuse
  12's BLOCKER style), the §154 disclaimer line, and one "next best action" with reason.
- **06 Career Matrix.** Good; add confidence/evidence indication per cell, gate markers,
  and confidence on "Your Readiness".
- **07 Problem Forge.** Prefer 7(2). Make the generation log show the §46 pipeline steps
  (schema → baseline → fault → verify → reference → grade) and coverage/diversity stats as
  in 7(2). Author vs learner views differ on fault visibility.
- **08 Lab Review.** Good CI-run feel. Change "Hints used 2 (-10% each)" to "mastery gain
  capped at X% (2 hints)"; split deterministic results from AI methodology (marked
  external/optional); keep config diff and command log.
- **09 Skills Graph.** Best screen for D-014 (mastery, confidence, last practiced,
  retention risk). Use it as the reference for how numbers are presented elsewhere.
- **10 Interview.** Keep layout; replace live auto-evaluation with "Conduct in Claude" +
  transcript/score import in External mode; Whiteboard tab is the §65 canvas, later.
- **12 Job Inspector.** Strongest screen; keep BLOCKER, PR-diff training plan, raw/parsed
  posting. Fix precision language.
- **13 Training Plan.** Good backlog. Work items become HiveMind entities with ids; group
  NOW / NEXT / LATER as the brief said; dependencies and role impact as labels.
- **14 Work Orders.** Align statuses to `draft → exported → in_progress → implemented →
validation_failed | review_required → approved → done`; "Validate" runs
  `hivemind work validate`; repository is the monorepo path under `content/`; add batch
  view for maintenance orders; change report tab.
- **15 Maintenance.** Matches the stage. "Run Full Refresh" generates a batch work order;
  deterministic checks (URL, version, regression results) can run server-side.
- **16 Source Library.** Add trust dimensions (§168), policy class (ingestable vs
  notes-only), and "Claims depending on this source" (§35).
- **17 Course Authoring.** The diff-for-approval pattern is exactly D-010. QA state
  dropdown should use §108 states; "Generate with Claude" becomes "Create work order".
- **18 Lab Host Console.** Add the Cloudflare half (Durable Objects, D1, R2, Sandbox
  sessions) and per-session provider class; rename to Infrastructure.

## Mapping to stages

| Stage                          | Screens                                                                                       |
| ------------------------------ | --------------------------------------------------------------------------------------------- |
| 01 Foundation                  | 01 Control Center (redo), 04 Course Workspace (Lesson + Sources tabs), 14 Work Orders (panel) |
| 02 Lab runtime                 | 18 Lab Host / Infrastructure                                                                  |
| 03 Problem engine              | 07 Problem Forge (author view)                                                                |
| 04 Lab workspace               | 02 Lab Workspace (+ 11(3) panes), 08 Lab Review                                               |
| 05 Authoring                   | 17 Course Authoring, 14 Work Orders (full), Review Queue (missing), 16 Source Library         |
| 06 Mastery + career v1         | 09 Skills Graph, 05 Career Target, 06 Career Matrix, 13 Training Plan, 07 (learner view)      |
| 07 Coding lab                  | 03 Coding Workspace                                                                           |
| 08 AI modes, interviews, certs | 10 Interview, 19 Certifications (redo), Settings/AI mode (missing)                            |
| 09 Network depth, incidents    | Incident Command Center (missing)                                                             |
| 10 Maintenance                 | 15 Maintenance Console, 11 Company Intelligence (missing), 12 Job Inspector                   |

## Status

Companions drafted for all 22 screens (2026-09-09). Remaining optional images: a table-style
Certifications page (19), Incident Command Center (20), Review Queue (21), Settings (22).
None block any stage.
