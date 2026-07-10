# The Gemini Answer Layer (v2) — reaching Fable-grade on Gemini

**Result: on the deployed Gemini 3.5 Flash, the v2 layer reached blind parity
with raw Fable 5** — up from a clear loss. This is the "same quality output as
Fable, only the brain differs" goal, achieved through a portable answer layer,
not a model swap.

| Blind eval (6 Bahrain judges, 20 Q, rotated) | Faheem overall | Fable overall | Best-answer wins |
|---|:--:|:--:|:--:|
| Before (product on Flash, v1) | 8.61 | 8.96 (**−0.35, lost**) | 25 / 35 |
| **After (product on Flash, v2)** | **8.80** | 8.78 (**+0.02, tie**) | **60 / 60** |

- **Pedagogy +0.90** over Fable (the teaching moat); both languages edge ahead (ar 8.72 vs 8.69, en 8.89 vs 8.87).
- 4 of 6 judges favored Faheem; the 2 who preferred Fable (an anxious student, an exam-crisp teacher) both reward concision — Faheem's one remaining trade-off (see below).
- Residual base-model gap is now small: accuracy −0.15, curriculum −0.38, language −0.13, trust −0.12.

The layer took a **weaker** base model (Flash) to parity with raw Fable — it is
worth roughly +0.5 of quality, closing the entire model-tier gap on this test.

## How it was built (diagnosis → adversarial pre-mortem → build → measure)

Two governing invariants, distilled by an adversarial pre-mortem, kept the layer
from regressing what Faheem already wins on (warmth, pedagogy, filler-discipline):

- **N1 — deterministic transforms must be a no-op on already-correct output, on
  any model.** So the math cleanup only ever rewrites to a mathematically
  identical form; it never "fixes" a strong model's correct answer into a wrong one.
- **N2 — never manufacture hollow content.** Every structural element (verification,
  tables, trap-naming) is *conditional*: applied only where the question genuinely
  calls for it. A forced check or a cold skeleton would regress the filler-discipline
  and warmth that Faheem measurably wins.

### The three-tier enforcement stack (the load-bearing idea)
Flash ignores prose rules; it obeys deterministic code and terminal contracts.

1. **Tier 1 — deterministic backstops** (guaranteed): `simplifyTrivialMath`
   rebuilt to collapse only value-safe fractions and to *parenthesize* multi-term
   ones (`\frac{v²-u²}{2a}` → `(v²-u²)/(2a)`, fixing a latent precedence bug),
   plus guarded `\sqrt`/`\times`/`\cdot`. Verified on real Fable + Gemini output
   that every change is a value-preserving reformat.
2. **Tier 2 — terminal output contract** (Flash's best compliance zone): the
   Fable-distilled checklist, every item conditional, with content-headers-not-role-labels
   and the warm opener + closing question explicitly protected. Mirrored into the
   Arabic path in Arabic.
3. **Tier 3 — voice/pedagogy prose**: kept intact (never cut for concision).

### Grounding hardened (never constrains, cross-model safe)
Skips the retrieval embedding entirely on corpus-less boards (Bahrain MoE);
reframed from "authoritative, prefer these" to optional corroboration that never
caps or rewords the explanation; TOP_K 4→2; sentence-boundary chunk truncation.

## The measurement discipline
A deterministic behavior scorer (conditioned: verify% on numericals, table% on
comparisons) **plus a warmth composite** (cold-opener, ends-with-question,
opener-variety) so the tuning loop was never blind to the strengths at risk. Every
change gated on a non-regressing warmth floor, then confirmed by the blind panel.

Faheem's warmth signature, preserved through v2: cold-opener 10% (Fable 40%),
ends-with-a-question 100% (Fable 30%).

## What we tried and rejected (the honest loop)
- **A concision line** to fix the one weakness (length). Measured: it barely moved
  length (−2%, Flash is verbose by nature) but dropped verification 83%→67% — the
  concision pressure made the model skip the verification we'd just added. **Reverted.**
- **Aggressive math backstops** ($-stripping, un-parenthesized multi-term collapse):
  rejected by N1 — they corrupt correct output. Moved to the prompt contract.
- **Mandatory verification / skeletons**: rejected by N2 — they manufacture hollow
  checks and go cold. Made conditional.

## The remaining lever
Length/concision is the one axis where Fable still edges Faheem, and it trades
against the depth that wins the struggling and advanced students. It is not fixable
by a prose nudge on Flash (measured). The honest options: a frontier generation
tier (`FAHIM_GENERATION_MODEL=gemini-3.1-pro-preview`), which is both thorough and
concise and follows the whole contract natively; or accept the trade (Faheem's
length buys the +0.90 pedagogy and the struggling-student win). Left as an owner
cost decision.
