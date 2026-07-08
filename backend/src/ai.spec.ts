/**
 * classifyQuery routing tests: concept questions stay on the standard teaching
 * path, genuine current-events / recency lookups go to grounded search, and
 * quantitative work goes to thinking, even when a year-like number appears.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

// ai.ts pulls in auth.ts, which exits at import time if it sees a
// production-looking environment without JWT_SECRET; pin a test secret first.
// A dynamic import keeps this assignment ahead of the module evaluation
// (static imports would hoist above it).
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const { classifyQuery } = await import("./ai.js");

test("concept questions route standard (no search)", () => {
  assert.equal(classifyQuery("What is photosynthesis?"), "standard");
  assert.equal(classifyQuery("Explain Newton's first law simply"), "standard");
  assert.equal(classifyQuery("I didn't understand osmosis in class today"), "standard");
  assert.equal(classifyQuery("why does ice float on water"), "standard");
});

test("recency intent routes to search", () => {
  assert.equal(classifyQuery("latest 2026 syllabus for grade 10 physics"), "search");
  assert.equal(classifyQuery("who is the current president of France"), "search");
  assert.equal(classifyQuery("today's weather in Manama"), "search");
  assert.equal(classifyQuery("price of gold today"), "search");
});

test("quantitative questions route to thinking", () => {
  assert.equal(classifyQuery("Solve x^2 - 5x + 6 = 0"), "thinking");
  assert.equal(classifyQuery("Calculate the kinetic energy of a 2 kg ball at 3 m/s"), "thinking");
  assert.equal(classifyQuery("derive the equation of motion v = u + at"), "thinking");
  assert.equal(classifyQuery("what is 12 * 8"), "thinking");
});

test("a numerical that merely mentions a year does NOT route to search", () => {
  // Computational verbs win outright, even with a year in the text.
  assert.equal(classifyQuery("In 2026 a car accelerates at 2 m/s^2, calculate its velocity after 5 s"), "thinking");
  // No computational verb, but the year sits among other numbers with no
  // recency intent: a textbook numerical, not a current-events lookup.
  assert.equal(classifyQuery("In 2024 a factory produced 500 units and in the next year 750 units. What fraction grew?"), "standard");
});

test("a bare year with no other numbers is a factual lookup (search)", () => {
  assert.equal(classifyQuery("world cup 2026 winner"), "search");
});
