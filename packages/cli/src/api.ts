import type {
  ChangeReport,
  ContentBundle,
  ContentVersion,
  CreateSessionRequest,
  SequencedSessionEvent,
  SessionSummary,
  ValidationRun,
  WorkOrder,
  WorkOrderStatus,
  WorkOrderTemplate,
  WorkOrderTarget,
} from "@hivemind/schema";
import type { LabSessionIndex } from "@hivemind/core";
import type { BundleSummary } from "@hivemind/core/compiler";

import type { CliConfig } from "./config";

/*
 * Thin client for API v1. Service tokens travel as the Access client headers;
 * Access validates them at the edge and the Worker sees a service JWT. In
 * local development the web app's dev bypass accepts requests without them.
 */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly body: string,
    readonly url: string,
  ) {
    super(`${status} from ${url}: ${body.slice(0, 300)}`);
  }
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class HiveMindApi {
  constructor(
    private readonly config: CliConfig,
    private readonly fetchImpl: FetchLike = (input, init) => fetch(input, init),
  ) {}

  private headers(): Record<string, string> {
    const headers: Record<string, string> = { accept: "application/json" };
    if (
      this.config.accessClientId !== undefined &&
      this.config.accessClientSecret !== undefined
    ) {
      headers["CF-Access-Client-Id"] = this.config.accessClientId;
      headers["CF-Access-Client-Secret"] = this.config.accessClientSecret;
    }
    return headers;
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    base: string = this.config.apiUrl,
  ): Promise<T> {
    const url = `${base}${path}`;
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        ...this.headers(),
        // The session gateway allow-lists the web origin; the web Worker's proxy
        // requires the request's own origin.
        ...(base === this.config.sessionUrl
          ? { origin: new URL(this.config.apiUrl).origin }
          : {}),
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new ApiError(response.status, text, url);
    }
    return (text.length === 0 ? null : JSON.parse(text)) as T;
  }

  health(): Promise<{ ok: boolean }> {
    return this.request("GET", "/api/health");
  }

  me(): Promise<{ id: string; display_name: string }> {
    return this.request("GET", "/api/me");
  }

  contentSummary(): Promise<BundleSummary> {
    return this.request("GET", "/api/content/summary");
  }

  publishContent(
    bundle: ContentBundle,
    note?: string,
  ): Promise<{ version: ContentVersion; reused: boolean }> {
    return this.request("POST", "/api/content/versions", {
      bundle,
      ...(note === undefined ? {} : { note }),
    });
  }

  listWorkOrders(status?: WorkOrderStatus): Promise<{ orders: WorkOrder[] }> {
    return this.request(
      "GET",
      `/api/work-orders${status === undefined ? "" : `?status=${status}`}`,
    );
  }

  getWorkOrder(id: string): Promise<{ order: WorkOrder }> {
    return this.request("GET", `/api/work-orders/${encodeURIComponent(id)}`);
  }

  createWorkOrder(input: {
    template: WorkOrderTemplate;
    target: WorkOrderTarget;
    instructions: string;
    title?: string;
    priority?: WorkOrder["priority"];
    labels?: string[];
  }): Promise<{ order: WorkOrder }> {
    return this.request("POST", "/api/work-orders", input);
  }

  exportWorkOrder(id: string): Promise<{ order: WorkOrder; file: string }> {
    return this.request("POST", `/api/work-orders/${encodeURIComponent(id)}/export`);
  }

  transitionWorkOrder(
    id: string,
    to: WorkOrderStatus,
    note?: string,
  ): Promise<{ order: WorkOrder }> {
    return this.request("POST", `/api/work-orders/${encodeURIComponent(id)}/transition`, {
      to,
      ...(note === undefined ? {} : { note }),
    });
  }

  recordValidation(id: string, run: ValidationRun): Promise<{ order: WorkOrder }> {
    return this.request(
      "POST",
      `/api/work-orders/${encodeURIComponent(id)}/validation-runs`,
      run,
    );
  }

  completeWorkOrder(id: string, report: ChangeReport): Promise<{ order: WorkOrder }> {
    return this.request(
      "POST",
      `/api/work-orders/${encodeURIComponent(id)}/complete`,
      report,
    );
  }

  exportArchive(): Promise<unknown> {
    return this.request("GET", "/api/export");
  }

  /* Session Worker (through the web proxy, or directly in local development). */

  createLab(request: CreateSessionRequest): Promise<SessionSummary> {
    return this.request("POST", "/session/labs", request, this.config.sessionUrl);
  }

  getLab(id: string): Promise<SessionSummary> {
    return this.request(
      "GET",
      `/session/labs/${encodeURIComponent(id)}`,
      undefined,
      this.config.sessionUrl,
    );
  }

  listLabs(): Promise<{ sessions: LabSessionIndex[] }> {
    return this.request("GET", "/session/labs", undefined, this.config.sessionUrl);
  }

  destroyLab(id: string): Promise<SessionSummary> {
    return this.request(
      "POST",
      `/session/labs/${encodeURIComponent(id)}/destroy`,
      undefined,
      this.config.sessionUrl,
    );
  }

  labEvents(
    id: string,
    after = 0,
  ): Promise<{ session: SessionSummary; events: SequencedSessionEvent[] }> {
    return this.request(
      "GET",
      `/session/labs/${encodeURIComponent(id)}/events?after=${after}`,
      undefined,
      this.config.sessionUrl,
    );
  }

  /** WebSocket URL and headers for `hivemind lab attach`. */
  labSocket(id: string): { url: string; headers: Record<string, string> } {
    const url = `${this.config.sessionUrl.replace(/^http/u, "ws")}/session/labs/${encodeURIComponent(id)}/ws`;
    return {
      url,
      headers: { ...this.headers(), origin: new URL(this.config.apiUrl).origin },
    };
  }
}
