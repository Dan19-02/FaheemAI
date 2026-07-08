/**
 * Topic-gate tests: topicTokens must extract the same content tokens from
 * surface variants (English case/stopwords, Arabic diacritics/tatweel/alef
 * variants), and topicCompatible must allow paraphrases while blocking
 * questions that differ by a meaningful token (first law vs second law).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { topicTokens, topicCompatible, cosine } from "./knowledge.js";

test("topicTokens: English content words survive, stopwords drop", () => {
  const t = topicTokens("What is photosynthesis?");
  assert.ok(t.has("photosynthesis"));
  assert.ok(!t.has("what"));
  assert.ok(!t.has("is"));
  assert.equal(t.size, 1);
});

test("topicTokens: lowercases and drops short Latin tokens", () => {
  const t = topicTokens("Explain the LAWS of Motion to me");
  assert.ok(t.has("laws"));
  assert.ok(t.has("motion"));
  assert.ok(!t.has("me")); // under the 3-char Latin minimum
  assert.ok(!t.has("explain")); // stopword
});

test("topicTokens: Arabic diacritics (harakat) are normalized away", () => {
  const withDiacritics = topicTokens("مقدّمة");
  const without = topicTokens("مقدمه"); // also exercises ta marbuta -> ha
  assert.deepEqual([...withDiacritics], [...without]);
});

test("topicTokens: tatweel stretching is normalized away", () => {
  const stretched = topicTokens("فيــــزياء");
  const plain = topicTokens("فيزياء");
  assert.deepEqual([...stretched], [...plain]);
});

test("topicTokens: alef variants unify to bare alef", () => {
  const hamza = topicTokens("أكسجين");
  const bare = topicTokens("اكسجين");
  assert.deepEqual([...hamza], [...bare]);
});

test("topicTokens: Arabic question/filler stopwords drop", () => {
  const t = topicTokens("ما هو التمثيل الضوئي؟");
  assert.ok(!t.has("ما"));
  assert.ok(!t.has("هو"));
  assert.ok(t.has("التمثيل"));
  assert.ok(t.has("الضوئي"));
});

test("topicCompatible: paraphrase that only adds filler is compatible", () => {
  const a = topicTokens("photosynthesis");
  const b = topicTokens("the process of photosynthesis");
  // "process" is a content token, so subset holds one way: a ⊆ b.
  assert.equal(topicCompatible(a, b), true);
  assert.equal(topicCompatible(b, a), true); // symmetric by the small-into-big rule
});

test("topicCompatible: Newton's first vs second law must NOT be compatible", () => {
  const first = topicTokens("state newton's first law of motion");
  const second = topicTokens("state newton's second law of motion");
  assert.equal(topicCompatible(first, second), false);
});

test("topicCompatible: kinetic vs potential energy must NOT be compatible", () => {
  const kinetic = topicTokens("define kinetic energy");
  const potential = topicTokens("define potential energy");
  assert.equal(topicCompatible(kinetic, potential), false);
});

test("topicCompatible: Arabic paraphrase pair is compatible", () => {
  const a = topicTokens("اشرح لي قانون نيوتن الاول");
  const b = topicTokens("ما هو قانون نيوتن الأول؟"); // alef variant + question words
  assert.equal(topicCompatible(a, b), true);
});

test("topicCompatible: Arabic first vs second law must NOT be compatible", () => {
  const first = topicTokens("قانون نيوتن الأول");
  const second = topicTokens("قانون نيوتن الثاني");
  assert.equal(topicCompatible(first, second), false);
});

test("topicCompatible: empty token sets only match empty (conservative gate)", () => {
  const empty = topicTokens("!!! ؟؟");
  assert.equal(empty.size, 0);
  assert.equal(topicCompatible(empty, topicTokens("photosynthesis")), false);
  assert.equal(topicCompatible(empty, new Set()), true);
});

test("cosine: identical direction is 1, orthogonal is 0, mismatched lengths are 0", () => {
  assert.ok(Math.abs(cosine([1, 2, 3], [2, 4, 6]) - 1) < 1e-12);
  assert.equal(cosine([1, 0], [0, 1]), 0);
  assert.equal(cosine([1, 2], [1, 2, 3]), 0);
});
