# Lab Authoring Guide

Status: contract skeleton. Sections marked **TBD(stage)** are completed by that stage.
Governing decisions: D-001, D-005, D-006, D-012, D-013, D-017, D-019, D-022 invariants
3, 4, 5, 8, 9.

## Principle

AI generates intent; code determines reality; deterministic validators decide correctness
(RFP §2.1, §118). A lab is therefore never a hand-written one-off. It is a **problem
archetype** (topology + objectives + variation dimensions) combined with **fault modules**
and a **grader**, instantiated by a **seed**.

## Execution classes and capabilities (D-035, RFP §36, §106)

A lab declares the capabilities it needs; the `LabSession` Durable Object selects a
provider that satisfies all of them. Never pick a provider by habit.

| Capability                                                   | Class | Provider                                     | First used               |
| ------------------------------------------------------------ | ----- | -------------------------------------------- | ------------------------ |
| `shell.linux`, `python`, `node`                              | A     | Cloudflare Sandbox                           | Stage 2 (spike), Stage 7 |
| `compiler.cpp`                                               | A     | Cloudflare Sandbox                           | Phase 2 (D-018)          |
| single-node Linux exercises                                  | C     | Sandbox or worker, per the Stage 2 benchmark | Stage 2                  |
| `network.namespace`, `network.veth`, `network.bridge`        | B     | Ubuntu lab worker                            | Stage 2                  |
| `network.containerlab`, `routing.frr`, `privilege.net_admin` | B     | Ubuntu lab worker                            | Stage 2                  |
| `network.automation` (Python attached to a topology)         | B     | Ubuntu lab worker                            | Stage 9                  |
| `capture.pcap`, `telemetry.simulated`                        | B / A | worker / Worker-side simulation              | Stage 9                  |
| `orchestration.kubernetes`                                   | B     | worker (k3s/kind)                            | Phase 3                  |

Sandbox Docker-in-Docker is rootless with no privileged containers or iptables, so Class B
capabilities never run on Sandbox.

## Lifecycle (RFP §86)

```text
QUEUED → PROVISIONING → BASELINE_CHECK → FAULT_INJECTION → FAULT_CHECK → READY → ACTIVE
      → GRADING → COMPLETED → DESTROYING → DESTROYED   (FAILED from any state)
```

The `LabSession` Durable Object owns the state machine and persists every transition; the worker executes steps
and reports. Deadlines (idle expiry, hard TTL) are queued in the object's SQLite and processed
idempotently by its single alarm.

## ProblemSpec (RFP §43, §47)

```yaml
problem:
  id: bgp.wrong_local_pref.dual_spine # archetype id
  version: 1.2.0
  primary_skill: bgp.local_pref
  skills: [bgp.local_pref, bgp.best_path]
  difficulty: 6 # authored; recalibrated by Stage 6 Elo
  capability: network.containerlab
  topology:
    {
      archetype: dual_spine,
      variation: { leaf_count: [2, 4], asn_scheme: [private, public] },
    }
  faults: [{ module: bgp.wrong_local_pref, params: { target: random_leaf } }]
  objectives: [connectivity_restored, correct_route_selected, unrelated_routes_unchanged]
  grader: { id: bgp.route_selection.v1, version: 1.0.0 }
  hints: [...] # tiered; caps mastery gain (D-016)
  reference_solution: solutions/fix_local_pref.py
```

An **instance** persists `problem_id, seed, generator_version, course_version,
topology_version, fault_versions, grader_version, spec_hash` so it can be replayed exactly.

## Validation pipeline (RFP §46) — mandatory before publish

```text
schema validate → provision baseline → baseline healthy → inject fault → verify intended
failure → run reference solution → run grader (must pass) → restore/destroy → approve
```

Run with `hivemind problem validate <archetype> --seeds N`. Failure means reject and
regenerate. Graders check final state, never command sequence, and must verify that
unrelated systems remain healthy.

## Fault modules (RFP §44)

Owned by HiveMind under `services/lab-worker/hivemind_worker/faults/<domain>/` (Python,
consuming generated Pydantic contracts). Each module declares
parameters, preconditions, the intended observable failure, and its verification check.
Initial libraries: Linux (10) and BGP (10) in Stage 3.

## Graders (invariant 8)

Versioned Python modules with a declarative manifest. A grader change creates a new
version; old attempts keep their grader version. Grader audits (RFP §193) look for
accepted shortcuts, rejected legitimate solutions, and nondeterminism.

## Safety on the worker (D-001)

Per-session Docker networks, cgroup limits, no host Docker socket, default-deny egress,
hard TTL, orphan sweeper, recordings redacted before storage (D-019). Labs may break
themselves; they must not be able to break the host.

## Authoring flow

Work orders `problem.create`, `fault.create`, `problem.diversify`, `lab.repair`,
`grader.review` produce code plus tests plus a change report; `hivemind work validate` runs
the pipeline; a review item lands in Jacob's queue.

**TBD(2)**: provider interface signatures and worker protocol. **TBD(3)**: fault module
API, grader API, archetype registry format, CLI reference.
