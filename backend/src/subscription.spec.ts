/**
 * Pure subscription-logic tests: the Bahrain (UTC+3) day math, entitlement
 * resolution for every plan state, and the student-facing paywall copy.
 * The DB-backed metering paths are covered by the subscription smoke test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  bahrainDateKey,
  nextBahrainMidnight,
  resolveEntitlement,
  paywallMessage,
  TRIAL_DAILY_QUERIES,
  PLAN_BY_ID,
} from "./subscription.js";

const DAY_MS = 24 * 60 * 60 * 1000;

test("bahrainDateKey: rolls at UTC+3 midnight, not UTC", () => {
  // 20:59 UTC is 23:59 in Bahrain: still the same Bahrain day.
  assert.equal(bahrainDateKey(Date.parse("2026-07-02T20:59:59Z")), "2026-07-02");
  // 21:00 UTC is 00:00 in Bahrain: the next day begins.
  assert.equal(bahrainDateKey(Date.parse("2026-07-02T21:00:00Z")), "2026-07-03");
  // Midday is unambiguous.
  assert.equal(bahrainDateKey(Date.parse("2026-07-02T09:00:00Z")), "2026-07-02");
});

test("nextBahrainMidnight: the reset instant is 21:00 UTC", () => {
  assert.equal(nextBahrainMidnight(Date.parse("2026-07-02T09:00:00Z")), "2026-07-02T21:00:00.000Z");
  // Just before the roll, the next midnight is a minute away...
  assert.equal(nextBahrainMidnight(Date.parse("2026-07-02T20:59:00Z")), "2026-07-02T21:00:00.000Z");
  // ...and just after it, a full day away.
  assert.equal(nextBahrainMidnight(Date.parse("2026-07-02T21:00:30Z")), "2026-07-03T21:00:00.000Z");
});

test("resolveEntitlement: an in-trial account is active with the daily quota", () => {
  const now = Date.now();
  const ent = resolveEntitlement({ plan: "trial", trial_ends_at: new Date(now + 3 * DAY_MS).toISOString() }, 4, now);
  assert.equal(ent.state, "trial");
  assert.equal(ent.active, true);
  assert.equal(ent.limit, TRIAL_DAILY_QUERIES);
  assert.equal(ent.used, 4);
  assert.equal(ent.remaining, TRIAL_DAILY_QUERIES - 4);
  assert.equal(ent.periodType, "day");
  assert.equal(ent.periodKey, `d:${bahrainDateKey(now)}`);
  assert.equal(ent.resetAt, nextBahrainMidnight(now));
});

test("resolveEntitlement: an active paid pass wins, with the plan's quota", () => {
  const now = Date.now();
  const started = now - 5 * DAY_MS;
  const expires = now + 25 * DAY_MS;
  const ent = resolveEntitlement(
    {
      plan: "starter",
      trial_ends_at: new Date(now + DAY_MS).toISOString(), // still-running trial loses to the pass
      plan_started_at: new Date(started).toISOString(),
      plan_expires_at: new Date(expires).toISOString(),
    },
    7,
    now
  );
  assert.equal(ent.state, "active");
  assert.equal(ent.active, true);
  assert.equal(ent.plan, "starter");
  assert.equal(ent.limit, PLAN_BY_ID.starter.monthlyQueries);
  assert.equal(ent.remaining, PLAN_BY_ID.starter.monthlyQueries! - 7);
  assert.equal(ent.periodType, "pass");
  assert.equal(ent.periodKey, `p:${started}`);
});

test("resolveEntitlement: unlimited plan has no limit and no countdown", () => {
  const now = Date.now();
  const ent = resolveEntitlement(
    { plan: "unlimited", plan_started_at: new Date(now).toISOString(), plan_expires_at: new Date(now + 30 * DAY_MS).toISOString() },
    999,
    now
  );
  assert.equal(ent.state, "active");
  assert.equal(ent.limit, null);
  assert.equal(ent.remaining, null);
});

test("resolveEntitlement: an expired trial blocks with trial_expired", () => {
  const now = Date.now();
  const ent = resolveEntitlement({ plan: "trial", trial_ends_at: new Date(now - DAY_MS).toISOString() }, 0, now);
  assert.equal(ent.state, "trial_expired");
  assert.equal(ent.active, false);
  assert.equal(ent.remaining, 0);
  assert.equal(ent.periodType, "none");
  assert.equal(ent.periodKey, "");
});

test("resolveEntitlement: a lapsed paid pass blocks with plan_expired (no trial fallback)", () => {
  const now = Date.now();
  const ent = resolveEntitlement(
    {
      plan: "regular",
      trial_ends_at: new Date(now - 40 * DAY_MS).toISOString(),
      plan_expires_at: new Date(now - DAY_MS).toISOString(),
    },
    0,
    now
  );
  assert.equal(ent.state, "plan_expired");
  assert.equal(ent.active, false);
  assert.equal(ent.planName, "Regular");
});

test("resolveEntitlement: a missing/empty row defaults to trial semantics", () => {
  const ent = resolveEntitlement({}, 0);
  assert.equal(ent.plan, "trial");
  assert.equal(ent.active, false); // no trial_ends_at at all means no access
});

test("paywallMessage: every blocked state has real student-facing copy", () => {
  const now = Date.now();
  const trialEnt = resolveEntitlement({ plan: "trial", trial_ends_at: new Date(now + DAY_MS).toISOString() }, 10, now);
  assert.ok(paywallMessage(trialEnt, "quota").includes("10 free questions"));

  const paidEnt = resolveEntitlement(
    { plan: "starter", plan_started_at: new Date(now).toISOString(), plan_expires_at: new Date(now + DAY_MS).toISOString() },
    100,
    now
  );
  const paidQuota = paywallMessage(paidEnt, "quota");
  assert.ok(paidQuota.includes("100") && paidQuota.includes("Starter"));

  const lapsedEnt = resolveEntitlement({ plan: "regular", plan_expires_at: new Date(now - DAY_MS).toISOString() }, 0, now);
  assert.ok(paywallMessage(lapsedEnt, "no_access").includes("Renew"));

  const expiredTrialEnt = resolveEntitlement({ plan: "trial", trial_ends_at: new Date(now - DAY_MS).toISOString() }, 0, now);
  assert.ok(paywallMessage(expiredTrialEnt, "no_access").includes("free week"));
});
