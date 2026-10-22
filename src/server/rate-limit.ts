type Bucket = { count: number; resetAt: number };

// Per-process memory only: Vercel may run several instances, so this throttles a single
// instance rather than the whole deployment. It is enough to slow down password guessing.
const buckets = new Map<string, Bucket>();
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 10 * 60 * 1000;
const MAX_BUCKETS = 1_000;

export function takeLoginAttempt(
  key: string,
  now = Date.now(),
): { allowed: boolean; retryAfterSec: number } {
  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, bucket] of buckets) {
      if (bucket.resetAt <= now) buckets.delete(bucketKey);
    }
  }

  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { allowed: true, retryAfterSec: 0 };
  }

  if (bucket.count >= MAX_ATTEMPTS) {
    return { allowed: false, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }

  bucket.count += 1;
  return { allowed: true, retryAfterSec: 0 };
}

export function clearLoginAttempts(key: string): void {
  buckets.delete(key);
}
