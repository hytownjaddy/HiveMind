/*
 * D-019 redaction: obvious API tokens, passwords, private keys, and secrets
 * are replaced before terminal output reaches any durable store (Durable
 * Object SQLite, D1, R2). The filter is versioned; a recording records the
 * version that produced it so a stricter filter never rewrites history.
 */

export const REDACTION_VERSION = "1.0.0";

const MASK = (label: string): string => `[REDACTED ${label}]`;

interface Rule {
  readonly label: string;
  readonly pattern: RegExp;
  /** Replacement keeping the key visible when the secret follows a keyword. */
  readonly replace?: (match: RegExpExecArray) => string;
}

const RULES: readonly Rule[] = [
  {
    label: "PRIVATE KEY",
    pattern:
      /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
  },
  { label: "AWS ACCESS KEY", pattern: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/gu },
  { label: "GITHUB TOKEN", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/gu },
  { label: "GITHUB TOKEN", pattern: /\bgithub_pat_[A-Za-z0-9_]{20,}\b/gu },
  { label: "SLACK TOKEN", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/gu },
  { label: "ANTHROPIC KEY", pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/gu },
  { label: "OPENAI KEY", pattern: /\bsk-[A-Za-z0-9]{32,}\b/gu },
  {
    label: "JWT",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/gu,
  },
  {
    label: "BEARER TOKEN",
    pattern: /\b(bearer)\s+([A-Za-z0-9._~+/-]{16,}=*)/giu,
    replace: (match) => `${match[1] ?? "Bearer"} ${MASK("BEARER TOKEN")}`,
  },
  {
    label: "SECRET",
    pattern:
      /\b(cf-access-client-secret|aws_secret_access_key|client[_-]?secret|api[_-]?key|access[_-]?token|auth[_-]?token|secret[_-]?key|password|passwd|secret|token)\b(\s*[:=]\s*)(["']?)([^\s"'`]{8,})\3/giu,
    replace: (match) =>
      `${match[1] ?? ""}${match[2] ?? ""}${match[3] ?? ""}${MASK("SECRET")}${match[3] ?? ""}`,
  },
  {
    label: "URL CREDENTIAL",
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/[^\s:@/]+):([^\s@/]+)@/giu,
    replace: (match) => `${match[1] ?? ""}:${MASK("URL CREDENTIAL")}@`,
  },
];

/** Redact one complete chunk of text. */
export function redactText(text: string): string {
  let output = text;
  for (const rule of RULES) {
    output = output.replace(rule.pattern, (...args) => {
      if (rule.replace === undefined) {
        return MASK(rule.label);
      }
      const match = args as unknown as RegExpExecArray;
      return rule.replace(match);
    });
  }
  return output;
}

const PEM_BEGIN = /-----BEGIN [A-Z ]*PRIVATE KEY-----/u;
const MAX_HOLD_BYTES = 64 * 1024;
const MAX_LINE_BYTES = 8 * 1024;

/**
 * Streaming variant for PTY output. Bytes are held until a line ends so a
 * token split across frames is still matched; a private-key block is held
 * until its END marker (bounded). `flush` releases whatever is pending.
 */
export class StreamingRedactor {
  private pending = "";

  push(chunk: string): string {
    this.pending += chunk;
    if (
      PEM_BEGIN.test(this.pending) &&
      !/-----END [A-Z ]*PRIVATE KEY-----/u.test(this.pending)
    ) {
      if (this.pending.length < MAX_HOLD_BYTES) {
        return "";
      }
      return this.flush();
    }
    const lastBreak = Math.max(
      this.pending.lastIndexOf("\n"),
      this.pending.lastIndexOf("\r"),
    );
    if (lastBreak === -1) {
      if (this.pending.length < MAX_LINE_BYTES) {
        return "";
      }
      return this.flush();
    }
    const complete = this.pending.slice(0, lastBreak + 1);
    this.pending = this.pending.slice(lastBreak + 1);
    return redactText(complete);
  }

  flush(): string {
    const output = redactText(this.pending);
    this.pending = "";
    return output;
  }

  get pendingLength(): number {
    return this.pending.length;
  }
}
