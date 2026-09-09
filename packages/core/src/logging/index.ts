/*
 * Structured logging with redaction (D-019, Stage 01 security constraints).
 * One JSON object per line; secrets, tokens, and keys are masked before they
 * reach any sink. Never log cookies or learner terminal contents outside the
 * redacted telemetry store.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogFields {
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(event: string, fields?: LogFields): void;
  info(event: string, fields?: LogFields): void;
  warn(event: string, fields?: LogFields): void;
  error(event: string, fields?: LogFields): void;
  child(fields: LogFields): Logger;
}

const REDACTIONS: readonly [RegExp, string][] = [
  [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
    "[redacted private key]",
  ],
  [/\b(sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/gu, "[redacted token]"],
  [/\bAKIA[0-9A-Z]{16}\b/gu, "[redacted aws key]"],
  [/\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu, "[redacted github token]"],
  [
    /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/gu,
    "[redacted jwt]",
  ],
  [/\b(authorization|cookie|set-cookie)\s*[:=]\s*[^\s;,]+/giu, "$1: [redacted]"],
  [
    /\b(password|passwd|secret|token|api[_-]?key|client[_-]?secret)\s*[:=]\s*["']?[^\s"',;]+/giu,
    "$1=[redacted]",
  ],
];

export function redact(text: string): string {
  let output = text;
  for (const [pattern, replacement] of REDACTIONS) {
    output = output.replace(pattern, replacement);
  }
  return output;
}

function redactValue(value: unknown, depth = 0): unknown {
  if (typeof value === "string") {
    return redact(value);
  }
  if (value instanceof Error) {
    return { name: value.name, message: redact(value.message) };
  }
  if (Array.isArray(value)) {
    return depth > 4 ? "[truncated]" : value.map((item) => redactValue(item, depth + 1));
  }
  if (value !== null && typeof value === "object") {
    if (depth > 4) {
      return "[truncated]";
    }
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = /password|secret|token|cookie|authorization|private[_-]?key/iu.test(
        key,
      )
        ? "[redacted]"
        : redactValue(item, depth + 1);
    }
    return output;
  }
  return value;
}

export interface LoggerOptions {
  readonly service: string;
  readonly sink?: (line: string) => void;
  readonly clock?: () => string;
  readonly minimumLevel?: LogLevel;
}

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(options: LoggerOptions, bound: LogFields = {}): Logger {
  const sink = options.sink ?? ((line: string) => console.log(line));
  const clock = options.clock ?? (() => new Date().toISOString());
  const minimum = LEVEL_ORDER[options.minimumLevel ?? "info"];
  const emit = (level: LogLevel, event: string, fields?: LogFields): void => {
    if (LEVEL_ORDER[level] < minimum) {
      return;
    }
    const record = redactValue({ ...bound, ...fields }) as Record<string, unknown>;
    sink(
      JSON.stringify({ at: clock(), level, service: options.service, event, ...record }),
    );
  };
  return {
    debug: (event, fields) => emit("debug", event, fields),
    info: (event, fields) => emit("info", event, fields),
    warn: (event, fields) => emit("warn", event, fields),
    error: (event, fields) => emit("error", event, fields),
    child: (fields) => createLogger(options, { ...bound, ...fields }),
  };
}
