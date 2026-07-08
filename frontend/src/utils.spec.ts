/**
 * parseTeachingSections: the emoji-keyed notebook parser must split a real
 * 9-section notebook, ignore mid-sentence emoji, tolerate decorated headers,
 * and refuse streaming-truncated fragments. arrayBufferToBase64: chunked
 * encoding must match the plain btoa reference on both sides of the 32K chunk
 * boundary.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { parseTeachingSections, arrayBufferToBase64 } from "./utils";

beforeAll(() => {
  // utils.ts calls window.btoa/window.atob inside the functions under test;
  // a minimal stub is enough (no DOM library needed for pure functions).
  (globalThis as { window?: unknown }).window = {
    btoa: (s: string) => Buffer.from(s, "binary").toString("base64"),
    atob: (s: string) => Buffer.from(s, "base64").toString("binary"),
  };
});

const NOTEBOOK = [
  "📝 الإجابة الجاهزة للامتحان",
  "القصور الذاتي هو ممانعة الجسم لتغيير حالته الحركية.",
  "",
  "---",
  "",
  "📓 افهمه بعمق",
  "",
  "1. 🌟 الفكرة الكبرى",
  "كل جسم يقاوم تغيير حالته الحركية.",
  "2. 🤔 مثال من حياتك",
  "عندما تتوقف الحافلة فجأة تندفع إلى الأمام.",
  "3. 📖 شرح مبسّط",
  "القصور الذاتي خاصية طبيعية لكل الأجسام.",
  "4. 🖼 تمثيل بصري",
  "```mermaid",
  'flowchart TD; A["جسم ساكن"] --> B["يبقى ساكنًا"]',
  "```",
  "5. 🧠 التعريف الرسمي",
  "ينص قانون نيوتن الأول على أن $F = 0 \\Rightarrow a = 0$.",
  "6. ✏ مثال محلول",
  "كتاب على طاولة: القوى متزنة فيبقى ساكنًا.",
  "7. ⚠ أخطاء شائعة",
  "الخلط بين القصور الذاتي والكتلة.",
  "8. 🎯 سؤال تحقّق",
  "ماذا يحدث لراكب دراجة عند الكبح المفاجئ؟",
  "9. 📌 ملخّص",
  "القصور الذاتي: الأجسام تحب البقاء على حالها.",
].join("\n");

describe("parseTeachingSections", () => {
  it("parses a well-formed 9-section notebook with the exam answer as preamble", () => {
    const parsed = parseTeachingSections(NOTEBOOK);
    expect(parsed.sections).toHaveLength(9);
    expect(parsed.preamble).toContain("📝 الإجابة الجاهزة للامتحان");
    expect(parsed.preamble).toContain("📓 افهمه بعمق");
    expect(parsed.sections.map((s) => s.emoji)).toEqual(["🌟", "🤔", "📖", "🖼", "🧠", "✏", "⚠", "🎯", "📌"]);
    expect(parsed.sections[0].title).toBe("الفكرة الكبرى");
    expect(parsed.sections[0].content).toContain("كل جسم يقاوم");
    // Section content stops at the next header.
    expect(parsed.sections[0].content).not.toContain("الحافلة");
    // The Mermaid block stays inside the visual section.
    expect(parsed.sections[3].content).toContain("flowchart TD");
    expect(parsed.sections[8].content).toContain("البقاء على حالها");
  });

  it("does not treat a mid-sentence emoji as a section header", () => {
    // The same emoji appears mid-sentence BEFORE the real line-start header:
    // the parser must anchor on the line-start one.
    const text = [
      "تذكر أن الهدف 🎯 هو الفهم العميق.",
      "🌟 الفكرة الكبرى",
      "محتوى الفكرة.",
      "🎯 سؤال تحقّق",
      "ما هي الوحدة؟",
      "📌 ملخّص",
      "الخلاصة هنا.",
    ].join("\n");
    const parsed = parseTeachingSections(text);
    expect(parsed.sections).toHaveLength(3);
    // The mid-sentence 🎯 line stays in the preamble, untouched.
    expect(parsed.preamble).toBe("تذكر أن الهدف 🎯 هو الفهم العميق.");
    const check = parsed.sections.find((s) => s.emoji === "🎯");
    expect(check?.content).toBe("ما هي الوحدة؟");
  });

  it("parses bullet, bold, and bidi-mark prefixed headers", () => {
    const text = [
      "- **🌟 الفكرة الكبرى**",
      "محتوى أول.",
      "‏2) 🤔 **مثال من حياتك**",
      "محتوى ثانٍ.",
      "> 🎯 سؤال تحقّق:",
      "سؤال هنا.",
    ].join("\n");
    const parsed = parseTeachingSections(text);
    expect(parsed.sections).toHaveLength(3);
    expect(parsed.sections[0].title).toBe("الفكرة الكبرى");
    expect(parsed.sections[1].title).toBe("مثال من حياتك");
    expect(parsed.sections[2].title).toBe("سؤال تحقّق");
    expect(parsed.sections[1].content).toBe("محتوى ثانٍ.");
  });

  it("uses the fallback label when a header is the bare emoji", () => {
    const text = ["🌟", "فكرة.", "🤔", "مثال.", "📌", "ملخص."].join("\n");
    const parsed = parseTeachingSections(text);
    expect(parsed.sections).toHaveLength(3);
    expect(parsed.sections[0].title).toBe("الفكرة الكبرى");
  });

  it("returns no sections for streaming-truncated text with fewer than 3 headers", () => {
    const truncated = ["📝 الإجابة", "بعض المحتوى...", "🌟 الفكرة الكبرى", "بداية الفكرة ثم انقطع البث"].join("\n");
    const parsed = parseTeachingSections(truncated);
    expect(parsed.sections).toEqual([]);
    expect(parsed.preamble).toBe("");
  });

  it("returns no sections for plain prose", () => {
    const parsed = parseTeachingSections("جواب قصير عادي بدون أي أقسام.");
    expect(parsed.sections).toEqual([]);
  });
});

describe("arrayBufferToBase64", () => {
  function reference(bytes: Uint8Array): string {
    // Plain byte-by-byte binary string + btoa, the spec behaviour the chunked
    // implementation must reproduce exactly.
    let bin = "";
    for (const b of bytes) bin += String.fromCharCode(b);
    return Buffer.from(bin, "binary").toString("base64");
  }

  it("round-trips a small buffer", () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 255, 128, 64]);
    expect(arrayBufferToBase64(bytes.buffer)).toBe(reference(bytes));
  });

  it("matches the reference across the 0x8000 chunk boundary", () => {
    const n = 0x8000 * 2 + 137; // spans three chunks, last one partial
    const bytes = new Uint8Array(n);
    for (let i = 0; i < n; i++) bytes[i] = (i * 31 + 7) % 256;
    const encoded = arrayBufferToBase64(bytes.buffer);
    expect(encoded).toBe(reference(bytes));
    // And it decodes back to the same bytes.
    const decoded = Buffer.from(encoded, "base64");
    expect(decoded.length).toBe(n);
    expect(decoded[0]).toBe(bytes[0]);
    expect(decoded[n - 1]).toBe(bytes[n - 1]);
    expect(decoded[0x8000]).toBe(bytes[0x8000]);
  });

  it("encodes an empty buffer to an empty string", () => {
    expect(arrayBufferToBase64(new ArrayBuffer(0))).toBe("");
  });
});
