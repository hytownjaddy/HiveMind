interface BurstBucket {
  count: number;
  resetAt: number;
}

const WINDOW_MS = 10_000;
const MAX_REQUESTS = 120;
const MAX_BUCKETS = 5_000;
const buckets = new Map<string, BurstBucket>();

/**
 * Per-isolate burst limiter for the HTTP gateway. It is intentionally simple:
 * Cloudflare may run several isolates, so treat this as abuse damping, not a
 * hard quota. Move to the Rate Limiting binding if precise limits are needed.
 */
export function consumeGatewayBurst(key: string, now = Date.now()): boolean {
  const current = buckets.get(key);
  if (current === undefined || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
  } else {
    current.count += 1;
    if (current.count > MAX_REQUESTS) {
      return false;
    }
  }

  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) {
        buckets.delete(bucketKey);
      }
    }
  }
  return true;
}
