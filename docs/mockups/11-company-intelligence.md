# 11-company-intelligence

REFERENCE ONLY: `docs/mockups/11-company-intelligence.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/11-company-intelligence.png
```

## Purpose

Intelligence/research terminal for a company: role families, skills appearing across
postings, local facilities, hiring signals, tracked sources, profile freshness, changes
since the previous refresh, related HiveMind targets.

## Stage

Stage 10 (company profiles, refresh workflows); read-only profile view can ship with Stage
06 data.

## Visual Reference

`11-company-intelligence.png` (canonical shell): snapshot, hiring signals, career
alignment, role families, open roles, locations, common skills, company updates, actions.

## Shell

Canonical. Status bar: company id, profile version, last verified.

## Layout

- Header: company, profile version, freshness chip, actions `refresh via work order`,
  `view postings`, `diff since last refresh`.
- Tabs `Overview | Role Families | Skills Signal | Facilities | Sources | Changes |
Related Targets`.
- Overview: role families table (family, open roles, HiveMind profile link); skills signal
  table (skill, frequency across postings, trend, weight in profile); facilities table
  (site, location, phase per RFP §214, inferred hiring categories); sources table with
  trust and retrieved_at; change log (versioned diffs).

## Required Data

Company profile (versioned), role profiles, postings summaries (`HM-JOB-…`), skill
frequency stats, facilities with phases, sources with provenance, change history.

## Lifecycle States

Freshness: `current`, `needs_review`, `stale`. Facility phases: `announced`,
`construction`, `commissioning`, `operations`, `expansion`.

## Confidence Rules

Skill signal shows sample size (`n postings`); trends labelled, not percentages.

## AI Execution

External only: `refresh via work order` → `career.refresh_company`; results imported.

## Learner Safety / Leakage

None.

## Corrections From Mockup

- Career Alignment bars (`71%`, `62%`…) → compact `ConfidenceScore` with gates; add the
  §154 disclaimer line under the pane.
- "Your Level" bars in Common Skills → compact `ConfidenceScore`.
- `Refresh Data` / `Sync Company Data` → `refresh via work order` with the `external`
  badge; "Next update in 5d 9h" reflects the workflow schedule, not an automatic AI run.
- Hiring Signals: label the source and sample size (`n postings`); trend deltas are
  approximate (`~+28%`).
- Add `profile version` and freshness chip next to "Last updated".
- Role-family and role rows link to `HM-JOB-…` postings and HiveMind role profiles.

## Keyboard Shortcuts

`r` refresh work order, `d` diff.

## Empty States

No profile: `import a posting or create a company work order`.

## Error States

Stale sources listed inline with `check source`.

## Acceptance Criteria

1. Profile versions are diffable; refresh produces a work order, not an API call.
2. Related targets link to `05-career-target`.
