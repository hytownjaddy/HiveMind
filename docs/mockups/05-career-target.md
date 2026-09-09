# 05-career-target

REFERENCE ONLY: `docs/mockups/05-career-target.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/05-career-target.png
```

## Purpose

The active role as a technical requirements matrix: skill, target, current, gap,
confidence, last tested, evidence, action. Clicking a weakness opens the best training
action.

## Stage

Stage 06 (role profiles, readiness, actions); role details from Stage 01 schemas.

## Visual Reference

`05-career-target.png`.

## Shell

Canonical. Status bar: role profile id and version, last refreshed.

## Layout

- Header: company/role, `primary target` chip, profile version, last refreshed, actions
  `refresh via work order`, `open postings`.
- Tabs `Overview | Skills | Requirements | Postings | Interview | Related | Notes`.
- Skills: dense table (Skill, Domain, Target, Current, Gap, Confidence, Last tested,
  Evidence, Action) with `BLOCKING` chips on gated rows; filters `missing only`, `domains`.
- Bottom-left: `TOP GAPS`; bottom-center: `NEXT ACTIONS` (one primary with reason);
  right rail: role details, readiness by domain with `ConfidenceScore`, disclaimer line.

## Required Data

Role profile (competencies → skills, weights, required mastery, gates), skill states
(mastery, confidence, evidence count, last tested), readiness snapshot, recommended
actions with reasons, postings summary, freshness.

## Lifecycle States

Profile freshness chip (`current`/`stale`).

## Confidence Rules

Every current-level cell renders `ConfidenceScore` compact; readiness by domain and overall
render the full form; gates render `BLOCKING`; disclaimer line always visible.

## AI Execution

`refresh via work order` creates `career.refresh_role`; no inline AI.

## Learner Safety / Leakage

None.

## Corrections From Mockup

- Add `BLOCKING` marker for hard requirements (§127); add disclaimer line.
- Overall readiness gets confidence and evidence count.
- "Recommended Next Steps" → one primary `next action` with reason plus a short list.
- Identifier and version for the profile in the header.

## Keyboard Shortcuts

`f` focus filter, `m` toggle missing-only, `Enter` open action for the selected row.

## Empty States

No target: `select a role profile` with the generic profiles listed.

## Error States

Stale profile → freshness chip `stale` with `create refresh work order`.

## Acceptance Criteria

1. Gated scenario from RFP §127 renders as blocked readiness with listed gaps.
2. Row action opens a validated practice instance or lesson.
3. All numbers carry confidence; disclaimer present.
