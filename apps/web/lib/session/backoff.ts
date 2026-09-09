const BASE_MS = 250;
const MAX_MS = 8_000;

/** Bounded jittered backoff for WebSocket reconnect attempts. */
export function reconnectDelayMs(attempt: number): number {
  const exp = Math.min(MAX_MS, BASE_MS * 2 ** Math.max(0, attempt));
  const jitter = Math.floor(Math.random() * Math.min(250, exp / 2));
  return Math.min(MAX_MS, exp + jitter);
}
