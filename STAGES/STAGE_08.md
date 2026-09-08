# Stage 08 — AI execution modes, tutor/review/interview, certifications

## Purpose

Introduce AI-assisted features behind a dual-mode abstraction: **External Agent** (default;
HiveMind assembles a context-rich prompt for Claude/Claude Code and imports a structured
result) and **API Executor** (optional; provider-abstracted, Anthropic first, hard budget
ceiling). Deliver contextual tutoring, post-attempt methodology review, mock interviews
with replay, certification mapping, and the interview-readiness dimension (RFP §119 items
7 and 15; D-009, D-015).

## User-visible outcome

In a lab, Jacob clicks "Ask about this" and gets a copyable prompt with lesson, topology,
state, and command context (or an inline answer if an API executor is enabled). After an
attempt, "AI review" produces a rubric-driven prompt whose structured result he imports;
methodology, safety, and communication scores appear separately from mastery. Interview
mode runs a role-specific mock interview in his Claude session and imports the transcript
and scores; certifications (CCNP-SP, JNCIA-DC, RHCSA, CCNA, CKA) map onto skills with
coverage and readiness.

## In scope

- `ai` package: `AITask` abstraction, prompt packs (tutor, methodology review, interview,
  coach summary), context assemblers (deterministic), result schemas and importers (paste or
  file), provenance of AI outputs.
- Executors: `ExternalWorkOrderExecutor` (default), `AnthropicAPIExecutor` with model tiers,
  caching, per-task and monthly ceilings, kill switch; settings UI to choose mode per
  feature.
- Methodology scoring storage and display (D-015 dimensions); interview readiness
  computation feeding Stage 06 readiness as its own dimension.
- Interview mode v1: question families per role, conduct in external mode, replay, scores.
- Certification content: blueprints as content files mapped to skills; coverage and
  readiness views (RFP §68–69).
- Weekly coach summary (RFP §59) as a generated prompt with import.

## Explicitly out of scope

- Live conversational interviews inside the app unless the API executor is on (still
  built behind the abstraction).
- Network design canvas (RFP §65) — later.
- Autonomous maintenance batches (Stage 10).

## Prerequisites / dependency stages

Stages 04, 06 (attempts, mastery, readiness), 05 (work orders, review).

## Architecture decisions already locked

D-009, D-015, invariants 3, 4, 10.

## Files/modules owned by this stage

`packages/hivemind-core/hivemind_core/ai/**`, `services/api/hivemind_api/ai/**`,
`.../interviews/**`, `.../certifications/**`, `apps/web/app/(app)/interview/**`,
`apps/web/components/ai/**`, `content/interviews/**`, `content/certifications/**`,
`docs/wireframes/interview-mode/**`.

## Interfaces/contracts consumed

Attempts, telemetry, recordings, mastery/readiness (06), role profiles, work orders.

## Interfaces/contracts created

- `AITask`, `PromptPack`, `AIResult` schemas; import endpoints.
- Executor interface and budget ledger.
- Interview session and transcript schemas; certification blueprint format.

## Data/schema changes

Alembic `0008`: `ai_tasks`, `ai_results`, `ai_budget_ledger`, `methodology_scores`,
`interviews`, `interview_questions`, `interview_attempts`, `certifications`,
`certification_objectives`.

## Acceptance criteria

1. With no API key configured, every AI feature works in External mode end to end (prompt
   → paste result → stored and displayed).
2. Enabling the Anthropic executor with a $1 test ceiling stops at the ceiling and reports
   it; results are cached by context hash.
3. Methodology scores never change `skill_states` (replay test).
4. A mock interview for the Meta profile runs externally; imported scores update interview
   readiness only.
5. Certification coverage report for CCNP-SP lists uncovered objectives as curriculum gaps.
6. Prompt packs contain no secrets and redact terminal content (test fixture).

## Automated test requirements

Unit tests for assemblers and importers with golden files; executor tests with a mock
provider; budget tests; readiness integration tests.

## Manual QA requirements

Jacob runs a tutor question, an AI review, and a full mock interview in External mode and
judges usefulness; optionally trials the API executor for a day within the ceiling.

## Security constraints

API keys in the host secret store only; outbound calls only from `services/api`; imported
results validated against schemas; AI text never executed.

## Performance expectations

Prompt assembly under 1 s; API executor responses streamed.

## Migration requirements

Alembic `0008` with downgrade.

## Rollback requirements

Executors are pluggable; External mode is always available as fallback.

## Known risks

- Prompt packs drifting from repository docs; keep standing rules in docs, not prompts.
- Interview scoring subjectivity; store rubric version with results.

## Forbidden shortcuts

Using a logged-in Claude session or Claude Code as a server-side API; letting AI results
influence mastery; silent API spend.

## Definition of done

- [ ] Acceptance 1–6; RFP §119 items 7 and 15 true.
- [ ] `docs/AI_MODES.md` written; `DECISIONS.md` entry on executor defaults.
- [ ] Milestone commit `feat(stage-08): AI execution modes and interviews` and tag `stage-08`.
