/**
 * pickFirstFactIndex: the opening "Did you know?" fact must match the
 * student's question by tag in either language (with Arabic diacritics and
 * alef variants folded away), and fall back deterministically when nothing
 * matches.
 */
import { describe, it, expect } from "vitest";
import { pickFirstFactIndex, STUDY_FACTS } from "./facts";

describe("pickFirstFactIndex", () => {
  it("matches an Arabic seed carrying diacritics to the right fact", () => {
    // The shadda/fatha in "النَّبات" would break a raw substring match against
    // the tag "نبات"; normalization must fold them away.
    const idx = pickFirstFactIndex("اشرح البِناء الضَّوئي في النَّبات");
    expect(STUDY_FACTS[idx].tags).toContain("نبات");
    expect(STUDY_FACTS[idx].en).toContain("Photosynthesis");
  });

  it("folds alef variants so a hamza seed matches a bare-alef tag", () => {
    const idx = pickFirstFactIndex("ما هو الأكسجين");
    expect(STUDY_FACTS[idx].tags).toContain("أكسجين");
  });

  it("matches an English seed by tag and prefers the highest tag score", () => {
    const idx = pickFirstFactIndex("Why does ice float on water?");
    // Both "ice" and "water" hit the density fact; no other fact scores 2.
    expect(STUDY_FACTS[idx].tags).toContain("ice");
    expect(STUDY_FACTS[idx].tags).toContain("density");
  });

  it("matches English case-insensitively", () => {
    const idx = pickFirstFactIndex("EXPLAIN NEWTON'S LAW OF INERTIA");
    expect(STUDY_FACTS[idx].tags).toContain("newton");
  });

  it("falls back to length-modulo when nothing matches", () => {
    const seed = "qqqq zzzz";
    const idx = pickFirstFactIndex(seed);
    expect(idx).toBe(seed.length % STUDY_FACTS.length);
  });

  it("uses the stable middle fact for an empty seed", () => {
    expect(pickFirstFactIndex("")).toBe(Math.floor(STUDY_FACTS.length / 2));
    expect(pickFirstFactIndex("   ")).toBe(Math.floor(STUDY_FACTS.length / 2));
  });
});
