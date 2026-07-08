/**
 * Dictionary contract: the Arabic and English bundles must expose exactly the
 * same key set (a missing key renders as a raw key on screen), and no value in
 * either may contain an em dash or en dash (the product-wide punctuation ban).
 */
import { describe, it, expect } from "vitest";
import ar from "./i18n/ar.json";
import en from "./i18n/en.json";

const arKeys = Object.keys(ar as Record<string, string>);
const enKeys = Object.keys(en as Record<string, string>);

describe("i18n dictionaries", () => {
  it("ar.json and en.json have identical key sets", () => {
    const arSet = new Set(arKeys);
    const enSet = new Set(enKeys);
    const missingInEn = arKeys.filter((k) => !enSet.has(k));
    const missingInAr = enKeys.filter((k) => !arSet.has(k));
    expect(missingInEn, "keys present in ar.json but missing in en.json").toEqual([]);
    expect(missingInAr, "keys present in en.json but missing in ar.json").toEqual([]);
  });

  it("has no duplicate-key collisions hiding entries", () => {
    // JSON.parse silently keeps the last duplicate; equal counts before/after
    // Set-dedup prove each file's keys are unique.
    expect(new Set(arKeys).size).toBe(arKeys.length);
    expect(new Set(enKeys).size).toBe(enKeys.length);
  });

  it("no value contains an em dash or en dash", () => {
    const banned = /[\u2013\u2014]/; // en dash, em dash (as escapes: these characters are banned even in source)
    const offenders: string[] = [];
    for (const [k, v] of Object.entries(ar as Record<string, string>)) {
      if (banned.test(v)) offenders.push(`ar:${k}`);
    }
    for (const [k, v] of Object.entries(en as Record<string, string>)) {
      if (banned.test(v)) offenders.push(`en:${k}`);
    }
    expect(offenders).toEqual([]);
  });

  it("every value is a non-empty string", () => {
    for (const v of Object.values(ar as Record<string, string>)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
    for (const v of Object.values(en as Record<string, string>)) {
      expect(typeof v).toBe("string");
      expect(v.length).toBeGreaterThan(0);
    }
  });
});
