/**
 * Resilience layer tests: hard timeout, transient-only retry with backoff,
 * and the per-dependency circuit breaker (open after threshold, half-open
 * after cooldown, fail fast while open). Real timers with millisecond-scale
 * budgets keep the whole suite well under a second.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  withTimeout,
  isTransient,
  callExternal,
  CircuitBreaker,
  CircuitOpenError,
  TimeoutError,
  breakerStates,
} from "./resilience.js";

const never = () => new Promise<never>(() => {});
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Distinct dependency names per test: breakers are cached per dependency for
// the process lifetime, so tests must never share one.
let seq = 0;
const dep = () => `test-dep-${++seq}`;

// Small breaker knobs for every breaker the tests create (read at creation).
process.env.BREAKER_FAILURE_THRESHOLD = "2";
process.env.BREAKER_COOLDOWN_MS = "1000"; // clamped floor is 1s, the smallest allowed

function transientError(): Error & { status: number } {
  return Object.assign(new Error("upstream 503"), { status: 503 });
}
function fatalError(): Error & { status: number } {
  return Object.assign(new Error("bad request"), { status: 400 });
}

test("withTimeout: fires when the promise never settles", async () => {
  await assert.rejects(withTimeout(never(), 30, "stalled call"), (e: unknown) => {
    assert.ok(e instanceof TimeoutError);
    assert.match((e as Error).message, /stalled call timed out after 30ms/);
    return true;
  });
});

test("withTimeout: passes a fast result through untouched", async () => {
  assert.equal(await withTimeout(Promise.resolve(7), 50, "fast"), 7);
});

test("isTransient: classifies retry-worthy failures only", () => {
  assert.ok(isTransient(new TimeoutError("t")));
  assert.ok(isTransient({ status: 429 }));
  assert.ok(isTransient({ status: 503 }));
  assert.ok(isTransient(new Error("ECONNRESET while reading")));
  assert.ok(isTransient(new Error("model overloaded, please retry")));
  assert.ok(!isTransient({ status: 400 }));
  assert.ok(!isTransient({ status: 401 }));
  assert.ok(!isTransient(new Error("invalid argument: contents")));
});

test("callExternal: transient failures retry with backoff until success", async () => {
  let attempts = 0;
  const t0 = Date.now();
  const result = await callExternal(
    async () => {
      attempts++;
      if (attempts < 3) throw transientError();
      return "ok";
    },
    { label: "flaky", dependency: dep(), timeoutMs: 100, retries: 2, baseMs: 10, maxMs: 40 }
  );
  assert.equal(result, "ok");
  assert.equal(attempts, 3);
  // Backoff between attempts: at least base + base*2 = 30ms of waiting.
  assert.ok(Date.now() - t0 >= 25, "expected exponential backoff delays between retries");
});

test("callExternal: a timeout counts as transient and is retried", async () => {
  let attempts = 0;
  const result = await callExternal(
    async () => {
      attempts++;
      if (attempts === 1) return never(); // stalls; the hard timeout fires
      return "recovered";
    },
    { label: "stall-once", dependency: dep(), timeoutMs: 25, retries: 1, baseMs: 5, maxMs: 10 }
  );
  assert.equal(result, "recovered");
  assert.equal(attempts, 2);
});

test("callExternal: non-transient errors do not retry and do not trip the breaker", async () => {
  const dependency = dep();
  let attempts = 0;
  // Threshold is 2: three straight 400s would open the breaker if they counted.
  for (let i = 0; i < 3; i++) {
    await assert.rejects(
      callExternal(
        async () => {
          attempts++;
          throw fatalError();
        },
        { label: "our-bug", dependency, timeoutMs: 100, retries: 2, baseMs: 5, maxMs: 10 }
      ),
      (e: any) => e?.status === 400
    );
  }
  assert.equal(attempts, 3, "a 4xx must fail on the first attempt, never retry");
  const state = breakerStates().find((b) => b.dependency === dependency);
  assert.equal(state?.state, "closed", "non-transient failures must not count against the breaker");
});

test("callExternal: breaker opens after threshold and fails fast with CircuitOpenError", async () => {
  const dependency = dep();
  // Two transient failures (threshold) with retries disabled.
  for (let i = 0; i < 2; i++) {
    await assert.rejects(
      callExternal(async () => Promise.reject(transientError()), {
        label: "down",
        dependency,
        timeoutMs: 100,
        retries: 0,
      }),
      (e: any) => e?.status === 503
    );
  }
  assert.equal(breakerStates().find((b) => b.dependency === dependency)?.state, "open");

  // While open: refused immediately, without invoking the call at all.
  let invoked = false;
  await assert.rejects(
    callExternal(
      async () => {
        invoked = true;
        return "should not run";
      },
      { label: "refused", dependency, timeoutMs: 100, retries: 0 }
    ),
    (e: unknown) => e instanceof CircuitOpenError
  );
  assert.equal(invoked, false, "an open breaker must fail fast, not place the call");
});

test("callExternal: breaker half-opens after cooldown and closes on a probe success", async () => {
  const dependency = dep();
  for (let i = 0; i < 2; i++) {
    await assert.rejects(
      callExternal(async () => Promise.reject(transientError()), {
        label: "down",
        dependency,
        timeoutMs: 100,
        retries: 0,
      })
    );
  }
  assert.equal(breakerStates().find((b) => b.dependency === dependency)?.state, "open");

  await sleep(1050); // past the 1s cooldown floor
  const result = await callExternal(async () => "probe ok", {
    label: "probe",
    dependency,
    timeoutMs: 100,
    retries: 0,
  });
  assert.equal(result, "probe ok");
  assert.equal(breakerStates().find((b) => b.dependency === dependency)?.state, "closed");
});

test("CircuitBreaker: full state machine (closed -> open -> half_open -> closed)", async () => {
  const b = new CircuitBreaker("unit", 3, 40);
  assert.equal(b.status, "closed");
  b.onFailure();
  b.onFailure();
  assert.equal(b.status, "closed", "below threshold stays closed");
  b.onFailure();
  assert.equal(b.status, "open");
  assert.equal(b.canPass(), false, "open refuses while cooling down");

  await sleep(50);
  assert.equal(b.canPass(), true, "cooldown elapsed admits a probe");
  assert.equal(b.status, "half_open");
  b.onSuccess();
  assert.equal(b.status, "closed");

  // A success also resets the consecutive-failure count.
  b.onFailure();
  b.onFailure();
  assert.equal(b.status, "closed");
});

test("CircuitBreaker: a failed half-open probe re-opens immediately", async () => {
  const b = new CircuitBreaker("unit2", 2, 40);
  b.onFailure();
  b.onFailure();
  assert.equal(b.status, "open");
  await sleep(50);
  assert.equal(b.canPass(), true); // half-open probe admitted
  b.onFailure(); // probe failed: count is already at threshold, so it re-opens
  assert.equal(b.status, "open");
  assert.equal(b.canPass(), false);
});
