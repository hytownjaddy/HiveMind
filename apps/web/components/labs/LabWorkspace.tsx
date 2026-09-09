"use client";

import { FINAL_STATUSES, TERMINAL_STATUSES } from "@hivemind/schema";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { syncLabSessionStatusAction } from "@/app/actions/labs";
import { destroyLabSession, LabSocket, useLabStore } from "@/lib/session";

import { LifecycleTimeline } from "./LifecycleTimeline";
import { StatusPill } from "./StatusPill";
import { Terminal } from "./Terminal";

/** Lab workspace layout from RFP §91: problem, objectives, terminal, logs, controls. */
export function LabWorkspace({ sessionId }: { readonly sessionId: string }) {
  const socket = useMemo(() => new LabSocket(sessionId), [sessionId]);
  const connection = useLabStore((state) => state.status);
  const session = useLabStore((state) => state.session);
  const log = useLabStore((state) => state.log);
  const lastError = useLabStore((state) => state.lastError);
  const lastRejection = useLabStore((state) => state.lastRejection);
  const [destroying, setDestroying] = useState(false);

  useEffect(() => {
    void socket.connect().catch((error: unknown) => {
      const store = useLabStore.getState();
      store.setLastError(error instanceof Error ? error.message : "connect-failed");
      store.setStatus("offline");
    });
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  const labStatus = session?.status ?? null;
  useEffect(() => {
    if (labStatus !== null) {
      void syncLabSessionStatusAction(sessionId, labStatus);
    }
  }, [sessionId, labStatus]);

  const terminalEnabled =
    connection === "online" &&
    labStatus !== null &&
    TERMINAL_STATUSES.includes(labStatus);
  const finished = labStatus !== null && FINAL_STATUSES.includes(labStatus);

  async function onDestroy(): Promise<void> {
    setDestroying(true);
    try {
      await destroyLabSession(sessionId);
    } catch (error) {
      useLabStore
        .getState()
        .setLastError(error instanceof Error ? error.message : "destroy-failed");
    } finally {
      setDestroying(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-4rem)] flex-col gap-4">
      <header className="flex flex-wrap items-center gap-3">
        <Link href="/labs" className="text-sm text-zinc-400 hover:text-zinc-100">
          ← Labs
        </Link>
        <h1 className="text-xl font-semibold tracking-tight">Lab session</h1>
        <StatusPill status={labStatus} />
        <span className="font-mono text-xs text-zinc-500">{sessionId}</span>
        <span className="ml-auto text-xs text-zinc-500" data-testid="connection-status">
          connection: {connection}
        </span>
        <button
          type="button"
          onClick={() => void onDestroy()}
          disabled={finished || destroying || session === null}
          className="rounded-md border border-red-900 px-3 py-1 text-sm text-red-300 hover:bg-red-950 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {destroying ? "Destroying…" : "Destroy"}
        </button>
      </header>

      {lastError === null ? null : (
        <p
          role="alert"
          className="rounded-md border border-red-900 bg-red-950/40 px-3 py-2 text-sm"
        >
          {lastError}
        </p>
      )}

      <div className="grid min-h-0 flex-1 grid-cols-[12rem_minmax(0,1fr)_16rem] gap-4">
        <section className="rounded-md border border-zinc-800 p-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Lifecycle
          </h2>
          <div className="mt-3">
            <LifecycleTimeline status={labStatus} />
          </div>
          <dl className="mt-6 space-y-2 text-xs">
            <div>
              <dt className="text-zinc-500">capability</dt>
              <dd className="font-mono text-zinc-300">{session?.capability ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">problem</dt>
              <dd className="font-mono text-zinc-300">{session?.problemRef ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-zinc-500">revision</dt>
              <dd className="font-mono text-zinc-300">{session?.revision ?? "—"}</dd>
            </div>
          </dl>
        </section>

        <section className="relative min-h-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-950 p-2">
          <Terminal socket={socket} enabled={terminalEnabled} />
          {terminalEnabled ? null : (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-zinc-950/70">
              <p className="rounded-md border border-zinc-800 bg-zinc-900 px-4 py-2 font-mono text-sm text-zinc-300">
                {finished
                  ? "session finished"
                  : connection !== "online"
                    ? `connection ${connection}`
                    : `waiting for environment (${labStatus ?? "…"})`}
              </p>
            </div>
          )}
        </section>

        <section className="min-h-0 overflow-y-auto rounded-md border border-zinc-800 p-3">
          <h2 className="text-xs font-medium uppercase tracking-wide text-zinc-500">
            Activity
          </h2>
          {lastRejection === null ? null : (
            <p className="mt-2 font-mono text-xs text-amber-300">
              rejected: {lastRejection}
            </p>
          )}
          <ol className="mt-3 space-y-2">
            {log.map((entry) => (
              <li key={entry.sequence} className="font-mono text-xs text-zinc-400">
                <span className="text-zinc-600">#{entry.sequence} </span>
                {entry.event.type === "status_changed"
                  ? `${entry.event.from} → ${entry.event.to}${
                      entry.event.reason === undefined ? "" : ` (${entry.event.reason})`
                    }`
                  : entry.event.type === "notice"
                    ? entry.event.text
                    : entry.event.type}
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
