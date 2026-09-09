import type {
  ChangeReport,
  ContentBundle,
  ContentVersion,
  ValidationRun,
  WorkOrder,
  WorkOrderStatus,
  WorkOrderTemplate,
  WorkOrderTarget,
} from "@hivemind/schema";
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

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.config.apiUrl}${path}`;
    const response = await this.fetchImpl(url, {
      method,
      headers: {
        ...this.headers(),
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
}
