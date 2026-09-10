#!/usr/bin/env bun
import { SESSION_PROTOCOL_VERSION, sessionServerMessageSchema } from "@hivemind/schema";
import { HiveMindApi } from "../src/api";
import { loadConfig } from "../src/config";

/*
 * Class C benchmark (Stage 02 acceptance 8): time to `ready`, PTY round trip,
 * exec-through-terminal latency, and teardown for a single-node Linux lab on
 * whichever provider the session Worker selects. Run it against a session
 * Worker offering one provider at a time and paste the table into
 * docs/benchmarks/class-c.md.
 *
 *   HIVEMIND_API_URL=... HIVEMIND_SESSION_URL=... bun run bench:class-c [cycles] [archetype]
 */

const cycles = Number(process.argv[2] ?? "5");
const archetype = process.argv[3] ?? "linux.single";
const config = loadConfig();
const api = new HiveMindApi(config);

interface Sample {
  readonly session: string;
  readonly provider: string;
  readonly ready_ms: number;
  readonly pty_open_ms: number;
  readonly pty_rtt_ms: number;
  readonly destroy_ms: number;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitStatus(id: string, wanted: readonly string[]): Promise<string> {
  for (;;) {
    const summary = await api.getLab(id);
    if (wanted.includes(summary.status) || summary.status === "failed") {
      if (summary.status === "failed") {
        throw new Error(`${id} failed: ${summary.reason ?? "?"}`);
      }
      return summary.status;
    }
    await sleep(100);
  }
}

async function ptyProbe(
  id: string,
  node: string,
): Promise<{ open_ms: number; rtt_ms: number }> {
  const { url, headers } = api.labSocket(id);
  const BunSocket = WebSocket as unknown as new (
    url: string,
    options: { headers: Record<string, string> },
  ) => WebSocket;
  const socket = new BunSocket(url, { headers });
  const send = (message: Record<string, unknown>): void => {
    socket.send(
      JSON.stringify({ protocol_version: SESSION_PROTOCOL_VERSION, ...message }),
    );
  };
  return new Promise((resolve, reject) => {
    let openedAt = 0;
    let readyAt = 0;
    let sentAt = 0;
    const token = `ping-${Date.now()}`;
    const timer = setTimeout(() => {
      socket.close();
      reject(new Error("pty probe timed out"));
    }, 60_000);
    socket.addEventListener("message", (event) => {
      const message = sessionServerMessageSchema.safeParse(
        JSON.parse(String(event.data)),
      );
      if (!message.success) return;
      const data = message.data;
      if (data.type === "snapshot") {
        openedAt = performance.now();
        send({ type: "pty_open", node, size: { cols: 100, rows: 30 } });
      } else if (data.type === "pty_ready" && data.node === node) {
        readyAt = performance.now();
        sentAt = performance.now();
        send({ type: "pty_input", node, data: `echo ${token}\r` });
      } else if (data.type === "pty_output" && data.node === node && sentAt > 0) {
        // The echo of the typed line arrives first; wait for the command's own output line.
        if (
          data.data.includes(`\n${token}`) ||
          data.data.includes(`\r\n${token}`) ||
          data.data.trimStart().startsWith(token)
        ) {
          const rtt = performance.now() - sentAt;
          clearTimeout(timer);
          socket.close(1000, "done");
          resolve({ open_ms: readyAt - openedAt, rtt_ms: rtt });
        }
      } else if (data.type === "rejected") {
        clearTimeout(timer);
        socket.close();
        reject(new Error(`rejected: ${data.code} ${data.detail ?? ""}`));
      }
    });
    socket.addEventListener("error", () => {
      clearTimeout(timer);
      reject(new Error("socket error"));
    });
  });
}

const samples: Sample[] = [];
for (let cycle = 1; cycle <= cycles; cycle += 1) {
  const started = performance.now();
  const created = await api.createLab({ archetype, seed: cycle });
  await waitStatus(created.id, ["ready", "active"]);
  const ready = performance.now() - started;
  const summary = await api.getLab(created.id);
  const node = summary.nodes[0]?.name ?? "host1";
  const pty = await ptyProbe(created.id, node);
  const destroyStarted = performance.now();
  await api.destroyLab(created.id);
  await waitStatus(created.id, ["destroyed"]);
  const destroy = performance.now() - destroyStarted;
  samples.push({
    session: created.id,
    provider: `${summary.provider_id ?? "?"} (${summary.provider_class ?? "?"})`,
    ready_ms: Math.round(ready),
    pty_open_ms: Math.round(pty.open_ms),
    pty_rtt_ms: Math.round(pty.rtt_ms),
    destroy_ms: Math.round(destroy),
  });
  console.error(
    `${created.id} ${samples.at(-1)?.provider}: ready ${Math.round(ready)} ms, pty open ${Math.round(pty.open_ms)} ms, rtt ${Math.round(pty.rtt_ms)} ms, destroy ${Math.round(destroy)} ms`,
  );
}

const median = (values: number[]): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
};
console.log("| session | provider | ready ms | pty open ms | pty rtt ms | destroy ms |");
console.log("| --- | --- | ---: | ---: | ---: | ---: |");
for (const sample of samples) {
  console.log(
    `| ${sample.session} | ${sample.provider} | ${sample.ready_ms} | ${sample.pty_open_ms} | ${sample.pty_rtt_ms} | ${sample.destroy_ms} |`,
  );
}
console.log(
  `| median | | ${median(samples.map((s) => s.ready_ms))} | ${median(samples.map((s) => s.pty_open_ms))} | ${median(samples.map((s) => s.pty_rtt_ms))} | ${median(samples.map((s) => s.destroy_ms))} |`,
);
