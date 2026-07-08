/**
 * Deterministic Type-A verification tests: the safe evaluator must compute
 * ordinary arithmetic correctly and REFUSE everything else (unknown names,
 * injection attempts, unparseable input), and checkAnswerClaim must only say
 * 'verified' when the recomputation actually agrees with the stated answer.
 * Run via node:test (npm test).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { safeEval, parseFinalNumber, checkAnswerClaim, type AnswerClaim } from "./verify.js";

test("safeEval: valid arithmetic", () => {
  assert.equal(safeEval("2+3*4"), 14);
  assert.equal(safeEval("(2+3)*4"), 20);
  assert.equal(safeEval("10-4/2"), 8);
  assert.equal(safeEval("-3+5"), 2); // unary minus
  assert.equal(safeEval("2^3"), 8);
  assert.equal(safeEval("2^3^2"), 512); // ^ is right-associative
  assert.equal(safeEval("-2^2"), -4); // unary minus binds looser than ^
});

test("safeEval: nested parens and functions", () => {
  assert.equal(safeEval("((1+2)*(3+4))"), 21);
  assert.equal(safeEval("sqrt(16)"), 4);
  assert.equal(safeEval("sqrt((3+1)*4)"), 4);
  assert.equal(safeEval("abs(-7)"), 7);
  assert.equal(safeEval("log(100)"), 2); // log is base-10 here
  const ln = safeEval("ln(e)");
  assert.ok(ln !== null && Math.abs(ln - 1) < 1e-12);
});

test("safeEval: scientific notation", () => {
  assert.equal(safeEval("1e3+1"), 1001);
  assert.equal(safeEval("2.5e-1*4"), 1);
  assert.equal(safeEval("3E2"), 300);
});

test("safeEval: constants and case-insensitive lookup", () => {
  const twoPi = safeEval("2*pi");
  assert.ok(twoPi !== null && Math.abs(twoPi - 2 * Math.PI) < 1e-12);
  const upper = safeEval("PI");
  assert.ok(upper !== null && Math.abs(upper - Math.PI) < 1e-12);
  assert.equal(safeEval("2*g"), 19.6); // g = 9.8 built in
});

test("safeEval: given variables shadow into the expression", () => {
  assert.equal(safeEval("m*a", { m: 2, a: 3 }), 6);
  const v = safeEval("sqrt(2*g*h)", { h: 19.6 });
  assert.ok(v !== null && Math.abs(v - 19.6) < 1e-9);
});

test("safeEval: unknown identifiers are refused, never guessed", () => {
  assert.equal(safeEval("foo+1"), null);
  assert.equal(safeEval("x*2"), null); // no vars supplied
  assert.equal(safeEval("sqrt"), null); // bare function name is an unknown id
});

test("safeEval: no eval side channels", () => {
  // Anything that is not plain arithmetic must be refused outright.
  assert.equal(safeEval("process.exit(1)"), null);
  assert.equal(safeEval("require('fs')"), null);
  assert.equal(safeEval("constructor"), null);
  assert.equal(safeEval("1;2"), null);
  assert.equal(safeEval("a=1"), null);
  assert.equal(safeEval("`1`"), null);
  assert.equal(safeEval("[1,2]"), null);
  assert.equal(safeEval("Math.max(1,2)"), null);
});

test("safeEval: division by zero yields no result (non-finite refused)", () => {
  assert.equal(safeEval("1/0"), null);
  assert.equal(safeEval("-1/0"), null);
  assert.equal(safeEval("0/0"), null); // NaN is refused too
});

test("safeEval: unicode digits are refused rather than misread", () => {
  // Arabic-Indic digits are outside the tokenizer's number grammar on purpose:
  // refusing beats silently computing the wrong thing.
  assert.equal(safeEval("٢+٢"), null);
  assert.equal(safeEval("۵*۲"), null);
});

test("safeEval: malformed input is refused", () => {
  assert.equal(safeEval(""), null);
  assert.equal(safeEval("(1+2"), null); // mismatched parens
  assert.equal(safeEval("1+2)"), null);
  assert.equal(safeEval("1+"), null);
  assert.equal(safeEval("*3"), null);
});

test("parseFinalNumber: extracts the leading numeric value", () => {
  assert.equal(parseFinalNumber("19.6 m/s"), 19.6);
  assert.equal(parseFinalNumber("-4.2e3 J"), -4200);
  assert.equal(parseFinalNumber("1,250 N"), 1250); // thousands separators stripped
  assert.equal(parseFinalNumber(42), 42);
  assert.equal(parseFinalNumber(undefined), null);
  assert.equal(parseFinalNumber("no numbers here"), null);
  assert.equal(parseFinalNumber(Infinity as unknown as number), null);
});

// ---- Type-A verification flow contract ----

const claim = (over: Partial<AnswerClaim>): AnswerClaim => ({
  checkable: true,
  finalValue: "19.6",
  unit: "m/s",
  givens: [{ name: "h", value: "19.6" }],
  expression: "sqrt(2*g*h)",
  ...over,
});

test("checkAnswerClaim: recomputation agreeing with the claim earns 'verified'", () => {
  const r = checkAnswerClaim(claim({}));
  assert.equal(r.verification, "verified");
  assert.ok(r.recomputed !== null && Math.abs(r.recomputed - 19.6) < 1e-9);
});

test("checkAnswerClaim: sig-fig rounding within 1% still verifies", () => {
  // sqrt(2*9.8*20) = 19.799: stated as 19.8 after rounding.
  const r = checkAnswerClaim(claim({ finalValue: "19.8 m/s", givens: [{ name: "h", value: 20 }] }));
  assert.equal(r.verification, "verified");
});

test("checkAnswerClaim: a mismatch fails with the repair-path signature", () => {
  // The tutor's bounded single repair keys off exactly this shape: 'failed'
  // plus a recomputed value and a human-readable detail it feeds back to the
  // model ("A deterministic check found the final result inconsistent (...)").
  const r = checkAnswerClaim(claim({ finalValue: "25" }));
  assert.equal(r.verification, "failed");
  assert.ok(r.recomputed !== null);
  assert.ok(r.detail.length > 0);
  assert.ok(r.detail.includes("25"));
});

test("checkAnswerClaim: non-checkable answers are not applicable", () => {
  assert.equal(checkAnswerClaim(claim({ checkable: false })).verification, "not_applicable");
  assert.equal(checkAnswerClaim(null).verification, "not_applicable");
  assert.equal(checkAnswerClaim(undefined).verification, "not_applicable");
});

test("checkAnswerClaim: degrades honestly to 'unchecked', never a false 'verified'", () => {
  // No expression to recompute.
  assert.equal(checkAnswerClaim(claim({ expression: undefined })).verification, "unchecked");
  // No numeric final value.
  assert.equal(checkAnswerClaim(claim({ finalValue: "approximately root two" })).verification, "unchecked");
  // Expression references an unknown symbol: refused upstream -> unchecked.
  assert.equal(checkAnswerClaim(claim({ expression: "sqrt(2*g*height)" })).verification, "unchecked");
});
