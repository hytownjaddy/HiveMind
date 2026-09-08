# RFP Review: HiveMind

Reviewer: Claude (session of 2026-09-08). Scope: `docs/RFP.md` as of today, all 220 sections.
Purpose: surface ambiguities, contradictions, scope risk, and missing decisions **before**
stage planning. Nothing here is a decision; the "Decisions needed" list at the end is yours.

> **Status (2026-09-08):** Jacob answered the decisions in §7; they are recorded in
> `DECISIONS.md` (D-001 to D-025, plus derived D-026 to D-029). Decision D-007 changed the
> control plane to FastAPI/PostgreSQL/Redis with Cloudflare at the edge, which supersedes
> §3.1's recommendation and the scaffold's Durable Object design. The stage map in §6 is
> superseded by `STAGES/`. The analysis in §3–5 still stands.

---

## 1. Overall assessment

The RFP is unusually complete on _what the product should feel like_ and on _principles_
(§2, §118, §121 are excellent and should be treated as invariants). It is thin on
_how the pieces are computed_ (mastery, readiness, difficulty) and on _where the
expensive things run_ (lab hosts, code sandboxes, AI). It is also roughly three products:

| Product                            | Sections                       | Depends on                                     |
| ---------------------------------- | ------------------------------ | ---------------------------------------------- |
| Learning + labs platform           | §1-59, §78-121                 | nothing                                        |
| Career target and readiness engine | §60-72, §122-156 (46 sections) | stable skill graph, mastery, attempts          |
| Autonomous maintenance system      | §157-220 (64 sections)         | stable content model, a maintenance API (§217) |

Half of the document by section count describes the second and third products. Both are
valuable and both are late. The main risk in this RFP is not technical; it is that the
first product never reaches the MVP bar in §119 because effort leaks into the other two.

The RFP's own Phase 1 (§97-100) is still very large: three courses, three runtime classes
(Docker, containerlab/FRR, coding sandbox), Monaco, xterm, 30 problem archetypes/fault
modules, an AI tutor, and post-attempt review. It should be split further. Section 6 of
this review proposes how.

---

## 2. Strengths worth protecting

- **§2.1 / §118 boundary**: AI proposes, schemas constrain, code instantiates, validators
  prove, deterministic graders judge, AI only scores methodology. Every stage plan should
  cite this and every PR should be checkable against it.
- **§46-47 validation pipeline and reproducible seeds**: the only credible way to make
  "infinite practice" trustworthy. This is core infrastructure, not a feature.
- **§105-106 expansion contract**: courses = content + skill graph + optional lab
  provider + optional generators, with capability ids. This is the right plugin model and
  the current scaffold already speaks it (`capability: terminal.linux`).
- **§153-154 confidence and no-false-certainty**: keep these as UI rules from the first
  screen that shows a percentage.
- **§158, §198, §200, §217**: content and workflows in git, proposals not edits, approval
  gates, a maintenance API instead of database access. These constrain the whole
  architecture in a good way: content must be files.

---

## 3. Contradictions and tensions to resolve

### 3.1 Recommended stack vs the chosen stack

§79-83 recommend Next.js + FastAPI + PostgreSQL + Redis + a worker pool. You have chosen
Next.js on Cloudflare (OpenNext, Durable Objects, D1). These are reconcilable, but the RFP
should say so explicitly:

- Cloudflare can own the web app, identity, session/lifecycle authority (Durable
  Objects), the durable index (D1), queues, object storage (R2), and the AI layer.
- Cloudflare **cannot** run Docker, containerlab, FRR, KVM, or Kubernetes. Every "real
  environment" section (§36-40, §98) implies at least one Linux **lab host** outside
  Cloudflare. That host needs an agent, an API, and a security boundary. It is the largest
  single piece of work in Phase 1 and the RFP does not describe it.
- §80's argument for Python ("aligns with Python refresh goals", orchestration, grading)
  still applies to the lab host agent even if the control plane is TypeScript.

**Recommendation:** amend §79-83 to a hybrid: Cloudflare control plane, Python lab-host
agent(s) speaking a versioned HTTP/WebSocket protocol to the `LabSession` object.

### 3.2 Single learner vs multi-user security

§1 says "personal, continuously evolving technical university"; §112 optimizes for one
specific learner; §85 lists multi-user isolation requirements "for eventual multi-user
release"; §39 wants microVMs "for public-user isolation". Building for public users
roughly doubles lab-runtime effort (Firecracker, quotas, egress control, metadata-service
blocking) and adds accounts, billing, abuse handling.

**Recommendation:** declare single-user (or "trusted handful") as the design point for
Phases 1-3. Put a hard line in the RFP: no untrusted code execution from anonymous users
until a dedicated stage. This alone removes §39, most of §85, and the account system from
early stages. For identity, Cloudflare Access in front of the app gives single-user auth
with zero application code.

### 3.3 Who writes Phase 1 content?

§100 says "do not initially build fully autonomous course generation", and the course
compiler is Phase 4 (§103). But §110 defines a lesson as 12 elements and Phase 1 wants
three full courses. Hand-authoring three courses at §110 quality is months of writing.
In practice content will be AI-drafted and human-reviewed from day one, which is exactly
the §108 QA pipeline (DRAFT → reviews → EXECUTION_TEST → APPROVED).

**Recommendation:** split "course compiler" into (a) the _authoring pipeline_ (schemas,
QA states, review tooling, execution test hooks), which is Phase 1 infrastructure, and (b)
_autonomous generation from arbitrary sources_ (§34 stages 1-5, §73-75), which stays late.
Phase 1 then ships one deep module per runtime class, not three whole courses (see §6).

### 3.4 Skills are global; the manifest makes them per-course

§29 lists `skills` inside a course manifest. §113 says tracks share underlying skills and
"do not duplicate content". §68 maps certifications onto skills used by several courses.
§124 job profiles key off skill ids. If skill ids live inside courses, every cross-course
feature becomes a join across manifests with no owner.

**Recommendation:** a global `skills/` registry (ids, prerequisites, objectives, mastery
criteria, versions per §77). Courses _reference_ skills; they do not define them.
This is a Stage 1 decision because every later table keys off it.

### 3.5 Three scales, no mapping

The RFP uses mastery percentages (§51), eight named mastery levels (§53), difficulty 1-10
(§56), evidence sub-scores (§125), and readiness with confidence (§153). None of these are
defined mathematically and no mapping between them is given. §52 lists inputs but no
model.

**Recommendation:** pick models explicitly in the mastery stage: e.g. a per-skill
Bayesian knowledge-tracing or Elo-style estimate for mastery, FSRS-style scheduling for
retention (§54), difficulty as a property of the _problem spec_ (calibrated by §192), and
named levels as thresholds over (mastery, evidence count, recency). Whatever is chosen,
write the formulas into the RFP so the UI, graders, and career engine agree.

### 3.6 Deterministic grading vs AI scoring

§48 (deterministic) and §49 (AI methodology scoring) are compatible, but the RFP does not
say which one feeds mastery. If AI methodology scores affect mastery, §2.1 is weakened.

**Recommendation:** mastery consumes only deterministic outcomes plus objective telemetry
(time, hints, retries). AI methodology scores are stored, shown, and used for coaching and
for the _interview_ readiness dimension, never for technical mastery.

### 3.7 IP boundary vs the source list

§33 is careful. §32 then lists commercial training products (INE, KodeKloud, CBT Nuggets,
Sander van Vugt, Chris Greer). Ingesting transcripts of paid courses to "determine
coverage" is exactly the grey zone §33 warns about, and §75 permits "video transcripts when
legally available".

**Recommendation:** a written ingestion policy: primary sources (RFCs, official docs, man
pages) may be ingested and quoted with citation; owned books and paid courses may
contribute _topic lists and sequencing notes you write yourself_, never text or
transcripts. Keep provenance (§35) mandatory so this is auditable.

### 3.8 Coding sandbox is unspecified

§25-27 and §45 need a runtime with hidden tests, compilers (C++), debuggers "where
possible", and lint. §83 lumps it into the worker pool. No isolation model is given, and
running arbitrary learner code is the riskiest surface in the system.

**Recommendation:** treat the coding lab as its own stage and its own provider. Evaluate
in order: (1) browser-side runtimes for Python (Pyodide) and JS/TS for early lessons,
which need no sandbox; (2) container-per-attempt on the lab host for hidden tests and
C++; (3) microVMs only if untrusted users ever exist.

### 3.9 Terminal PTY gateway needs a host-side half

§41 asks for xterm.js and a "WebSocket PTY gateway" with multi-node tabs, reconnect,
recording. The browser half exists in the scaffold; the host half (PTY allocation per
node, exec into containers, session recording, resize) does not, and belongs to the lab
host agent.

### 3.10 Data volume and retention are undefined

§50 and §95 want every command, keystroke-level terminal history, and replay for "every
meaningful attempt". §172 talks about 2,000+ labs. No retention, storage budget, or
export/deletion policy is stated. Terminal recordings are also where secrets and personal
data leak (§85 mentions "safe file upload" but not recordings).

**Recommendation:** define retention tiers (live session in the object, summarized
attempt in D1, full recording in R2 with a TTL) and a per-attempt size cap.

### 3.11 Interview modes hide large UI and AI work

§63-67 include a topology/design canvas editor (§65), conversational AI interviewers,
STAR evaluation, and replay. §65 alone is a diagramming product. These are Phase 3, but
the RFP should note that "interview mode" is several distinct modes with very different
cost.

### 3.12 Fiber and physical data center are a different runtime class

§15 wants simulated optical telemetry; §23 is theory with a safety constraint. Neither
fits container/network runtimes. They fit the §106 model as a `telemetry.simulated`
capability, which is small, but it should be named so nobody tries to force it into
containerlab.

---

## 4. Ambiguities that will block implementation

1. **Where are lessons stored and rendered?** §28 implies MDX in git; §78 has `lessons`
   tables. Both can be true (git is source, D1/KV is the compiled index), but the compile
   step and its trigger (deploy? workflow?) are not described.
2. **What is a "problem instance" at rest?** §47 lists fields; §43 shows YAML. Is the
   instance the seed plus versions (recomputed), or the fully materialized spec? This
   affects replay (§95) after generator upgrades (§77 says history must not be rewritten).
3. **What does "submit" do in an infrastructure lab?** §91 has a Submit button; §48 says
   grade final state. Is grading run inside the lab host against live state, from a
   snapshot, or both? Can a learner submit twice?
4. **How do hints affect mastery** (§52 lists "hints")? Penalty? Cap? Recorded only?
5. **What is the unit of "attempt"** across modes: a problem, a lab session, an interview
   question, a project milestone? §78 has one `attempts` table.
6. **Accounts**: §98 says "account". One user with Cloudflare Access, or real accounts?
7. **AI provider and budget**: §107 wants tiers and caching; §207 wants per-workflow cost
   ceilings. No overall monthly budget, no provider named. (Claude via the API is the
   obvious choice; say so and pick the tiers.)
8. **Difficulty calibration before data exists** (§56 vs §192): initial difficulty must be
   authored; the RFP does not say by whom.
9. **Lab host inventory**: one machine? Your Mac? A Linux box at home? A rented server?
   This determines whether containerlab/FRR is even possible (it needs Linux, not macOS
   Docker Desktop, for realistic networking).
10. **Non-functional requirements**: none stated (latency to a terminal, session limits,
    concurrency, backup/restore of learner data, uptime). Even for one user, "my history
    survives a lab host rebuild" needs stating.

---

## 5. Things the RFP is missing

- A **glossary** (skill, subskill, objective, archetype, fault module, problem spec,
  instance, attempt, session, lab, incident, project). Several are used interchangeably.
- **Learner data export and backup.** Years of mastery history is the product's value.
- **Threat model** for the lab host even in single-user mode (the host runs arbitrary
  scenario code generated from AI proposals; §46 validation runs _reference solutions_).
- **Observability of the platform itself** beyond §206 (workflow runs). Lab host health,
  DO alarm failures, grader flakiness (§193 detects, but who is paged?).
- **Cost model**: lab host, AI, Cloudflare. A number per month would change several
  decisions (e.g. whether to keep a lab host always on).
- **Content licensing for outputs**: are generated courses yours to publish later? (Affects
  §120's "add a subject, publish a course" ambitions.)
- **Accessibility and mobile**: not mentioned. Fine to defer, but say so.

---

## 6. Proposed stage decomposition (for the ten STAGE files)

Goal: each stage is a self-contained contract that a fresh context window can execute from
`docs/RFP.md` plus its `STAGE_n.md`. Ordering principle: **decide the identities first
(skills, problem specs), isolate the risky runtime work early and separately, and defer
the two "second products" until the first one meets §119.** Ten is a suggestion, not a
constraint.

| Stage | Name                                                     | RFP sections                                                                     | Why here / what it isolates                                                                                                                                                                                                       |
| ----- | -------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | Foundation and content model                             | §28-30, §35, §76-77, §105-106, §108, §110, §78 (subset), §85 (single-user), §3.1 | Repo, Cloudflare infra (largely exists), global skill registry, course package format, content compiler git → D1, lesson renderer, QA states, identity via Cloudflare Access. Ships Learn mode with one real module. No labs.     |
| 2     | Lab host runtime                                         | §36-38, §41 (host half), §83, §86                                                | The big extracted rock: Python agent on a Linux host: Docker + containerlab + FRR, PTY over WebSocket, lifecycle, snapshot/reset, provider protocol to `LabSession`. Testable headless via CLI. Can run in parallel with Stage 1. |
| 3     | Problem specs, faults, validation, grading               | §43-48, §44 (Linux + BGP), §47, §109                                             | Schemas, topology archetypes, 10 Linux + 10 BGP fault modules, deterministic graders, seeds, the §46 pipeline as a CLI. Headless; depends on Stage 2.                                                                             |
| 4     | Lab workspace (Guided Lab + Challenge)                   | §3.2, §3.4, §41 (browser), §91, §50 (telemetry capture)                          | Wires 2 and 3 into the web app: xterm tabs per node, topology, objectives, hints, submit → grade. This is where §119 items 3-6 land.                                                                                              |
| 5     | Coding lab system                                        | §25-27, §42, §45, §5 (Python subset)                                             | Own runtime class: sandbox choice (browser WASM first, containers second), Monaco, repo templates, mutation system, hidden tests. Independent of Stages 2-4 except shared grading contracts.                                      |
| 6     | Mastery, telemetry, practice loop                        | §3.3, §49 (storage only), §50-56, §90, §93, §95-96                               | Mastery model + formulas, spaced repetition, adaptive difficulty, "New Problem", Skills and History pages. Needs attempts from 4 and 5. §119 items 8-12.                                                                          |
| 7     | AI layer                                                 | §57-59, §49 (scoring), §100, §107                                                | Tutor modes, hint generation, post-attempt methodology review, misconceptions, model tiers and caching, cost controls. Isolated behind one internal API so cost is visible.                                                       |
| 8     | Authoring pipeline and curriculum scale-out              | §31-34, §73-75, §108-111, §97 (remaining courses), §101                          | AI-assisted authoring with human review, source ingestion with the §3.7 policy, execution verification hooks (§34 stage 10). Produces the remaining Phase 1-2 courses. Later grows into the autonomous compiler.                  |
| 9     | Interview, certifications, plans, career engine          | §60-72, §122-156, §3.6                                                           | The second product. Needs 6's mastery and evidence. Split internally: role profiles + readiness first (data), then interview modes (UI/AI), then job import and comparison.                                                       |
| 10    | Maintenance workflows, agent CLI, incidents and projects | §157-220, §3.5, §3.7, §114, §201-202                                             | The third product plus the two Phase 4 modes that need everything else (blind incidents mix runtimes; projects span sessions). Requires the maintenance API (§217) over stable services from 1-9.                                 |

Things deliberately **extracted** because they are large and separable: the lab host
(2), the problem/validation pipeline (3), the coding sandbox (5), the AI layer (7), the
career engine (9), and maintenance (10). Each can be worked in its own context window
with a narrow interface to the rest.

What to do with the current scaffold: keep the infrastructure (Workers, Durable Object,
protocol package, D1, tooling, tests). Treat the labs UI and the thirteen placeholder
pages as a spike to be replaced by Stage 4 and Stage 1 respectively; delete or fence them
when Stage 1 starts so they do not become accidental design.

### Proposed STAGE file contract

So a new context window can execute a stage without this conversation, every
`STAGE_n.md` should contain:

1. **Goal** in two sentences and the §119 items it advances.
2. **RFP sections in scope** and **explicitly out of scope** (with the stage that owns them).
3. **Prerequisite stages** and the interfaces consumed from them (schemas, endpoints, CLIs).
4. **Deliverables**: packages/apps/files to exist at the end.
5. **Architecture decisions** fixed for this stage (with the review item that motivated each).
6. **Acceptance criteria**: commands that must pass, behaviors that must be demonstrable.
7. **Work breakdown** in dependency order, sized roughly.
8. **Open questions** that need a human before starting.
9. **Definition of done** including docs updated (`docs/architecture.md`, `AGENTS.md`).

---

## 7. Decisions needed from you

1. **Design point:** single-user (or trusted few) through Phase 3? (Removes §39, most of
   §85, accounts.)
2. **Lab host:** what machine runs Docker/containerlab/FRR, and is it Linux? Budget for an
   always-on host vs on-demand?
3. **Control plane:** confirm Cloudflare (Workers, DO, D1, R2, Queues) for everything
   except lab execution, and Python for the lab host agent.
4. **Identity:** Cloudflare Access for now, real accounts only if multi-user happens?
5. **First vertical slice:** which single module proves the loop? My recommendation is
   _Linux networking_ (one container, no topology) before _BGP_ (containerlab), because it
   exercises every layer with the simplest runtime; BGP follows immediately in Stage 3.
6. **Content authoring:** accept AI-drafted, human-reviewed content from day one under
   the §108 pipeline?
7. **Coding sandbox:** browser-side runtimes first, containers second?
8. **Source ingestion policy** per §3.7 above.
9. **Mastery model:** willing to fix formulas in the RFP (or delegate that to Stage 6 with
   a required RFP amendment)?
10. **Stage map:** does the ten-stage split in §6 match how you want to work, and should
    Stages 1 and 2 run in parallel in separate context windows?
11. **AI budget and provider tiers** (§107, §207): a monthly ceiling.
12. **Retention:** how long to keep full terminal recordings, and where.

---

## 8. Suggested RFP amendments (small, high leverage)

- Add a "Deployment topology" section replacing §79-83 with the hybrid described in §3.1.
- Add "Design point: single learner" near §1 and move §39 and most of §85 to a "Multi-user
  readiness" appendix.
- Move skills out of §29 into a "Skill registry" section; make §29 reference skill ids.
- Add a "Models" section with the mastery, retention, and difficulty formulas (or a
  placeholder that a stage must fill).
- Add a glossary.
- Add an ingestion policy under §33.
- Add retention and export under §78.
- Mark the Career engine (§122-156) and Maintenance system (§157-220) as "Products 2 and 3"
  with their own MVP definitions, mirroring §119.
