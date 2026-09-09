"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

import { recordLabSessionAction } from "@/app/actions/labs";
import { createLabSession, ensureGuestSession, SessionError } from "@/lib/session";

/**
 * Capabilities a course can request (RFP §106). Every one of these is served by
 * the echo stub provider until real lab hosts exist.
 */
const CAPABILITIES = [
  { id: "terminal.linux", label: "Linux terminal" },
  { id: "runtime.python", label: "Python runtime" },
  { id: "network.frr", label: "FRRouting topology" },
] as const;

export function LaunchLabForm() {
  const router = useRouter();
  const [capability, setCapability] = useState<string>(CAPABILITIES[0].id);
  const [problemRef, setProblemRef] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      await ensureGuestSession();
      const trimmed = problemRef.trim();
      const summary = await createLabSession(
        trimmed === "" ? { capability } : { capability, problemRef: trimmed },
      );
      await recordLabSessionAction(summary);
      router.push(`/labs/${summary.sessionId}`);
    } catch (caught) {
      setError(caught instanceof SessionError ? caught.code : "launch-failed");
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={(event) => void onSubmit(event)}
      className="grid max-w-xl gap-4 rounded-md border border-zinc-800 p-4"
    >
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-400">Capability</span>
        <select
          name="capability"
          value={capability}
          onChange={(event) => setCapability(event.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-zinc-100"
        >
          {CAPABILITIES.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label} ({item.id})
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1 text-sm">
        <span className="text-zinc-400">Problem reference (optional)</span>
        <input
          name="problemRef"
          value={problemRef}
          onChange={(event) => setProblemRef(event.target.value)}
          placeholder="bgp.next_hop#42"
          className="rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-zinc-100"
        />
      </label>
      {error === null ? null : (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending}
        className="justify-self-start rounded-md bg-hive-amber px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-hive-amber-dim disabled:opacity-50"
      >
        {pending ? "Launching…" : "Launch lab"}
      </button>
    </form>
  );
}
