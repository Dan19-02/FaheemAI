/**
 * Per-key fixed-window rate limiting, shared by the HTTP routes (chat, TTS,
 * notebook, auth). In-process on purpose: the pilot runs a single instance,
 * and a limiter that resets on deploy is an acceptable tradeoff against
 * adding Redis to the stack.
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, max: number, windowMs = 60_000): boolean {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (b.count >= max) return false;
  b.count++;
  return true;
}

// Expired buckets would otherwise pile up forever (one per user/route/IP key
// ever seen), so sweep them periodically. unref() keeps the timer from holding
// the process open (tests and graceful shutdown must not wait on it).
const SWEEP_INTERVAL_MS = 10 * 60_000;
setInterval(() => {
  const now = Date.now();
  for (const [key, b] of buckets) {
    if (now > b.resetAt) buckets.delete(key);
  }
}, SWEEP_INTERVAL_MS).unref();
