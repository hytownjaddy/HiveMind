import type { LabSpec } from "../lab";
import type { LabWorker } from "../lab-worker";
import type { RecordingHeader } from "../recording";
import type {
  CreateSessionRequest,
  PtyControlMessage,
  SequencedSessionEvent,
  SessionClientMessage,
  SessionEvent,
  SessionServerMessage,
  SessionSummary,
} from "../session-transport";
import type { LabNodeConfig, TopologyArchetype, TopologyInstance } from "../topology";
import type { Fixture } from "./index";

/*
 * Stage 02 fixtures: topology archetypes and instances, node configuration,
 * the worker registry, recordings, and session transport v2. Image
 * references are pinned by digest (invariant 5); FRR is the multi-arch
 * manifest list for 10.7.1 on quay.io.
 */

const AT = "2026-09-09T12:00:00Z";
const SHA = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const SESSION = "HM-LAB-829143";

export const FRR_IMAGE =
  "quay.io/frrouting/frr:10.7.1@sha256:e995beaa50fdc9edb35eadcfefa29b7f062cc06f2b812613789b68fa541554d2";
export const LINUX_LAB_IMAGE = "hivemind/linux-lab:1.0.0";

export const dualSpineArchetype: TopologyArchetype = {
  id: "bgp.dual_spine",
  version: "1.0.0",
  title: "Two spines, N leaves, eBGP everywhere",
  description:
    "Leaf routers peer with both spines over point-to-point links; every router announces a loopback.",
  status: "active",
  aliases: [],
  requires: ["network.containerlab", "routing.frr", "privilege.net_admin"],
  generator: "bgp.dual_spine",
  parameters: [
    { name: "leaf_count", kind: "int_range", values: [2, 4] },
    { name: "asn_scheme", kind: "choice", values: ["private", "public"] },
  ],
  images: { router: FRR_IMAGE },
  resources: { cpu_millicores: 2000, memory_mb: 2048, disk_mb: 4096 },
  network: { egress: "deny", allowlist: [] },
  ttl_minutes: 120,
  snapshot: false,
};

export const linuxNodeConfig: LabNodeConfig = {
  kind: "linux",
  hostname: "host1",
  interfaces: [{ name: "eth1", ipv4: "10.0.12.1/30" }],
  routes: [{ prefix: "10.1.2.0/24", via: "10.0.12.2" }],
  shell: "/bin/bash",
};

export const frrNodeConfig: LabNodeConfig = {
  kind: "frr",
  hostname: "spine1",
  asn: 65000,
  router_id: "10.255.0.1",
  interfaces: [
    { name: "eth1", ipv4: "10.0.1.0/31" },
    { name: "eth2", ipv4: "10.0.1.2/31" },
  ],
  loopback: { name: "lo", ipv4: "10.255.0.1/32" },
  bgp: {
    neighbors: [
      { address: "10.0.1.1", remote_asn: 65001, description: "leaf1" },
      { address: "10.0.1.3", remote_asn: 65002, description: "leaf2" },
    ],
    networks: ["10.255.0.1/32"],
  },
  daemons: ["bgpd"],
  shell: "/usr/bin/vtysh",
};

export const linuxSingleSpec: LabSpec = {
  id: "linux.single",
  version: "1.0.0",
  title: "One Linux host",
  requires: ["shell.linux"],
  nodes: [
    { name: "host1", image: LINUX_LAB_IMAGE, role: "host", config: linuxNodeConfig },
  ],
  links: [],
  resources: { cpu_millicores: 500, memory_mb: 512, disk_mb: 1024 },
  network: { egress: "deny", allowlist: [] },
  ttl_minutes: 60,
  snapshot: false,
};

export const linuxSingleInstance: TopologyInstance = {
  archetype_id: "linux.single",
  archetype_version: "1.0.0",
  generator: "linux.single",
  seed: 1,
  parameters: {},
  lab_spec: linuxSingleSpec,
  spec_hash: SHA,
};

export const labWorkerFixture: LabWorker = {
  id: "ubuntu-lab-worker-1",
  status: "online",
  capabilities: [
    "shell.linux",
    "network.namespace",
    "network.veth",
    "network.bridge",
    "network.containerlab",
    "routing.frr",
    "privilege.net_admin",
  ],
  endpoint: "https://lab-worker.jryans.dev",
  agent_version: "0.2.0",
  hostname: "lab-worker-1",
  runtime_versions: { containerlab: "0.79.0", frr: "10.7.1", docker: "28.5.1" },
  load: { cpu_percent: 12.5, memory_percent: 41 },
  active_sessions: 1,
  registered_at: AT,
  last_heartbeat_at: AT,
};

export const recordingHeaderFixture: RecordingHeader = {
  version: 2,
  width: 120,
  height: 40,
  timestamp: 1788955200,
  title: "HM-LAB-829143 · host1",
  env: { TERM: "xterm-256color", SHELL: "/bin/bash" },
  hivemind: {
    lab_session_id: SESSION,
    node: "host1",
    provider_id: "ubuntu-lab-worker-1",
    redaction_version: "1.0.0",
    recorded_at: AT,
  },
};

export const createSessionFixture: CreateSessionRequest = {
  archetype: "bgp.dual_spine",
  seed: 7,
  parameters: { leaf_count: 2 },
};

export const sessionSummaryFixture: SessionSummary = {
  id: SESSION,
  learner_id: "HM-LRN-000001",
  status: "ready",
  archetype: "linux.single",
  archetype_version: "1.0.0",
  seed: 1,
  parameters: {},
  requires: ["shell.linux"],
  provider_id: "ubuntu-lab-worker-1",
  provider_class: "C",
  worker_id: "ubuntu-lab-worker-1",
  nodes: [{ name: "host1", role: "host", address: "172.29.0.2" }],
  revision: 3,
  created_at: AT,
  updated_at: AT,
  expires_at: "2026-09-09T14:00:00Z",
  hard_ttl_at: "2026-09-09T13:00:00Z",
  reason: null,
  recording_key: null,
};

export const statusEventFixture: SessionEvent = {
  type: "status_changed",
  from: "baseline_check",
  to: "ready",
};

export const sequencedEventFixture: SequencedSessionEvent = {
  sequence: 3,
  revision: 3,
  at: AT,
  event: statusEventFixture,
};

export const clientMessages: readonly { name: string; value: SessionClientMessage }[] = [
  {
    name: "pty-open",
    value: {
      protocol_version: 2,
      type: "pty_open",
      node: "host1",
      size: { cols: 120, rows: 40 },
    },
  },
  {
    name: "pty-input",
    value: { protocol_version: 2, type: "pty_input", node: "host1", data: "ip route\r" },
  },
  {
    name: "pty-resize",
    value: {
      protocol_version: 2,
      type: "pty_resize",
      node: "host1",
      size: { cols: 80, rows: 24 },
    },
  },
  { name: "resync", value: { protocol_version: 2, type: "resync", latest_sequence: 3 } },
];

export const serverMessages: readonly { name: string; value: SessionServerMessage }[] = [
  {
    name: "welcome",
    value: {
      protocol_version: 2,
      type: "welcome",
      session_id: SESSION,
      connection_id: "9c1d5a2e-7b3f-4e6a-8d2c-1a0b9f8e7d6c",
      server_time: AT,
    },
  },
  {
    name: "snapshot",
    value: {
      protocol_version: 2,
      type: "snapshot",
      session: sessionSummaryFixture,
      latest_sequence: 3,
      recent_events: [sequencedEventFixture],
      server_time: AT,
    },
  },
  {
    name: "event-pty-output",
    value: {
      protocol_version: 2,
      type: "event",
      sequence: 4,
      revision: 3,
      at: AT,
      event: {
        type: "pty_output",
        node: "host1",
        data: "default via 10.0.12.2 dev eth1\r\n",
      },
    },
  },
  { name: "pty-ready", value: { protocol_version: 2, type: "pty_ready", node: "host1" } },
  {
    name: "rejected",
    value: {
      protocol_version: 2,
      type: "rejected",
      code: "unknown_node",
      revision: 3,
      detail: "no node named r9",
    },
  },
];

export const ptyControlMessages: readonly { name: string; value: PtyControlMessage }[] = [
  { name: "resize", value: { type: "resize", cols: 120, rows: 40 } },
  { name: "ready", value: { type: "ready" } },
  { name: "exit", value: { type: "exit", code: 0, signal: null } },
];

export const STAGE02_FIXTURES: readonly Fixture[] = [
  { contract: "TopologyArchetype", name: "bgp-dual-spine", value: dualSpineArchetype },
  { contract: "TopologyInstance", name: "linux-single", value: linuxSingleInstance },
  { contract: "LabNodeConfig", name: "linux", value: linuxNodeConfig },
  { contract: "LabNodeConfig", name: "frr", value: frrNodeConfig },
  { contract: "LabSpec", name: "linux-single", value: linuxSingleSpec },
  { contract: "LabWorker", name: "online", value: labWorkerFixture },
  { contract: "RecordingHeader", name: "host1", value: recordingHeaderFixture },
  { contract: "CreateSessionRequest", name: "dual-spine", value: createSessionFixture },
  { contract: "SessionSummary", name: "ready", value: sessionSummaryFixture },
  { contract: "SessionEvent", name: "status-changed", value: statusEventFixture },
  { contract: "SequencedSessionEvent", name: "ready", value: sequencedEventFixture },
  ...clientMessages.map(({ name, value }) => ({
    contract: "SessionClientMessage",
    name,
    value,
  })),
  ...serverMessages.map(({ name, value }) => ({
    contract: "SessionServerMessage",
    name,
    value,
  })),
  ...ptyControlMessages.map(({ name, value }) => ({
    contract: "PtyControlMessage",
    name,
    value,
  })),
];
