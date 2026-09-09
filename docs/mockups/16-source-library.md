# 16-source-library

REFERENCE ONLY: `docs/mockups/16-source-library.png` is visual inspiration, not a specification.

```text
IMPLEMENTATION AUTHORITY ORDER
1. DECISIONS.md
2. docs/ui/UI-SYSTEM.md
3. This companion specification
4. STAGES/STAGE_nn.md (the stage named below)
5. docs/mockups/16-source-library.png
```

## Purpose

Engineering knowledge base of authoritative sources with trust, version, freshness,
usage, dependent claims, and refresh state; enforces the ingestion policy (D-011).

## Stage

Stage 05 (library, policy, health checks); provenance display starts in Stage 01.

## Visual Reference

`16-source-library.png`.

## Shell

Canonical (mockup uses it).

## Layout

- Tabs by source class (RFCs, vendor docs, standards, cert blueprints, web docs, internal,
  notes); toolbar filters (type, trust, freshness, skill tag).
- Table: title, type, trust tier, policy class (`ingestable` | `notes-only`), version/date,
  freshness, used by (count), actions.
- Right: preview (metadata, abstract, key topics, related skills, referenced by), tabs
  `Preview | Relationships | Usage | Claims | Change History`; health panel with
  `check for updates` and weekly auto-check toggle; dependencies/cited-by; usage context.
- Bottom: recently updated sources; stale sources.

## Required Data

Source records with trust dimensions (§168), policy class, versions, health checks, claims
depending on the source (§35), usage by courses/skills/jobs/labs.

## Lifecycle States

Freshness; health `ok/unreachable/changed`.

## Confidence Rules

Trust shown as tier plus the five §168 dimensions on hover.

## AI Execution

`discover sources` is a work order; health checks are deterministic.

## Learner Safety / Leakage

Notes-only sources never display ingested text; only Jacob's notes and metadata.

## Corrections From Mockup

- Add policy class column and the `Claims` tab.
- Books and paid courses show `notes-only`; "Neil Anderson Udemy"-style entries are
  pointers, not sources of text.

## Keyboard Shortcuts

`a` add source, `/` filter, `u` check for updates.

## Empty States

`no sources · add RFCs and official docs first`.

## Error States

Unreachable URL → health `unreachable` with the last good hash.

## Acceptance Criteria

1. Policy class enforced on creation; claims link both ways.
2. Health checks run on schedule and update freshness deterministically.
