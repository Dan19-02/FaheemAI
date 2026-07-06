/**
 * Resilience for external calls (model + embedding providers).
 *
 * Every call over the network gets three defenses, in this order:
 *   1. a HARD timeout, so a stalled dependency can never blow the p95<15s budget
 *      (Clarify had none; a hanging Gemini call would hold the request forever);
 *   2. retry with exponential backoff + jitter on TRANSIENT failures only
 *      (429 / 5xx / timeouts / network resets), never on a 4xx we caused;
 *   3. a per-dependency circuit breaker, so when a provider is clearly down we
 *      fail fast instead of piling requests onto a dead service.
 *
 * A non-transient error (bad request, auth) is thrown straight back and does
 * NOT count against the breaker: that is our bug, not the dependency being down.
 */

export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CircuitOpenError";
  }
}

/** Reject if `p` has not settled within `ms`. The underlying promise keeps
 *  running (JS can't cancel it), but the caller stops waiting on it. */
export function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(`${label} timed out after ${ms}ms`)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer)) as Promise<T>;
}

/** Whether an error is worth retrying (and worth counting against the breaker). */
export function isTransient(e: any): boolean {
  if (e instanceof TimeoutError) return true;
  const status = typeof e?.status === "number" ? e.status : typeof e?.code === "number" ? e.code : undefined;
  if (typeof status === "number") return status === 429 || (status >= 500 && status < 600);
  const msg = String(e?.message || e).toLowerCase();
  return /429|rate.?limit|timeout|timed out|econnreset|etimedout|eai_again|socket hang up|502|503|504|overloaded|unavailable|temporarily/.test(
    msg
  );
}

type BreakerState = "closed" | "open" | "half_open";

/**
 * A minimal per-dependency circuit breaker. Opens after `threshold` consecutive
 * transient failures; after `cooldownMs` it allows probe calls (half-open) and
 * closes again on the first success. Sized for pilot load: half-open may admit
 * a few concurrent probes rather than exactly one, which is acceptable here.
 */
export class CircuitBreaker {
  private failures = 0;
  private state: BreakerState = "closed";
  private openedAt = 0;

  constructor(
    public readonly name: string,
    private readonly threshold: number,
    private readonly cooldownMs: number
  ) {}

  canPass(): boolean {
    if (this.state === "open") {
      if (Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = "half_open";
        return true;
      }
      return false;
    }
    return true;
  }

  onSuccess(): void {
    this.failures = 0;
    this.state = "closed";
  }

  onFailure(): void {
    this.failures++;
    if (this.failures >= this.threshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
  }

  get status(): BreakerState {
    return this.state;
  }
}

const breakers = new Map<string, CircuitBreaker>();

function breakerFor(dependency: string): CircuitBreaker {
  let b = breakers.get(dependency);
  if (!b) {
    const threshold = Math.max(1, Number(process.env.BREAKER_FAILURE_THRESHOLD) || 5);
    const cooldown = Math.max(1_000, Number(process.env.BREAKER_COOLDOWN_MS) || 30_000);
    b = new CircuitBreaker(dependency, threshold, cooldown);
    breakers.set(dependency, b);
  }
  return b;
}

/** Snapshot of every breaker's state, for a health/debug endpoint. */
export function breakerStates(): { dependency: string; state: string }[] {
  return [...breakers.values()].map((b) => ({ dependency: b.name, state: b.status }));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface ExternalCallOpts {
  /** Human label for logs, e.g. "gemini.generate". */
  label: string;
  /** Breaker key: all calls sharing a dependency share a breaker, e.g. "gemini:generate". */
  dependency: string;
  timeoutMs: number;
  retries?: number;
  baseMs?: number;
  maxMs?: number;
}

/**
 * Run an external call with timeout + retry(backoff/jitter) + circuit breaker.
 * Throws CircuitOpenError immediately if the dependency's breaker is open, so
 * callers can degrade gracefully (e.g. serve a low-confidence/unchecked state)
 * instead of blocking. Retries ONLY transient failures.
 */
export async function callExternal<T>(fn: () => Promise<T>, opts: ExternalCallOpts): Promise<T> {
  const breaker = breakerFor(opts.dependency);
  if (!breaker.canPass()) {
    throw new CircuitOpenError(`${opts.dependency} circuit is open; failing fast`);
  }

  const retries = opts.retries ?? Math.max(0, Number(process.env.MODEL_MAX_RETRIES) || 2);
  const baseMs = opts.baseMs ?? 400;
  const maxMs = opts.maxMs ?? 8_000;

  let lastErr: any;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const result = await withTimeout(fn(), opts.timeoutMs, opts.label);
      breaker.onSuccess();
      return result;
    } catch (e) {
      lastErr = e;
      const transient = isTransient(e);
      if (transient) breaker.onFailure();
      // Non-transient: our fault, don't retry or hammer the breaker. Give up now.
      if (!transient || attempt === retries) break;
      const backoff = Math.min(maxMs, baseMs * 2 ** attempt);
      const jitter = backoff * 0.25 * Math.random();
      console.warn(`[resilience] ${opts.label} transient failure (attempt ${attempt + 1}/${retries + 1}), retrying in ${Math.round(backoff + jitter)}ms: ${String((e as any)?.message || e)}`);
      await sleep(backoff + jitter);
    }
  }
  throw lastErr;
}
