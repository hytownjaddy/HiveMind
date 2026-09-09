import type { Attempt, AttemptResult, Evidence, MasteryUpdate } from "../attempt";
import type {
  CareerProfile,
  Competency,
  ReadinessSnapshot,
  RoleProfile,
} from "../career";
import type {
  ContentVersion,
  CourseManifest,
  Lesson,
  Module,
  Question,
} from "../content";
import type { FaultSpec } from "../fault";
import type { GraderManifest, GraderResult } from "../grader";
import type { LabProviderDescriptor, LabSpec } from "../lab";
import type { Learner } from "../learner";
import type { ProblemInstance, ProblemSpec } from "../problem";
import type { SkillDefinition, SkillGraph } from "../skills";
import type { Claim, SourceRecord } from "../sources";
import type { ReviewItem, WorkOrder } from "../work-order";
import type { WorkerEnvelope, WorkerMessage } from "../worker-protocol";

/*
 * Deterministic example documents. They are validated against the Zod
 * contracts, written to `schemas/fixtures/<Contract>/<name>.json`, and
 * round-tripped through the generated Pydantic models (D-043). The BGP
 * problem fixtures exist only to exercise the schemas (Stage 01 known risks).
 */

export interface Fixture {
  readonly contract: string;
  readonly name: string;
  readonly value: unknown;
}

const AT = "2026-09-09T12:00:00Z";
const SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

export const seededLearner: Learner = {
  id: "HM-LRN-000001",
  display_name: "Jacob",
  identity: { provider: "cloudflare_access", email: "jacob@0pass.com" },
  settings: {
    timezone: "America/Los_Angeles",
    ai_execution: {
      tutor: "external",
      review: "external",
      interview: "external",
      coach: "external",
    },
  },
  created_at: AT,
  updated_at: AT,
};

export const routingTableSkill: SkillDefinition = {
  id: "linux.networking.routing_table",
  version: "1.0.0",
  name: "Linux routing table and ip route",
  domain: "linux",
  description: "Read, query, and change the kernel routing table with `ip route`.",
  status: "active",
  prerequisites: ["linux.networking.interfaces_addresses"],
  related: ["networking.ipv4.subnetting"],
  tags: ["routing", "iproute2"],
  evidence_modes: ["learn", "guided_lab", "practice", "challenge", "blind_incident"],
  blind_assessable: true,
};

export const skillGraph: SkillGraph = {
  version: "1.0.0",
  skills: [
    { skill_id: "linux.networking.interfaces_addresses", version: "1.0.0" },
    { skill_id: "linux.networking.routing_table", version: "1.0.0" },
  ],
  edges: [
    {
      from: "linux.networking.interfaces_addresses",
      to: "linux.networking.routing_table",
      kind: "prerequisite",
    },
  ],
};

export const iprouteSource: SourceRecord = {
  id: "src.iproute2.ip-route",
  title: "ip-route(8) — iproute2 manual page",
  kind: "manual_page",
  trust_tier: "official",
  url: "https://man7.org/linux/man-pages/man8/ip-route.8.html",
  ingested: true,
  retrieved_at: "2026-09-09",
};

export const bookNotesSource: SourceRecord = {
  id: "src.notes.bgp-book",
  title: "Jacob's notes on a BGP book",
  kind: "book_notes",
  trust_tier: "internal",
  citation: "Notes only; the book itself is not ingested (D-011).",
  ingested: false,
};

const LESSON_ID = "HM-LESSON-linux-networking-01";

export const lpmClaim: Claim = {
  id: "lpm",
  lesson_id: LESSON_ID,
  statement: "The kernel selects the route with the longest matching prefix.",
  sources: [{ id: "src.iproute2.ip-route", locator: "ip route get" }],
  verification: {
    status: "verified",
    method: "documentation",
    verified_at: AT,
    reviewer: "jacob",
  },
};

export const predictionQuestion: Question = {
  id: "predict-default",
  lesson_id: LESSON_ID,
  kind: "prediction",
  prompt:
    "A host has `default via 10.0.0.1` and `10.1.0.0/16 via 10.0.0.2`. Which next hop carries a packet to 10.1.2.3?",
  options: [
    {
      id: "a",
      text: "10.0.0.1",
      correct: false,
      feedback: "The default route is the shortest prefix; it loses.",
    },
    { id: "b", text: "10.0.0.2", correct: true },
  ],
  explanation: "Longest-prefix match prefers /16 over /0.",
  skill_ids: ["linux.networking.routing_table"],
  difficulty: 2,
};

export const lessonFixture: Lesson = {
  id: LESSON_ID,
  course_id: "linux-networking",
  module_id: "linux-networking.routing",
  version: "0.1.0",
  slug: "routing-table-ip-route",
  title: "The Linux routing table and ip route",
  summary: "How the kernel selects a route and how to read and change the table.",
  order: 1,
  qa_state: "draft",
  review: {},
  objectives: [
    {
      id: "read-table",
      text: "Read a routing table and predict the chosen route",
      skill_ids: ["linux.networking.routing_table"],
    },
  ],
  skill_ids: ["linux.networking.routing_table"],
  prerequisite_lesson_ids: [],
  difficulty: 2,
  estimated_minutes: {
    instruction: 25,
    guided_lab: 10,
    independent_practice: 10,
    total: 45,
  },
  sections: [
    {
      element: "motivation",
      heading: "Why routes decide everything",
      blocks: [
        {
          kind: "paragraph",
          children: [
            {
              kind: "text",
              value: "Every packet leaving a host consults the routing table",
            },
            { kind: "claim_ref", claim_id: "lpm" },
            { kind: "text", value: "." },
          ],
        },
        {
          kind: "callout",
          callout: "note",
          title: "Scope",
          children: [
            {
              kind: "paragraph",
              children: [{ kind: "text", value: "IPv4 only in this lesson." }],
            },
          ],
        },
        {
          kind: "diagram",
          format: "ascii",
          source: "host --- gw --- internet",
          caption: "One hop",
        },
        {
          kind: "code_block",
          language: "console",
          code: "$ ip route show\ndefault via 10.0.0.1 dev eth0",
        },
        { kind: "question", question_id: "predict-default" },
        {
          kind: "list",
          ordered: true,
          items: [
            [{ kind: "paragraph", children: [{ kind: "code", value: "ip route get" }] }],
          ],
        },
        {
          kind: "table",
          header: [[{ kind: "text", value: "prefix" }], [{ kind: "text", value: "via" }]],
          rows: [
            [
              [{ kind: "text", value: "0.0.0.0/0" }],
              [{ kind: "text", value: "10.0.0.1" }],
            ],
          ],
        },
        {
          kind: "exercise",
          exercise: "guided",
          title: "Add a static route",
          children: [
            { kind: "paragraph", children: [{ kind: "kbd", value: "ip route add" }] },
          ],
        },
        { kind: "thematic_break" },
      ],
    },
  ],
  questions: [predictionQuestion],
  claims: [lpmClaim],
  labs: [
    {
      problem_id: "linux.routing.static_route",
      mode: "guided_lab",
      title: "Add and verify a static route",
      grader_constraints: {
        required: ["host_can_reach: 10.1.2.10"],
        preserve: ["default_route"],
        reject: ["overly_broad_route"],
      },
    },
  ],
  source_ids: ["src.iproute2.ip-route"],
  body_hash: SHA,
  source_path:
    "content/courses/linux/networking/modules/01-routing/lessons/01-routing-table-ip-route",
};

export const moduleFixture: Module = {
  id: "linux-networking.routing",
  course_id: "linux-networking",
  title: "Routing",
  summary: "The routing table, static routes, and the failures they cause.",
  order: 1,
  lesson_ids: [LESSON_ID],
  skill_ids: ["linux.networking.routing_table"],
};

export const courseFixture: CourseManifest = {
  id: "linux-networking",
  version: "0.1.0",
  title: "Linux Networking",
  domain: "linux",
  summary: "Interfaces, addresses, routes, and troubleshooting on Linux hosts.",
  status: "active",
  tracks: ["network-infrastructure"],
  prerequisite_course_ids: [],
  skill_ids: ["linux.networking.routing_table"],
  uses_labs: true,
  capabilities: ["shell.linux"],
  module_ids: ["linux-networking.routing"],
  source_ids: ["src.iproute2.ip-route"],
};

/** A course with no labs at all (invariant 2). */
export const noLabCourse: CourseManifest = {
  id: "interview-foundations",
  version: "0.1.0",
  title: "Interview Foundations",
  domain: "career",
  summary: "Structured answers, whiteboard reasoning, and incident narratives.",
  status: "active",
  tracks: [],
  prerequisite_course_ids: [],
  skill_ids: ["career.interview.structured_answers"],
  uses_labs: false,
  capabilities: [],
  module_ids: ["interview-foundations.answers"],
  source_ids: [],
};

export const contentVersionFixture: ContentVersion = {
  id: "HM-CV-0001",
  created_at: AT,
  content_hash: SHA,
  git_commit: "7bad74d",
  published_by: "hivemind-cli",
  course_ids: ["linux-networking"],
  counts: { courses: 1, modules: 1, lessons: 1, skills: 2, sources: 2 },
};

export const bgpLabSpec: LabSpec = {
  id: "bgp.two-as",
  version: "1.0.0",
  title: "Two autonomous systems, one eBGP session",
  requires: ["network.containerlab", "routing.frr", "privilege.net_admin"],
  nodes: [
    {
      name: "r1",
      image: "quay.io/frrouting/frr:10.2.1",
      role: "router",
      config: { asn: 65001 },
    },
    {
      name: "r2",
      image: "quay.io/frrouting/frr:10.2.1",
      role: "router",
      config: { asn: 65002 },
    },
  ],
  links: [{ a: "r1:eth1", b: "r2:eth1" }],
  resources: { cpu_millicores: 1000, memory_mb: 1024, disk_mb: 2048 },
  network: { egress: "deny", allowlist: [] },
  ttl_minutes: 120,
  snapshot: false,
};

export const labWorkerProvider: LabProviderDescriptor = {
  id: "ubuntu-lab-worker-1",
  kind: "lab_worker",
  version: "0.1.0",
  capabilities: [
    "shell.linux",
    "network.namespace",
    "network.veth",
    "network.bridge",
    "network.containerlab",
    "routing.frr",
    "privilege.net_admin",
  ],
  endpoint: "https://lab-worker.hivemindjrr.com",
};

export const bgpFault: FaultSpec = {
  id: "bgp.wrong_neighbor_asn",
  version: "1.0.0",
  title: "Neighbor configured with the wrong remote AS",
  status: "active",
  category: "routing",
  description:
    "r1's neighbor statement names AS 65003 instead of 65002, so the session never leaves Active/Connect.",
  requires: ["routing.frr"],
  parameters: [{ name: "wrong_asn", kind: "int_range", values: [65003, 65100] }],
  inject_module: "hivemind_worker.faults.bgp:inject_wrong_neighbor_asn",
  restore_module: "hivemind_worker.faults.bgp:restore_wrong_neighbor_asn",
  verify: [
    {
      id: "session-not-established",
      node: "r1",
      command: ["vtysh", "-c", "show bgp summary json"],
      expect: {
        kind: "stdout_json_equals",
        path: "$.ipv4Unicast.peers['10.0.12.2'].state",
        value: "Active",
      },
      timeout_seconds: 30,
    },
  ],
  observable_symptoms: [
    "`show bgp summary` never shows Established",
    "No prefixes learned from the neighbor",
  ],
};

export const bgpGrader: GraderManifest = {
  id: "bgp.session_established",
  version: "1.0.0",
  title: "eBGP session established and prefix learned",
  status: "active",
  kind: "deterministic",
  requires: ["routing.frr"],
  checks: [
    {
      id: "established",
      description: "Session to r2 is Established",
      weight: 0.6,
      objective_id: "restore-session",
      hidden: false,
      spec: {
        id: "established",
        node: "r1",
        command: ["vtysh", "-c", "show bgp summary json"],
        expect: {
          kind: "stdout_json_equals",
          path: "$.ipv4Unicast.peers['10.0.12.2'].state",
          value: "Established",
        },
        timeout_seconds: 30,
      },
    },
    {
      id: "prefix-learned",
      description: "r2's loopback is in r1's RIB",
      weight: 0.4,
      objective_id: "restore-session",
      hidden: true,
    },
  ],
  entrypoint: "hivemind_worker.graders.bgp:session_established",
  timeout_seconds: 120,
};

export const graderResultFixture: GraderResult = {
  grader_id: "bgp.session_established",
  grader_version: "1.0.0",
  status: "passed",
  score: 1,
  checks: [
    { id: "established", passed: true, weight: 0.6, message: "Established" },
    { id: "prefix-learned", passed: true, weight: 0.4 },
  ],
  started_at: AT,
  finished_at: "2026-09-09T12:00:07Z",
};

export const bgpProblem: ProblemSpec = {
  id: "bgp.neighbor_misconfig",
  version: "1.0.0",
  title: "eBGP session will not establish",
  domain: "networking",
  status: "active",
  qa_state: "draft",
  summary: "Two routers, one eBGP session that never comes up.",
  scenario:
    "The peering between r1 and r2 was working yesterday. Find out why it is down and restore it without changing r2.",
  skill_ids: ["networking.bgp.session_establishment"],
  difficulty: 3,
  modes: ["practice", "challenge", "blind_incident"],
  requires: ["network.containerlab", "routing.frr", "privilege.net_admin"],
  lab_spec_id: "bgp.two-as",
  lab_spec_version: "1.0.0",
  objectives: [
    {
      id: "restore-session",
      text: "Restore the eBGP session on r1",
      skill_id: "networking.bgp.session_establishment",
      check_ids: ["established", "prefix-learned"],
    },
  ],
  variation: [
    { name: "peer_subnet", kind: "choice", values: ["10.0.12.0/30", "10.0.21.0/30"] },
  ],
  faults: [{ fault_id: "bgp.wrong_neighbor_asn", version: "1.0.0" }],
  grader_id: "bgp.session_established",
  grader_version: "1.0.0",
  reference_solution: "hivemind_worker.solutions.bgp:fix_neighbor_asn",
  reference_solution_version: "1.0.0",
  hints: [
    {
      tier: "minor",
      text: "Compare what r1 expects with what r2 announces about itself.",
      mastery_cap_percent: 80,
    },
    {
      tier: "strong",
      text: "Check the remote-as on r1's neighbor statement.",
      mastery_cap_percent: 50,
    },
    {
      tier: "solution",
      text: "`neighbor 10.0.12.2 remote-as 65002`",
      mastery_cap_percent: 10,
    },
  ],
  time_limit_minutes: 30,
};

export const problemInstanceFixture: ProblemInstance = {
  id: "HM-PI-000042",
  problem_id: "bgp.neighbor_misconfig",
  problem_version: "1.0.0",
  seed: 829143,
  lab_spec_version: "1.0.0",
  fault_versions: [{ fault_id: "bgp.wrong_neighbor_asn", version: "1.0.0" }],
  grader_version: "1.0.0",
  reference_solution_version: "1.0.0",
  parameters: { peer_subnet: "10.0.12.0/30", wrong_asn: 65042 },
  spec_hash: SHA,
  validation: "validated",
  validation_steps: [
    { step: "schema_validation", passed: true, at: AT },
    { step: "provision_baseline", passed: true, at: AT },
    { step: "validate_baseline", passed: true, at: AT },
    { step: "inject_fault", passed: true, at: AT },
    { step: "verify_failure", passed: true, at: AT },
    { step: "execute_reference_solution", passed: true, at: AT },
    { step: "run_graders", passed: true, at: AT },
    { step: "restore_scenario", passed: true, at: AT },
  ],
  created_at: AT,
};

export const attemptFixture: Attempt = {
  id: "HM-ATT-000001",
  learner_id: "HM-LRN-000001",
  mode: "practice",
  problem_instance_id: "HM-PI-000042",
  lab_session_id: "HM-LAB-829143",
  skill_versions: [
    { skill_id: "networking.bgp.session_establishment", version: "1.0.0" },
  ],
  started_at: AT,
  finished_at: "2026-09-09T12:24:17Z",
  status: "graded",
  hints: [{ tier: "minor", at: "2026-09-09T12:10:00Z" }],
};

export const attemptResultFixture: AttemptResult = {
  attempt_id: "HM-ATT-000001",
  grader_result: graderResultFixture,
  objectives_total: 1,
  objectives_passed: 1,
  technical_score: 1,
  independence: "minor",
  duration_seconds: 1457,
  recorded_at: "2026-09-09T12:24:17Z",
};

export const evidenceFixture: Evidence = {
  id: "HM-EV-000001",
  attempt_id: "HM-ATT-000001",
  learner_id: "HM-LRN-000001",
  skill_id: "networking.bgp.session_establishment",
  skill_version: "1.0.0",
  kind: "practice_problem",
  correctness: 1,
  independence: "minor",
  difficulty: 3,
  blind: false,
  created_at: "2026-09-09T12:24:17Z",
};

export const masteryUpdateFixture: MasteryUpdate = {
  learner_id: "HM-LRN-000001",
  skill_id: "networking.bgp.session_establishment",
  skill_version: "1.0.0",
  algorithm_id: "mastery.evidence_weighted",
  algorithm_version: "0.1.0",
  mastery_before: 0.42,
  mastery_after: 0.55,
  confidence: "low",
  evidence_count: 3,
  evidence_ids: ["HM-EV-000001"],
  created_at: "2026-09-09T12:24:18Z",
};

export const competencyFixture: Competency = {
  id: "bgp-operations",
  version: "1.0.0",
  name: "BGP operations",
  category: "routing",
  description: "Configure, verify, and troubleshoot eBGP and iBGP sessions.",
  status: "active",
  skills: [
    { skill_id: "networking.bgp.session_establishment", weight: 0.5, min_mastery: 0.7 },
  ],
};

export const roleProfileFixture: RoleProfile = {
  id: "meta-network-infrastructure-engineer",
  version: "0.1.0",
  title: "Network Infrastructure Engineer",
  company: "Meta",
  family: "network-infrastructure",
  level: "IC4",
  summary: "Operates large-scale data-center and backbone networks.",
  status: "active",
  competencies: [
    { competency_id: "bgp-operations", weight: 0.3, required: true, min_readiness: 0.7 },
  ],
  source_ids: [],
};

export const careerProfileFixture: CareerProfile = {
  learner_id: "HM-LRN-000001",
  role_profile_id: "meta-network-infrastructure-engineer",
  role_profile_version: "0.1.0",
  active: true,
  set_at: AT,
};

export const readinessFixture: ReadinessSnapshot = {
  learner_id: "HM-LRN-000001",
  role_profile_id: "meta-network-infrastructure-engineer",
  role_profile_version: "0.1.0",
  algorithm_id: "readiness.weighted_gates",
  algorithm_version: "0.1.0",
  score_percent: 62,
  confidence: "medium",
  evidence_count: 12,
  last_tested_at: AT,
  gates: [
    {
      competency_id: "bgp-operations",
      blocking: true,
      satisfied: false,
      score_percent: 55,
    },
  ],
  computed_at: AT,
};

export const workOrderFixture: WorkOrder = {
  id: "HM-WO-0184",
  template: "lesson.update",
  title: "Tighten the misconception section of the routing-table lesson",
  status: "draft",
  priority: "normal",
  execution: "external",
  target: { kind: "lesson", lesson_id: LESSON_ID },
  requested_by: "jacob",
  created_at: AT,
  updated_at: AT,
  instructions: "Add the asymmetric return-path failure as a second misconception.",
  context: {
    repository_paths: [
      "content/courses/linux/networking/modules/01-routing/lessons/01-routing-table-ip-route/",
    ],
    schemas: ["schemas/Lesson.schema.json", "schemas/Claim.schema.json"],
    acceptance_criteria: [
      "`hivemind content compile content/` passes",
      "Every new claim has a source in claims.yaml",
    ],
    validation_commands: [
      "bun run verify",
      "bun run hivemind -- content compile content/",
    ],
    expected_output: [
      "Updated lesson.md, claims.yaml, metadata.yaml with a version bump",
    ],
    source_requirements: ["Only sources listed in content/sources (D-011)"],
  },
  labels: ["content", "linux"],
  dependencies: [],
  effort: "s",
  validation_runs: [],
  history: [{ at: AT, from: null, to: "draft", by: "jacob" }],
};

export const reviewItemFixture: ReviewItem = {
  id: "HM-RVW-0001",
  kind: "lesson",
  target_id: LESSON_ID,
  qa_state: "technical_review",
  opened_at: AT,
  work_order_id: "HM-WO-0184",
};

const JOB_ID = "6f2b7e6c-4d0f-4d7a-9a4c-2f1b5c3d8e90";
const MSG_ID = "9c1d5a2e-7b3f-4e6a-8d2c-1a0b9f8e7d6c";

export const workerMessages: readonly {
  readonly name: string;
  readonly message: WorkerMessage;
}[] = [
  {
    name: "job-provision",
    message: {
      type: "job.provision",
      job_id: JOB_ID,
      lab_session_id: "HM-LAB-829143",
      lab_spec: bgpLabSpec,
      seed: 829143,
      problem_instance: problemInstanceFixture,
    },
  },
  {
    name: "job-exec",
    message: {
      type: "job.exec",
      job_id: JOB_ID,
      lab_session_id: "HM-LAB-829143",
      node: "r1",
      command: ["vtysh", "-c", "show bgp summary json"],
      timeout_seconds: 30,
    },
  },
  {
    name: "job-fault-inject",
    message: {
      type: "job.fault.inject",
      job_id: JOB_ID,
      lab_session_id: "HM-LAB-829143",
      fault_id: "bgp.wrong_neighbor_asn",
      fault_version: "1.0.0",
      parameters: { wrong_asn: 65042 },
    },
  },
  {
    name: "job-fault-verify",
    message: {
      type: "job.fault.verify",
      job_id: JOB_ID,
      lab_session_id: "HM-LAB-829143",
      fault_id: "bgp.wrong_neighbor_asn",
      fault_version: "1.0.0",
    },
  },
  {
    name: "job-grade",
    message: {
      type: "job.grade",
      job_id: JOB_ID,
      lab_session_id: "HM-LAB-829143",
      grader_id: "bgp.session_established",
      grader_version: "1.0.0",
    },
  },
  {
    name: "job-destroy",
    message: {
      type: "job.destroy",
      job_id: JOB_ID,
      lab_session_id: "HM-LAB-829143",
      reason: "completed",
    },
  },
  {
    name: "event-status",
    message: {
      type: "event.status",
      lab_session_id: "HM-LAB-829143",
      status: "baseline_check",
      at: AT,
      detail: "all nodes up",
    },
  },
  {
    name: "event-log",
    message: {
      type: "event.log",
      lab_session_id: "HM-LAB-829143",
      level: "info",
      message: "containerlab deploy finished",
      at: AT,
    },
  },
  {
    name: "event-result-provision",
    message: {
      type: "event.result",
      job_id: JOB_ID,
      lab_session_id: "HM-LAB-829143",
      ok: true,
      result: {
        kind: "provision",
        result: {
          lab_session_id: "HM-LAB-829143",
          provider_id: "ubuntu-lab-worker-1",
          status: "baseline_check",
          handle: "clab-hm-lab-829143",
          nodes: [{ name: "r1", address: "172.20.20.2" }, { name: "r2" }],
        },
      },
    },
  },
  {
    name: "event-result-exec",
    message: {
      type: "event.result",
      job_id: JOB_ID,
      lab_session_id: "HM-LAB-829143",
      ok: true,
      result: {
        kind: "exec",
        result: {
          exit_code: 0,
          stdout: "{}",
          stderr: "",
          duration_ms: 120,
          timed_out: false,
        },
      },
    },
  },
  {
    name: "event-result-fault",
    message: {
      type: "event.result",
      job_id: JOB_ID,
      lab_session_id: "HM-LAB-829143",
      ok: true,
      result: { kind: "fault", result: { applied: true, verified: true } },
    },
  },
  {
    name: "event-result-grade",
    message: {
      type: "event.result",
      job_id: JOB_ID,
      lab_session_id: "HM-LAB-829143",
      ok: true,
      result: { kind: "grade", result: graderResultFixture },
    },
  },
  {
    name: "event-result-destroy",
    message: {
      type: "event.result",
      job_id: JOB_ID,
      lab_session_id: "HM-LAB-829143",
      ok: true,
      result: {
        kind: "destroy",
        result: { lab_session_id: "HM-LAB-829143", destroyed: true },
      },
    },
  },
  {
    name: "event-error",
    message: {
      type: "event.error",
      job_id: JOB_ID,
      lab_session_id: "HM-LAB-829143",
      code: "provision_timeout",
      message: "containerlab did not finish within 300s",
      retryable: true,
    },
  },
  {
    name: "heartbeat",
    message: {
      type: "heartbeat",
      worker_id: "ubuntu-lab-worker-1",
      capabilities: labWorkerProvider.capabilities,
      active_sessions: 1,
      load: { cpu_percent: 12.5, memory_percent: 41 },
      runtime_versions: { containerlab: "0.68.0", frr: "10.2.1", docker: "28.3.0" },
      at: AT,
    },
  },
];

function envelope(message: WorkerMessage): WorkerEnvelope {
  return {
    protocol_version: 1,
    message_id: MSG_ID,
    correlation_id: JOB_ID,
    sent_at: AT,
    sender: { kind: "session_worker", id: "hivemind-session" },
    message,
  };
}

export const FIXTURES: readonly Fixture[] = [
  { contract: "Learner", name: "seeded", value: seededLearner },
  { contract: "SkillDefinition", name: "routing-table", value: routingTableSkill },
  { contract: "SkillGraph", name: "linux-networking", value: skillGraph },
  { contract: "SourceRecord", name: "iproute2", value: iprouteSource },
  { contract: "SourceRecord", name: "book-notes", value: bookNotesSource },
  { contract: "Claim", name: "lpm", value: lpmClaim },
  { contract: "Question", name: "prediction", value: predictionQuestion },
  { contract: "Lesson", name: "routing-table", value: lessonFixture },
  { contract: "Module", name: "routing", value: moduleFixture },
  { contract: "CourseManifest", name: "linux-networking", value: courseFixture },
  { contract: "CourseManifest", name: "no-labs", value: noLabCourse },
  { contract: "ContentVersion", name: "first", value: contentVersionFixture },
  { contract: "LabSpec", name: "bgp-two-as", value: bgpLabSpec },
  { contract: "LabProviderDescriptor", name: "lab-worker", value: labWorkerProvider },
  { contract: "FaultSpec", name: "bgp-wrong-neighbor-asn", value: bgpFault },
  { contract: "GraderManifest", name: "bgp-session-established", value: bgpGrader },
  { contract: "GraderResult", name: "passed", value: graderResultFixture },
  { contract: "ProblemSpec", name: "bgp-neighbor-misconfig", value: bgpProblem },
  { contract: "ProblemInstance", name: "validated", value: problemInstanceFixture },
  { contract: "Attempt", name: "graded", value: attemptFixture },
  { contract: "AttemptResult", name: "passed", value: attemptResultFixture },
  { contract: "Evidence", name: "practice", value: evidenceFixture },
  { contract: "MasteryUpdate", name: "first", value: masteryUpdateFixture },
  { contract: "Competency", name: "bgp-operations", value: competencyFixture },
  {
    contract: "RoleProfile",
    name: "meta-network-infrastructure",
    value: roleProfileFixture,
  },
  { contract: "CareerProfile", name: "active", value: careerProfileFixture },
  { contract: "ReadinessSnapshot", name: "medium", value: readinessFixture },
  { contract: "WorkOrder", name: "lesson-update", value: workOrderFixture },
  { contract: "ReviewItem", name: "lesson", value: reviewItemFixture },
  ...workerMessages.map(({ name, message }) => ({
    contract: "WorkerEnvelope",
    name,
    value: envelope(message),
  })),
];
