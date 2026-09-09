# Stage 09 — Network track depth and incident response

## Purpose

Take the network-infrastructure track to the D-003 bar: IS-IS, MPLS basics, data-center
networking (leaf/spine, EVPN/VXLAN concepts), network automation (Python against live
topologies), packet analysis, simulated fiber telemetry, and Incident Response mode
(Challenge with hidden domain and Blind Incidents with multiple systems). Extend fault
libraries and topology archetypes accordingly.

## User-visible outcome

Jacob practises IS-IS adjacency and MPLS label failures on multi-node fabrics, writes
Python automation against a live topology and is graded on idempotent, validated change,
inspects PCAPs captured in-lab, diagnoses simulated optic failures, and opens Incident
mode where a SEV ticket hides the failing domain across two or three systems.

## In scope

- Topology archetypes: IS-IS L1/L2 areas, MPLS LDP core, leaf/spine with eBGP underlay,
  route-reflector designs; larger node counts within worker limits.
- Fault libraries: IS-IS (≥ 8), MPLS (≥ 6), DC (≥ 6), automation faults (drift, partial
  rollout, bad rendering) (≥ 6); cross-domain fault combinations.
- Capabilities: `network.automation` (Python runtime attached to a topology's management
  network with Netmiko/NAPALM/Nornir available), `capture.pcap` (tcpdump in nodes, PCAP
  artifacts to R2, viewer link), `telemetry.simulated` (optics/fiber scenarios).
- Incident Response mode per `docs/mockups/20-incident-command-center.md`: ticket,
  topology, terminals, metrics/log panes (from in-lab telemetry), notes, phase timeline;
  domain hidden; multi-fault scenarios at difficulty 7–10; route lives under Labs.
- Content: modules for IS-IS, MPLS basics, DC networking, network automation, packet
  analysis, fiber/optics theory, incident response methodology; authored via work orders
  with the gold-standard bar.

## Explicitly out of scope

- Kubernetes, CI/CD, observability stacks (Phase 3); Blind Incidents mixing those.
- Vendor virtual images (licensing).
- Project mode (Stage 10).

## Prerequisites / dependency stages

Stages 03, 04, 06; Stage 07 for the automation runtime; Stage 08 optional.

## UI specifications

Implement these companion specifications (authority: `DECISIONS.md` → `docs/ui/UI-SYSTEM.md` → companion → this stage → mockup image):

- `docs/mockups/20-incident-command-center.md`

## Architecture decisions already locked

D-003, D-005 (worker capacity limits), D-012, D-030, D-035 (Class B only for these
capabilities), D-038 (`HM-INC-…`), D-041, invariants 1, 5, 8.

## Files/modules owned by this stage

`content/topologies/**` (additions), `services/lab-worker/.../faults/{isis,mpls,dc,automation}/**`,
`.../providers/{automation,capture,telemetry_sim}/**`, `content/courses/networking/{isis,mpls,datacenter,automation,packet-analysis,fiber,incident-response}/**`,
`apps/web/app/(app)/labs/incidents/**`, `packages/core/src/incidents/**`.

## Interfaces/contracts consumed

All lab and problem contracts; workspace components (04); coding provider pieces (07).

## Interfaces/contracts created

- `capture.pcap` and `telemetry.simulated` provider contracts.
- Incident scenario spec (multi-fault composition, hidden-domain presentation).

## Data/schema changes

D1 migration `0010`: `incident_scenarios`, artifact refs for PCAPs, telemetry series tables (or R2
refs).

## Acceptance criteria

1. Every new fault module and archetype passes the §46 pipeline for 25 seeds; nightly
   regression green.
2. Automation problems grade on end state plus idempotency (second run makes no changes)
   and unrelated-device safety.
3. PCAP capture from a node is downloadable and opens in Wireshark; capture is part of at
   least three graded problems.
4. Incident mode hides the domain (no domain words in ticket/UI) and composes ≥ 2 faults
   across ≥ 2 systems; ten scenarios validated.
5. Largest archetype (e.g., 8-node leaf/spine) provisions within worker limits in under 3 min.
6. Modules published; Jacob completes at least one problem per module.

## Automated test requirements

Same as Stage 03 per library; incident composition tests; automation idempotency tests.

## Manual QA requirements

Jacob runs a week of incident-mode practice and judges realism and ambiguity.

## Security constraints

Automation runtime can reach only the lab's management network; PCAPs redacted of any
credentials in cleartext protocols by default.

## Performance expectations

As acceptance 5; PCAP download under 5 s for 50 MB.

## Migration requirements

D1 migration `0010`.

## Rollback requirements

Content versions unpublishable; providers independently deployable.

## Known risks

- Worker capacity for large topologies on a $50–100 host; define limits and degrade to
  smaller archetypes.
- Fault interactions creating unsolvable states; validation with reference solutions catches
  most; keep incident faults independent where possible.

## Forbidden shortcuts

Scripted "simulations" pretending to be FRR; leaking the domain in incident UI; skipping
idempotency checks in automation grading.

## Definition of done

- [ ] Acceptance 1–6; D-003 track coverage table in `docs/TRACK_META_NETWORK.md` shows every
      listed area with at least one module and graded practice.
- [ ] Milestone commit `feat(stage-09): network track depth and incidents` and tag `stage-09`.
