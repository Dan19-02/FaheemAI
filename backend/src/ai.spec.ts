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
const { classifyQuery, stripInternalLabels, sanitizeDashes } = await import("./ai.js");

// House rule: 0 em dashes in any output, always, no matter what the model emits.
test("sanitizeDashes removes every long dash glyph", () => {
  const em = String.fromCharCode(0x2014); // em dash
  const en = String.fromCharCode(0x2013); // en dash
  const bar = String.fromCharCode(0x2015); // horizontal bar
  const fig = String.fromCharCode(0x2012); // figure dash
  const minus = String.fromCharCode(0x2212); // minus sign
  const input = `Force ${em} the push, a range 9${en}12, bar${bar}here, fig${fig}there, ${minus}5`;
  const out = sanitizeDashes(input);
  assert.ok(!/[‒–—―−]/.test(out), "no long dash glyph survives");
  assert.equal(sanitizeDashes(`a ${em} b`), "a, b"); // em dash -> comma
  assert.equal(sanitizeDashes(`9${en}12`), "9-12"); // numeric range -> hyphen
  assert.equal(sanitizeDashes(""), ""); // empty is safe
});

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

// ---- stripInternalLabels: the NO ROLE-LABELS + no-dash backstops ----
// The prompt bans scaffold labels and long dashes; these tests pin the strip
// that guarantees the house rules hold when the model leaks them anyway.

test("strips English role-labels but keeps the sentence they introduced", () => {
  assert.equal(stripInternalLabels("**Exam edge:** watch the sign of g."), "watch the sign of g.");
  assert.equal(stripInternalLabels("Memory hook: colour needs an empty seat."), "colour needs an empty seat.");
  assert.equal(stripInternalLabels("- Trick: reverse the fraction."), "- reverse the fraction.");
});

test("strips Arabic role-labels the same way", () => {
  assert.equal(stripInternalLabels("ملاحظة: الوحدات مهمة هنا."), "الوحدات مهمة هنا.");
  assert.equal(stripInternalLabels("**خطأ شائع:** نسيان إشارة السالب."), "نسيان إشارة السالب.");
  assert.equal(stripInternalLabels("تحقق سريع: ماذا يحدث لو ضاعفنا الكتلة؟"), "ماذا يحدث لو ضاعفنا الكتلة؟");
});

test("drops a label sitting under a horizontal rule together with the rule", () => {
  assert.equal(stripInternalLabels("The answer is 4 N.\n---\nExam edge: units drop marks."), "The answer is 4 N.\nunits drop marks.");
});

test("replaces em/en dashes without touching Mermaid arrows or hyphens", () => {
  assert.equal(stripInternalLabels("Force — the push — moves it."), "Force, the push, moves it.");
  assert.equal(stripInternalLabels("pages 3–7"), "pages 3-7");
  assert.equal(stripInternalLabels("A --> B stays"), "A --> B stays");
});

test("keeps ordinary content untouched", () => {
  const text = "الضوء ينكسر عند دخوله الماء لأن سرعته تتغير.\n\nSnell's law: $n_1 \\sin i = n_2 \\sin r$";
  assert.equal(stripInternalLabels(text), text);
});

// ---- unresolved inline citation markers (Gemini search-grounding leak) ----
// The Faraday answer in the 2026-07-10 eval leaked 12 bare "[1]" markers with
// no source chip attached; strip them, but never touch array indices, markdown
// links, or math intervals.

test("strips a Faraday-style paragraph riddled with [1] markers", () => {
  const inp =
    "الفكرة تعتمد على تحريك مغناطيس بجانب سلك نحاسي [1]. هذا الاكتشاف [2] هو جوهر القانون [1].";
  assert.equal(
    stripInternalLabels(inp),
    "الفكرة تعتمد على تحريك مغناطيس بجانب سلك نحاسي. هذا الاكتشاف هو جوهر القانون."
  );
});

test("strips runs of adjacent and space-separated markers", () => {
  assert.equal(stripInternalLabels("The generator works [1][2] as expected."), "The generator works as expected.");
  assert.equal(stripInternalLabels("Two sources say so [1] [2] here."), "Two sources say so here.");
});

// ---- simplify trivial LaTeX fractions (clean-math backstop) ----
// Flash under-follows the "use plain notation" prompt rule; this guarantees it.

test("rewrites simple \\frac to clean inline / Unicode fractions", () => {
  assert.equal(stripInternalLabels("$$d = \\frac{1}{2} g t^2$$"), "$$d = ½ g t^2$$");
  assert.equal(stripInternalLabels("speed is \\frac{v}{t} here"), "speed is v/t here");
  assert.equal(stripInternalLabels("\\frac{3}{4} of the mass"), "¾ of the mass");
});

test("keeps the outer stacked fraction on a nested expression", () => {
  // The outer \frac has braces in its numerator, so it never matches and stays
  // a real stacked fraction; the simple inner \frac{a}{b} is cleaned to a/b.
  // Both forms are valid LaTeX and render identically, so this is acceptable.
  assert.equal(stripInternalLabels("$$\\frac{\\frac{a}{b}}{c}$$"), "$$\\frac{a/b}{c}$$");
});

// The N1 no-op invariant: the math backstop must never change a value on any
// model. These pin the correctness hazards the pre-mortem flagged.
test("parenthesizes multi-term fractions so precedence is preserved", () => {
  assert.equal(stripInternalLabels("$$\\frac{a+b}{c+d}$$"), "$$(a+b)/(c+d)$$");
  assert.equal(stripInternalLabels("$$\\frac{v^2-u^2}{2a}$$"), "$$(v^2-u^2)/(2a)$$");
  assert.equal(stripInternalLabels("$$\\frac{-b}{2a}$$"), "$$-b/(2a)$$");
  // implicit product in the denominator gets parens (x/2a would be ambiguous)
  assert.equal(stripInternalLabels("$$\\frac{v^2}{2a}$$"), "$$v^2/(2a)$$");
});

test("math backstop leaves non-target math and prose untouched", () => {
  assert.equal(stripInternalLabels("$$E = mc^2$$"), "$$E = mc^2$$");     // no \frac
  assert.equal(stripInternalLabels("charge is 10^{-19} C"), "charge is 10^{-19} C"); // no superscript mangling
  assert.equal(stripInternalLabels("it costs $5 and $x=3$ ok"), "it costs $5 and $x=3$ ok"); // no $ stripping
});

test("sqrt: single atom bare, multi-term parenthesized, nth-root index preserved", () => {
  assert.equal(stripInternalLabels("$$\\sqrt{2}$$"), "$$√2$$");
  assert.equal(stripInternalLabels("$$\\sqrt{a+b}$$"), "$$√(a+b)$$");
  assert.equal(stripInternalLabels("$$\\sqrt[3]{8}$$"), "$$\\sqrt[3]{8}$$"); // index not silently dropped
});

test("operator glyphs convert but \\cdots is protected", () => {
  assert.equal(stripInternalLabels("2 \\times 3"), "2 × 3");
  assert.equal(stripInternalLabels("a \\cdot b"), "a · b");
  assert.equal(stripInternalLabels("1, 2, \\cdots, n"), "1, 2, \\cdots, n"); // lookahead protects it
});

test("does NOT touch markdown links, array indices, or math intervals", () => {
  // Markdown link with digit text: the trailing "(" guards it.
  assert.equal(stripInternalLabels("see [1](https://x.com) for more"), "see [1](https://x.com) for more");
  // Array index in a code fence: no leading space before the bracket.
  const code = "```python\narr[1] = 5\nx = a[12]\n```";
  assert.equal(stripInternalLabels(code), code);
  // Math interval carries two numbers, so the single-number shape never matches.
  assert.equal(stripInternalLabels("x lies in [0, 1] always"), "x lies in [0, 1] always");
  // A 4-digit number in brackets (e.g. a year) is out of the 1-3 digit range.
  assert.equal(stripInternalLabels("the paper [2026] argues"), "the paper [2026] argues");
});
