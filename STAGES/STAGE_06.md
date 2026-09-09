# Stage 06 — Mastery, evidence, practice loop, career engine v1

## Purpose

Implement the versioned learner model: evidence-weighted skill mastery with confidence,
hint caps, Elo-like difficulty calibration, FSRS-style retention scheduling, the adaptive
"New Problem" loop, and the first functional Career/Readiness Engine (D-002) with role
profiles, competencies, hard-requirement gates, and readiness history. Ship Skills,
Practice, Dashboard, and Career pages (RFP §119 items 8–14).

## User-visible outcome

After each attempt Jacob's skill mastery and confidence update visibly; Practice offers
"New Problem" tuned to weak and decaying skills; Skills shows the graph with mastery,
recency, and trend; Career shows the Meta Network Engineer target with readiness, blocking
gaps, confidence, and a "Train for this role" action that picks the next activity.

## In scope

- `algorithms` package with versioned implementations: `mastery.v1` (evidence-weighted:
  correctness, independence via hint tier caps, difficulty, blind vs guided, repeated
  success, recency), `difficulty.v1` (Elo-like per archetype vs learner), `retention.v1`
  (FSRS-style intervals once ≥ N attempts, simpler fallback before), `readiness.v1`
  (competency roll-up with gates and confidence). Each records its version on every output.
- Evidence model: dimensions per D-015 stored separately; AI methodology fields exist but
  are not consumed by mastery.
- Practice mode: adaptive / domain / skill / difficulty selection → validated instance;
  repetition avoidance.
- Skills page (graph, drill-down), Dashboard (RFP §88), History enhancements (mastery
  deltas), Career pages (RFP §150–152 subset: target, readiness, gaps, next best action,
  history).
- Role profiles: `meta.network_engineer.deployment_support` and generic `network_engineer`,
  `data_center_network_engineer`, `sre` as content files with competency → skill weights and
  required mastery.
- Certification and interview evidence hooks as placeholders (filled in Stage 08).

## Explicitly out of scope

- AI coaching text, methodology scoring (Stage 08).
- Company research and job import (Stage 10 via work orders).
- Coding attempts as evidence beyond the contract (Stage 07 feeds the same tables).

## Prerequisites / dependency stages

Stages 01–04 (attempts exist), Stage 05 (content states). Stage 07 may run in parallel and
feeds evidence later.

## UI specifications

Implement these companion specifications (authority: `DECISIONS.md` → `docs/ui/UI-SYSTEM.md` → companion → this stage → mockup image):

- `docs/mockups/09-skills-graph.md`
- `docs/mockups/05-career-target.md`
- `docs/mockups/06-career-matrix.md`
- `docs/mockups/13-training-plan.md`
- `docs/mockups/07-problem-forge.md` (learner Practice view)
- `docs/mockups/04-course-workspace.md` (Mastery tab)
- `docs/mockups/08-lab-review.md` (mastery deltas)

## Architecture decisions already locked

D-002, D-014, D-015, D-016, invariants 1, 9.

## Files/modules owned by this stage

`packages/core/src/algorithms/**`, `packages/core/src/mastery/**`,
`.../practice/**`, `.../careers/**`, `apps/web/app/(app)/{practice,skills,career}/**`,
`apps/web/app/(app)/page.tsx` (dashboard), `content/careers/roles/**`.

## Interfaces/contracts consumed

`Attempt`, `Evidence`, hint usage (04), `ProblemInstance` difficulty (03), `RoleProfile`,
`Competency` (01).

## Interfaces/contracts created

- `MasteryUpdate`, `SkillState`, `ReadinessSnapshot` records with algorithm versions.
- Practice API: `POST /practice/next`.
- Career API: targets, readiness, gaps, next action.
- Algorithm version registry and replay tool (`hivemind algorithms replay --version`).

## Data/schema changes

D1 migration `0007`: `skill_states`, `mastery_updates`, `difficulty_ratings`, `retention_schedule`,
`learner_targets`, `readiness_snapshots`, `algorithm_versions` filled.

## Acceptance criteria

1. Replaying all historical attempts with `mastery.v1` from scratch reproduces current
   `skill_states` exactly; introducing `mastery.v2` produces new rows and leaves v1 intact.
2. Hint tiers cap gain per D-016 (unit tests with fixed fixtures); a revealed solution yields
   near-zero independent credit but records completion.
3. Confidence and evidence counts shown wherever a percentage is shown (UI test).
4. Readiness gates: the D-127 scenario (strong Python/Linux, weak BGP/IS-IS) yields a
   blocked readiness with listed gaps, not an inflated score.
5. "New Problem" avoids repeating the last 5 instances for a skill and prefers decaying
   skills (deterministic given seeded RNG).
6. Readiness history accumulates per week; "Train for this role" returns one action with a
   reason.

## Automated test requirements

Property-based tests for algorithm monotonicity and bounds; replay determinism tests;
API tests; UI tests for confidence display.

## Manual QA requirements

Jacob uses the loop daily for a week and reports whether recommendations feel right;
tune constants, not history.

## Security constraints

Learner-scoped queries only; algorithm inputs exclude any AI text.

## Performance expectations

Mastery update under 200 ms per attempt; readiness recompute under 2 s for 300 skills.

## Migration requirements

D1 migration `0007`; backfill by replaying attempts through `v1`.

## Rollback requirements

Algorithm versions are additive; UI can pin a version.

## Known risks

- Constants tuned on one learner; document them as such (D-014: no false precision).
- Career engine scope creep into Stage 10 research features.

## Forbidden shortcuts

Recomputing history in place; feeding AI scores into mastery; a single overall percentage
without breakdown and confidence.

## Definition of done

- [ ] Acceptance 1–6; RFP §119 items 8–14 demonstrable.
- [ ] Formulas documented in `docs/ALGORITHMS.md` with versions; `DECISIONS.md` entry.
- [ ] Milestone commit `feat(stage-06): mastery and career engine v1` and tag `stage-06`.
