import { SANDBOX_PROVIDER } from "@hivemind/core";
import type { ExecutionClass, LabProviderDescriptor } from "@hivemind/schema";

import { LOOPBACK_ENDPOINT } from "../gateway/loopback";
import { ProviderUnavailable, type SessionProvider } from "./index";
import { SandboxProvider } from "./sandbox";
import { WorkerProvider } from "./worker";

/*
 * Turn the descriptor the service selected into a runtime provider bound to
 * this Worker's environment. Lab workers are reached through their Tunnel
 * hostname with the Worker's service token; the loopback agent (dev and
 * tests) is reached through the self service binding; the Sandbox through
 * its Durable Object namespace.
 */

export function providerFor(
  env: Env,
  descriptor: LabProviderDescriptor,
  executionClass: ExecutionClass,
): SessionProvider {
  if (descriptor.kind === "sandbox") {
    if (env.Sandbox === undefined) {
      throw new ProviderUnavailable(
        "sandbox_unconfigured",
        "no Sandbox binding in this environment",
      );
    }
    return new SandboxProvider({
      descriptor: { ...SANDBOX_PROVIDER, ...descriptor },
      namespace: env.Sandbox,
      sleepAfter: env.SANDBOX_SLEEP_AFTER ?? "20m",
    });
  }
  if (descriptor.kind === "lab_worker") {
    const endpoint = descriptor.endpoint;
    if (endpoint === undefined) {
      throw new ProviderUnavailable(
        "worker_without_endpoint",
        `${descriptor.id} has no endpoint`,
      );
    }
    const loopback = endpoint.startsWith(LOOPBACK_ENDPOINT);
    if (loopback && env.HIVEMIND_ENV === "production") {
      throw new ProviderUnavailable(
        "loopback_forbidden",
        "loopback agent is not allowed in production",
      );
    }
    const headers: Record<string, string> =
      env.LAB_WORKER_CLIENT_ID !== undefined && env.LAB_WORKER_CLIENT_SECRET !== undefined
        ? {
            "CF-Access-Client-Id": env.LAB_WORKER_CLIENT_ID,
            "CF-Access-Client-Secret": env.LAB_WORKER_CLIENT_SECRET,
          }
        : {};
    const fetchImpl = loopback
      ? (input: string, init?: RequestInit): Promise<Response> =>
          env.SELF.fetch(
            input.replace(
              LOOPBACK_ENDPOINT,
              "https://loopback.internal/session/loopback",
            ),
            init,
          )
      : (input: string, init?: RequestInit): Promise<Response> => fetch(input, init);
    return new WorkerProvider({
      descriptor,
      executionClass,
      endpoint: loopback ? LOOPBACK_ENDPOINT : endpoint,
      fetchImpl,
      headers,
      senderId:
        env.HIVEMIND_ENV === "production" ? "hivemind-session" : "hivemind-session-dev",
    });
  }
  throw new ProviderUnavailable(
    "unknown_provider_kind",
    `${descriptor.kind} is not a runtime provider`,
  );
}
