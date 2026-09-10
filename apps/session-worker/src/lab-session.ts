import {
  acceptsTerminalInput,
  canTransition,
  isFinalStatus,
  isoNow,
  LabSessionEventRepository,
  LabSessionIndexRepository,
  PROVIDER_PROGRESS_STATUSES,
  RECORDING_CONTENT_TYPE,
  recordingKey,
  serializeRecording,
  systemClock,
  type RecordingFrame,
} from "@hivemind/core";
import {
  labProviderDescriptorSchema,
  learnerIdSchema,
  sessionClientMessageSchema,
  topologyInstanceSchema,
  workerEnvelopeSchema,
  executionClassSchema,
  labSessionIdSchema,
  type LabStatus,
  type SequencedSessionEvent,
  type SessionEvent,
  type WorkerEnvelope,
} from "@hivemind/schema";
import { DurableObject } from "cloudflare:workers";
import { z } from "zod";

import { PtyRelay } from "./lab-session/relay";
import {
  broadcastEvent,
  broadcastPtyExit,
  broadcastPtyOutput,
  broadcastPtyReady,
  closeAll,
  readAttachment,
  send,
  sendRejected,
  sendSnapshot,
  sendWelcome,
} from "./lab-session/sockets";
import { iso, LabSessionRepository } from "./lab-session/storage";
import {
  RETENTION_AFTER_FINAL_MS,
  SNAPSHOT_EVENTS,
  type InternalCreateRequest,
  type SessionRecord,
  type SocketAttachment,
} from "./lab-session/types";
import { ProviderUnavailable, type SessionProvider } from "./providers/index";
import { providerFor } from "./providers/registry";

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8" };
const MAX_BODY_BYTES = 256 * 1024;

const internalCreateSchema = z.strictObject({
  sessionId: labSessionIdSchema,
  learnerId: learnerIdSchema,
  topology: topologyInstanceSchema,
  provider: labProviderDescriptorSchema,
  providerClass: executionClassSchema,
  workerId: z.string().min(1).nullable(),
  hardTtlMinutes: z.int().min(1),
  problemInstanceId: z.string().min(1).nullable(),
});

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: JSON_HEADERS });
}

async function readJson(request: Request): Promise<unknown> {
  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    throw new Error("body-too-large");
  }
  return JSON.parse(body) as unknown;
}

/**
 * One Durable Object per lab session (RFP §86, D-030). The single authority
 * for the session's lifecycle: it selects nothing (the service did), drives
 * the provider through RFP §86 states with an idempotent, alarm-fed deadline
 * queue, terminates the learner's WebSockets, relays per-node PTYs, records
 * terminals with redaction, and mirrors durable facts to D1.
 */
export class LabSession extends DurableObject<Env> {
  private readonly repo: LabSessionRepository;
  private readonly index: LabSessionIndexRepository;
  private readonly durableEvents: LabSessionEventRepository;
  private relay: PtyRelay | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.repo = new LabSessionRepository(ctx.storage);
    this.index = new LabSessionIndexRepository(env.DB, systemClock);
    this.durableEvents = new LabSessionEventRepository(env.DB);
    this.repo.ensureSchema();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  /* ----------------------------------------------------------- HTTP surface */

  override async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/internal/create") {
        return await this.handleCreate(request);
      }
      if (request.method === "GET" && url.pathname === "/internal/summary") {
        return this.handleSummary(url);
      }
      if (request.method === "GET" && url.pathname === "/internal/events") {
        return this.handleEvents(url);
      }
      if (request.method === "POST" && url.pathname === "/internal/destroy") {
        return await this.handleDestroy(url);
      }
      if (request.method === "GET" && url.pathname === "/internal/ws") {
        return await this.handleWebSocket(url);
      }
      if (request.method === "POST" && url.pathname === "/internal/worker-event") {
        return await this.handleWorkerEvent(request);
      }
      if (request.method === "POST" && url.pathname === "/internal/reconcile-missing") {
        return await this.handleReconcileMissing();
      }
      if (
        request.method === "POST" &&
        url.pathname === "/internal/test/expire" &&
        this.env.HIVEMIND_ENV === "test"
      ) {
        // Tests only: bring one deadline kind forward and run the alarm now.
        this.repo.expireDeadlines(url.searchParams.get("kind") ?? "");
        await this.alarm();
        return json({ ok: true });
      }
      return json({ error: "not-found" }, 404);
    } catch (error) {
      console.error("lab-session", error);
      return json({ error: "internal", detail: String(error) }, 500);
    }
  }

  private async handleCreate(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await readJson(request);
    } catch {
      return json({ error: "malformed" }, 400);
    }
    const parsed = internalCreateSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: "malformed", detail: parsed.error.message }, 400);
    }
    if (this.repo.load() !== null) {
      return json({ error: "conflict" }, 409);
    }
    const now = Date.now();
    const create: InternalCreateRequest = parsed.data;
    const record = this.repo.create(create, now);
    this.repo.recordTelemetry(
      "session_created",
      { archetype: create.topology.archetype_id, provider: create.provider.id },
      now,
    );
    this.repo.scheduleIdleExpiry(now);
    this.repo.scheduleDeadline({
      deadlineId: "hard-ttl",
      kind: "hard_ttl",
      dueAt: record.hardTtlAt,
      expectedStatus: null,
    });
    this.repo.scheduleDeadline({
      deadlineId: "provision-start",
      kind: "provision_start",
      dueAt: now,
      expectedStatus: "queued",
    });
    await this.index.create({
      id: record.sessionId,
      learner_id: record.learnerId,
      requires: record.topology.lab_spec.requires,
      status: "queued",
      archetype: record.topology.archetype_id,
      archetype_version: record.topology.archetype_version,
      seed: record.topology.seed,
      topology: record.topology,
      problem_instance_id: record.problemInstanceId,
      expires_at: iso(
        now + (this.repo.getDeadlineByKind("idle_expiry")?.dueAt ?? now) - now,
      ),
      hard_ttl_at: iso(record.hardTtlAt),
    });
    await this.index.update(record.sessionId, {
      provider_id: record.provider.id,
      provider_class: record.providerClass,
      worker_id: record.workerId,
    });
    await this.repo.syncAlarm();
    return json(this.repo.summary(record), 201);
  }

  /** Every learner-facing call must prove ownership; a session id alone grants nothing. */
  private authorize(url: URL): SessionRecord | Response {
    const learnerId = learnerIdSchema.safeParse(url.searchParams.get("learnerId"));
    const record = this.repo.load();
    if (!learnerId.success || record === null || record.learnerId !== learnerId.data) {
      return json({ error: "not-found" }, 404);
    }
    return record;
  }

  private handleSummary(url: URL): Response {
    const record = this.authorize(url);
    return record instanceof Response ? record : json(this.repo.summary(record));
  }

  private handleEvents(url: URL): Response {
    const record = this.authorize(url);
    if (record instanceof Response) {
      return record;
    }
    const after = Number(url.searchParams.get("after") ?? "0");
    return json({
      session: this.repo.summary(record),
      events: this.repo.listEventsAfter(Number.isFinite(after) ? after : 0, 500),
    });
  }

  private async handleDestroy(url: URL): Promise<Response> {
    const record = this.authorize(url);
    if (record instanceof Response) {
      return record;
    }
    if (!isFinalStatus(record.status) && record.status !== "destroying") {
      await this.beginDestroy("requested", Date.now());
    }
    const current = this.repo.load();
    return current === null
      ? json({ error: "not-found" }, 404)
      : json(this.repo.summary(current));
  }

  private async handleWebSocket(url: URL): Promise<Response> {
    const record = this.authorize(url);
    if (record instanceof Response) {
      return record;
    }
    if (isFinalStatus(record.status)) {
      return json({ error: "session_finished" }, 410);
    }
    const now = Date.now();
    const connectionId = crypto.randomUUID();
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    const attachment: SocketAttachment = {
      sessionId: record.sessionId,
      learnerId: record.learnerId,
      connectionId,
    };
    server.serializeAttachment(attachment);
    this.ctx.acceptWebSocket(server, ["owner"]);
    this.repo.recordActivity(now);
    this.repo.recordTelemetry("socket_opened", { connectionId }, now);
    this.repo.scheduleIdleExpiry(now);
    await this.repo.syncAlarm();
    sendWelcome(server, record.sessionId, connectionId, iso(now));
    this.sendSnapshotTo(server, now);
    return new Response(null, { status: 101, webSocket: client });
  }

  /* ---------------------------------------------------- worker callbacks */

  private async handleWorkerEvent(request: Request): Promise<Response> {
    let body: unknown;
    try {
      body = await readJson(request);
    } catch {
      return json({ error: "malformed" }, 400);
    }
    const parsed = workerEnvelopeSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: "malformed", detail: parsed.error.message }, 400);
    }
    await this.applyWorkerEvent(parsed.data);
    await this.repo.syncAlarm();
    return json({ ok: true });
  }

  private async applyWorkerEvent(envelope: WorkerEnvelope): Promise<void> {
    const record = this.repo.load();
    if (record === null) {
      return;
    }
    const message = envelope.message;
    const now = Date.now();
    if (isFinalStatus(record.status) && message.type !== "event.log") {
      return; // late replay after the session ended; alarms already ran
    }
    switch (message.type) {
      case "event.status": {
        if (
          PROVIDER_PROGRESS_STATUSES.includes(message.status) &&
          canTransition(record.status, message.status)
        ) {
          await this.transition(record.status, message.status, now, message.detail);
        }
        return;
      }
      case "event.log": {
        this.appendDurable(
          record.revision,
          { type: "log", level: message.level, message: message.message },
          now,
        );
        return;
      }
      case "event.error": {
        if (message.job_id !== undefined && message.job_id !== record.currentJobId) {
          return; // stale job
        }
        await this.fail(`${message.code}: ${message.message}`, now);
        return;
      }
      case "event.result": {
        if (message.job_id !== record.currentJobId) {
          return; // duplicate or stale result: idempotent under replay
        }
        this.repo.setJob(null);
        this.repo.removeDeadline("job-timeout");
        const result = message.result;
        if (result.kind === "provision") {
          if (!message.ok) {
            await this.fail("provider reported a failed provision", now);
            return;
          }
          const nodes = record.nodes.map((node) => {
            const provisioned = result.result.nodes.find((n) => n.name === node.name);
            return provisioned?.address === undefined
              ? { name: node.name, role: node.role }
              : { name: node.name, role: node.role, address: provisioned.address };
          });
          this.repo.setNodes(nodes, result.result.handle);
          await this.becomeReady(now);
          return;
        }
        if (result.kind === "destroy") {
          await this.completeDestroy(now, result.result.detail ?? null);
          return;
        }
        if (result.kind === "exec") {
          this.appendDurable(
            record.revision,
            {
              type: "log",
              level: message.ok ? "info" : "warn",
              message: `exec exited ${result.result.exit_code}: ${result.result.stdout.slice(0, 500)}`,
            },
            now,
          );
        }
        return;
      }
      default:
        return;
    }
  }

  /** The worker reported it no longer has this session (reconciliation, acceptance 7). */
  private async handleReconcileMissing(): Promise<Response> {
    const record = this.repo.load();
    if (record === null || isFinalStatus(record.status)) {
      return json({ ok: true, changed: false });
    }
    const now = Date.now();
    await this.fail(
      "worker_lost_session: the lab worker no longer runs this session",
      now,
    );
    await this.repo.syncAlarm();
    return json({ ok: true, changed: true });
  }

  /* ------------------------------------------------------------- WebSockets */

  override async webSocketMessage(
    socket: WebSocket,
    raw: string | ArrayBuffer,
  ): Promise<void> {
    const attachment = readAttachment(socket);
    const record = this.repo.load();
    if (
      attachment === null ||
      record === null ||
      record.sessionId !== attachment.sessionId ||
      record.learnerId !== attachment.learnerId
    ) {
      socket.close(1008, "Invalid session connection");
      return;
    }
    if (typeof raw !== "string") {
      sendRejected(socket, "malformed", record.revision);
      return;
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      sendRejected(socket, "malformed", record.revision);
      return;
    }
    const message = sessionClientMessageSchema.safeParse(parsed);
    if (!message.success) {
      sendRejected(socket, "malformed", record.revision);
      return;
    }
    const now = Date.now();
    const data = message.data;
    switch (data.type) {
      case "resync": {
        this.sendSnapshotTo(socket, now);
        return;
      }
      case "pty_open":
      case "pty_input":
      case "pty_resize": {
        if (isFinalStatus(record.status)) {
          sendRejected(socket, "session_finished", record.revision);
          return;
        }
        if (!acceptsTerminalInput(record.status)) {
          sendRejected(socket, "not_ready", record.revision);
          return;
        }
        if (!record.nodes.some((node) => node.name === data.node)) {
          sendRejected(
            socket,
            "unknown_node",
            record.revision,
            `no node named ${data.node}`,
          );
          return;
        }
        this.repo.recordActivity(now);
        this.repo.scheduleIdleExpiry(now);
        await this.repo.syncAlarm();
        const relay = this.relayFor(record);
        const node = data.node;
        if (data.type === "pty_resize") {
          this.repo.setPtySize(node, data.size.cols, data.size.rows);
          this.repo.recordTelemetry("pty_resize", { node, ...data.size }, now);
          relay.resize(node, data.size.cols, data.size.rows);
          return;
        }
        if (data.type === "pty_open") {
          this.repo.setPtySize(node, data.size.cols, data.size.rows);
          try {
            const { reused } = await relay.open(
              this.providerFor(record),
              node,
              data.size,
            );
            if (reused) {
              // The provider only replays on connect; repaint from our scrollback.
              const scrollback = relay.scrollback(node);
              if (scrollback !== null && scrollback.length > 0) {
                send(socket, {
                  protocol_version: 2,
                  type: "pty_output",
                  node,
                  data: scrollback.slice(-16_000),
                });
              }
              send(socket, { protocol_version: 2, type: "pty_ready", node });
            }
          } catch (error) {
            sendRejected(socket, "pty_unavailable", record.revision, describe(error));
          }
          return;
        }
        // pty_input
        this.repo.recordTelemetry("pty_input", { node, bytes: data.data.length }, now);
        if (record.status === "ready") {
          await this.transition("ready", "active", now, "first_input");
        }
        if (!relay.isOpen(node)) {
          try {
            await relay.open(this.providerFor(record), node, this.repo.ptySize(node));
          } catch (error) {
            sendRejected(socket, "pty_unavailable", record.revision, describe(error));
            return;
          }
        }
        relay.write(node, data.data);
        return;
      }
    }
  }

  override async webSocketClose(socket: WebSocket, code: number): Promise<void> {
    const attachment = readAttachment(socket);
    if (attachment !== null && this.repo.load() !== null) {
      this.repo.recordTelemetry(
        "socket_closed",
        { connectionId: attachment.connectionId, code },
        Date.now(),
      );
    }
  }

  override async webSocketError(socket: WebSocket): Promise<void> {
    await this.webSocketClose(socket, 1006);
  }

  /* ------------------------------------------------------------------ alarm */

  override async alarm(): Promise<void> {
    const now = Date.now();
    // Alarm delivery is at least once. Every due deadline is consumed exactly
    // once from SQLite and ignored when the session already moved on.
    for (;;) {
      const due = this.repo.nextDeadline();
      if (due === null || due.dueAt > now) {
        break;
      }
      this.repo.removeDeadline(due.deadlineId);
      const record = this.repo.load();
      if (record === null) {
        break;
      }
      if (due.expectedStatus !== null && due.expectedStatus !== record.status) {
        continue;
      }
      switch (due.kind) {
        case "provision_start": {
          await this.startProvisioning(record, now);
          break;
        }
        case "job_timeout": {
          if (record.status === "destroying") {
            await this.completeDestroy(now, "destroy_timeout");
          } else if (!isFinalStatus(record.status)) {
            await this.fail(
              "provision_timeout: the provider did not report in time",
              now,
            );
          }
          break;
        }
        case "destroy_timeout": {
          if (record.status === "destroying") {
            await this.completeDestroy(now, "destroy_timeout");
          }
          break;
        }
        case "idle_expiry": {
          if (!isFinalStatus(record.status) && record.status !== "destroying") {
            await this.beginDestroy("expired", now, "idle_timeout");
          }
          break;
        }
        case "hard_ttl": {
          if (!isFinalStatus(record.status) && record.status !== "destroying") {
            await this.beginDestroy("expired", now, "hard_ttl");
          }
          break;
        }
        case "cleanup": {
          closeAll(this.ctx.getWebSockets(), "cleanup");
          await this.repo.destroyAll();
          return;
        }
      }
    }
    await this.repo.syncAlarm();
  }

  /* -------------------------------------------------------------- lifecycle */

  private providerFor(record: SessionRecord): SessionProvider {
    return providerFor(this.env, record.provider, record.providerClass);
  }

  private relayFor(record: SessionRecord): PtyRelay {
    this.relay ??= new PtyRelay(record.sessionId, {
      output: (node, data) => broadcastPtyOutput(this.ctx.getWebSockets(), node, data),
      ready: (node) => broadcastPtyReady(this.ctx.getWebSockets(), node),
      exit: (node, code) => broadcastPtyExit(this.ctx.getWebSockets(), node, code),
      error: (node, message) => {
        for (const socket of this.ctx.getWebSockets()) {
          sendRejected(
            socket,
            "pty_unavailable",
            this.repo.load()?.revision ?? 0,
            `${node}: ${message}`,
          );
        }
      },
      record: (node, kind, data) =>
        this.repo.appendFrame({ node, at_ms: Date.now(), kind, data }),
    });
    return this.relay;
  }

  private async startProvisioning(record: SessionRecord, now: number): Promise<void> {
    const provider = this.providerFor(record);
    const jobId = crypto.randomUUID();
    this.repo.setJob(jobId);
    await this.transition("queued", "provisioning", now, provider.descriptor.id);
    try {
      const outcome = await provider.provision({
        sessionId: record.sessionId,
        topology: record.topology,
        jobId,
      });
      if (outcome.kind === "ready") {
        this.repo.setNodes(outcome.nodes, outcome.handle);
        const current = this.repo.load();
        if (current !== null && current.status === "provisioning") {
          await this.transition(
            "provisioning",
            "baseline_check",
            now,
            "provider answered",
          );
        }
        this.repo.setJob(null);
        await this.becomeReady(now);
      } else {
        this.repo.scheduleDeadline({
          deadlineId: "job-timeout",
          kind: "job_timeout",
          dueAt: now + outcome.timeoutMs,
          expectedStatus: null,
        });
      }
    } catch (error) {
      await this.fail(describe(error), now);
    }
  }

  private async becomeReady(now: number): Promise<void> {
    const record = this.repo.load();
    if (record === null || !canTransition(record.status, "ready")) {
      return;
    }
    await this.transition(record.status, "ready", now);
    const nodes = record.nodes.map((node) => node.name).join(", ");
    this.appendDurable(
      this.repo.load()?.revision ?? record.revision,
      {
        type: "notice",
        text: `${record.topology.archetype_id}@${record.topology.archetype_version} seed ${record.topology.seed} on ${record.provider.id}; nodes: ${nodes}`,
      },
      now,
    );
    await this.index.update(record.sessionId, {
      status: "ready",
      nodes: this.repo.load()?.nodes ?? record.nodes,
    });
  }

  private async beginDestroy(
    reason: "expired" | "requested" | "failed",
    now: number,
    detail?: string,
  ): Promise<void> {
    const record = this.repo.load();
    if (record === null || !canTransition(record.status, "destroying")) {
      return;
    }
    await this.transition(record.status, "destroying", now, detail ?? reason);
    this.relay?.closeAll();
    const jobId = crypto.randomUUID();
    this.repo.setJob(jobId);
    try {
      const provider = this.providerFor(record);
      const outcome = await provider.destroy({
        sessionId: record.sessionId,
        reason,
        jobId,
      });
      if ("destroyNodes" in provider && typeof provider.destroyNodes === "function") {
        await (provider.destroyNodes as (id: string, nodes: string[]) => Promise<void>)(
          record.sessionId,
          record.nodes.map((node) => node.name),
        );
      }
      if (outcome.kind === "destroyed") {
        await this.completeDestroy(now, null);
      } else {
        this.repo.scheduleDeadline({
          deadlineId: "destroy-timeout",
          kind: "destroy_timeout",
          dueAt: now + outcome.timeoutMs,
          expectedStatus: "destroying",
        });
      }
    } catch (error) {
      await this.completeDestroy(now, `destroy_failed: ${describe(error)}`);
    }
  }

  private async completeDestroy(now: number, detail: string | null): Promise<void> {
    const record = this.repo.load();
    if (record === null || record.status !== "destroying") {
      return;
    }
    this.repo.setJob(null);
    await this.transition("destroying", "destroyed", now, detail ?? undefined);
    await this.finish("destroyed", now, record.reason ?? detail);
  }

  private async fail(reason: string, now: number): Promise<void> {
    const record = this.repo.load();
    if (record === null || isFinalStatus(record.status)) {
      return;
    }
    this.repo.setJob(null);
    await this.transition(record.status, "failed", now, reason.slice(0, 500));
    // Best effort: ask the provider to clean up whatever exists.
    try {
      const provider = this.providerFor(record);
      await provider.destroy({
        sessionId: record.sessionId,
        reason: "failed",
        jobId: crypto.randomUUID(),
      });
      if ("destroyNodes" in provider && typeof provider.destroyNodes === "function") {
        await (provider.destroyNodes as (id: string, nodes: string[]) => Promise<void>)(
          record.sessionId,
          record.nodes.map((node) => node.name),
        );
      }
    } catch {
      // The sweeper on the worker catches what the request could not.
    }
    await this.finish("failed", now, reason);
  }

  private async transition(
    from: LabStatus,
    to: LabStatus,
    now: number,
    reason?: string,
  ): Promise<SequencedSessionEvent> {
    // The reason column records why a session failed or was torn down; other
    // transitions leave it untouched.
    const keepsReason = to === "failed" || to === "destroying" || to === "destroyed";
    const revision = this.repo.setStatus(
      to,
      now,
      keepsReason && reason !== undefined ? reason.slice(0, 500) : undefined,
    );
    const event: SessionEvent =
      reason === undefined
        ? { type: "status_changed", from, to }
        : { type: "status_changed", from, to, reason: reason.slice(0, 500) };
    const sequenced = this.appendDurable(revision, event, now);
    this.repo.recordTelemetry(
      "status_changed",
      { from, to, reason: reason ?? null },
      now,
    );
    this.repo.scheduleIdleExpiry(now);
    await this.index.update(this.repo.load()?.sessionId ?? "", {
      status: to,
      ...(keepsReason && reason !== undefined ? { reason: reason.slice(0, 500) } : {}),
    });
    return sequenced;
  }

  private appendDurable(
    revision: number,
    event: SessionEvent,
    now: number,
  ): SequencedSessionEvent {
    const sequenced = this.repo.appendEvent(revision, event, now);
    broadcastEvent(this.ctx.getWebSockets(), sequenced);
    const sessionId = this.repo.load()?.sessionId;
    if (sessionId !== undefined) {
      this.ctx.waitUntil(
        this.durableEvents.append(sessionId, sequenced).catch((error: unknown) => {
          console.error("lab-session events", error);
        }),
      );
    }
    return sequenced;
  }

  private async finish(
    status: "destroyed" | "failed",
    now: number,
    reason: string | null,
  ): Promise<void> {
    const record = this.repo.load();
    if (record === null) {
      return;
    }
    this.relay?.closeAll();
    this.relay = null;
    closeAll(this.ctx.getWebSockets(), status);
    this.repo.clearDeadlines();
    this.repo.scheduleDeadline({
      deadlineId: "cleanup",
      kind: "cleanup",
      dueAt: now + RETENTION_AFTER_FINAL_MS,
      expectedStatus: status,
    });
    const keys = await this.uploadRecordings(record, now);
    this.repo.setRecordingKeys(keys);
    await this.index.update(record.sessionId, {
      status,
      reason,
      finished_at: iso(now),
      recording_keys: keys,
    });
  }

  /** Recordings never block teardown: serialization is quick and the upload runs in waitUntil. */
  private async uploadRecordings(
    record: SessionRecord,
    now: number,
  ): Promise<Record<string, string>> {
    const bucket = this.env.ARTIFACTS;
    const keys: Record<string, string> = {};
    if (bucket === undefined) {
      return keys;
    }
    const stamp = iso(now);
    for (const node of this.repo.recordedNodes()) {
      const frames = this.repo.listFrames(node);
      if (frames.length === 0) {
        continue;
      }
      const size = this.repo.ptySize(node);
      const first = frames[0]?.at_ms ?? now;
      const body = serializeRecording(
        {
          version: 2,
          width: size.cols,
          height: size.rows,
          timestamp: Math.floor(first / 1000),
          title: `${record.sessionId} · ${node}`,
          env: { TERM: "xterm-256color", SHELL: "/bin/bash" },
          hivemind: {
            lab_session_id: record.sessionId,
            node,
            provider_id: record.provider.id,
            redaction_version: this.relay?.redactionVersion ?? "1.0.0",
            recorded_at: stamp,
          },
        },
        frames.map((frame): RecordingFrame => ({
          at_ms: frame.at_ms,
          kind: frame.kind,
          data: frame.data,
        })),
      );
      const key = recordingKey(record.sessionId, node, stamp);
      keys[node] = key;
      this.ctx.waitUntil(
        bucket
          .put(key, body, {
            httpMetadata: { contentType: RECORDING_CONTENT_TYPE },
            customMetadata: {
              lab_session_id: record.sessionId,
              node,
              redaction_version: this.relay?.redactionVersion ?? "1.0.0",
            },
          })
          .then(() => undefined)
          .catch((error: unknown) => {
            console.error("recording upload", error);
          }),
      );
    }
    return keys;
  }

  private sendSnapshotTo(socket: WebSocket, now: number): void {
    const record = this.repo.load();
    if (record === null) {
      socket.close(4002, "no-session");
      return;
    }
    sendSnapshot(
      socket,
      this.repo.summary(record),
      this.repo.latestSequence(),
      this.repo.listRecentEvents(SNAPSHOT_EVENTS),
      isoNow(new Date(now)),
    );
  }
}

function describe(error: unknown): string {
  if (error instanceof ProviderUnavailable) {
    return `${error.code}: ${error.message}`;
  }
  return error instanceof Error ? error.message : String(error);
}
