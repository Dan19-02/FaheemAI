# Fable 5 vs. Gemini 3 Pro — Blind Bilingual Head-to-Head

**Raw model vs. raw model.** Both were given the *same* neutral generic-assistant
prompt (no product spec) on 20 curriculum questions (10 Arabic + 10 English),
blind-judged by 6 Bahrain personas. This isolates raw model quality, not the
Faheem product layer.

> ### Which "Gemini 3 Pro"?
> **`gemini-3-pro-preview` is retired** — it is listed in the model catalogue but
> its generation endpoint returns a hard **404** ("no longer available") on this
> key. The live Gemini 3 Pro tier is **`gemini-3.1-pro-preview`**, which is what
> was used, at the user's direction, as the Gemini contestant.

> ### ⚠️ Read this first
> - Both contestants got the **same neutral prompt**, language-adaptive (Arabic or English).
> - Judges are **AI personas** (3 Bahrain teacher personas, 3 Bahrain student personas), not real people.
> - **Blind & rotated.** Each judge read anonymized answers (A)/(B); which model sat in which slot was rotated per question.
> - Validate with **real Bahraini teachers and students** before any external claim.

---

## Result — Fable 5 wins clearly

| System | Overall | Accuracy | Curriculum | Language | Pedagogy | Trust | Best-answer wins |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 🥇 **Fable 5** | **8.88** | **9.43** | **8.79** | **8.73** | **8.82** | **8.61** | **95 / 119** |
| 🥈 Gemini 3.1 Pro | 8.38 | 9.05 | 8.18 | 8.55 | 8.10 | 8.00 | 24 / 119 |

**Fable 5 leads by +0.50 overall and wins every single dimension**, taking the
best-answer vote on **95 of 119 gradings (80%)**. The widest gaps are on
**pedagogy (+0.72)**, **curriculum fit (+0.61)**, and **trust (+0.61)**; accuracy
is closest (+0.38, both models are strong on raw correctness).

### By language and by judge

| Split | Fable 5 | Gemini 3.1 Pro | Δ |
|---|:--:|:--:|:--:|
| Arabic (10 Q) | 8.85 | 8.28 | +0.57 |
| English (10 Q) | 8.90 | 8.47 | +0.43 |
| Teachers (3) | ~9.21 | 8.61 | Fable **53** / Gemini 7 wins |
| Students (3) | ~8.54 | 8.15 | Fable **42** / Gemini 17 wins |

Fable won or tied **18 of 20 questions**. Gemini took only **EN4** (simultaneous
equations, 4–2) and **EN8** ("why learn about cells", 5–1), and drew **AR8**
(photosynthesis) essentially level. Teachers were nearly unanimous for Fable; the
struggling grade-9 student (S3) was the closest split (11–9), consistent with the
earlier finding that simpler learners are the least sensitive to the quality gap.

**Takeaway:** on raw model quality, in both Arabic and English, Fable 5 (a
Mythos-class frontier model) clearly outclasses Gemini 3.1 Pro for this
tutoring use case — most on the *teaching* qualities, least on raw accuracy.
This is the mirror image of the Faheem-product-vs-Fable eval: there the product
ran on Gemini Flash and lost to raw Fable; here Fable is measured directly and
wins. Both point the same way — **the generation tier is where the quality is.**

---

## Token usage & cost of this test

Every model call in this test, with tokens counted exactly (Gemini from
`usageMetadata`; Fable from transcript usage records).

| Component | Tokens | Notes |
|---|--:|---|
| Gemini 3.1 Pro — 20 answers | **34,060** | in 2,310 / out 31,750 (visible 9,291 + **thinking 22,459**) |
| Fable 5 — 20 answers | **1,129,745** | in 362,323 / out 15,392 / cache 752,030 |
| Judges — 6 × 20 gradings | **2,709,499** | in 139,536 / out 49,419 / cache 2,520,544 |
| **Grand total** | **3,873,304** | |

**Cost:**

| Component | Cost | Basis |
|---|--:|---|
| Gemini 3.1 Pro (real spend on the API key) | **$0.39** | $2 / $12 per 1M in/out (≤200K tier); thinking billed as output |
| Fable 5 — 20 answers | $5.14 | Fable 5 API list ($10 / $50 per 1M; cache ~$1/1M) |
| Judges — 6 × Fable 5 | $6.39 | same |
| **Grand total (Gemini real + Fable at list rates)** | **≈ $11.92** | |

### Two honest caveats on the cost

1. **The Fable numbers are dominated by harness overhead, not by answering the
   question.** Gemini was called as a bare API request (~115 input tokens per
   question). Fable ran through the agent harness, which prepends a large system
   prompt (~15–25K tokens) and heavy prompt-cache traffic per agent. So the Fable
   token counts reflect the *test scaffolding*, not the model's answer cost.
2. **Only the $0.39 Gemini figure is real money.** The Fable/Claude side ran on
   the Claude subscription; the ~$11.53 is "if it had been billed at Fable 5 API
   list rates."

**Apples-to-apples generation cost** (just the 20 answers, as a bare API call):

| Model | 20-answer generation cost |
|---|--:|
| Gemini 3.1 Pro | **$0.39** (real) |
| Fable 5 | **~$0.79** (est.) |

So on the metric that actually compares the two models, Fable 5 costs roughly
**2× Gemini 3.1 Pro** to generate — for a clearly higher-quality answer. The
judging pass (6 judges re-reading a 68K-character packet each) is what makes the
*total test* expensive, not the contestants.

*Raw data:* [`fable-vs-gemini31pro.json`](fable-vs-gemini31pro.json) — questions,
both models' full answers, the blind A/B mapping, every judge's per-item scores
and notes, and the exact token usage.
