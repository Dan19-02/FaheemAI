# Faheem — Model Bake-off & Tutoring-Quality Evaluation

**A blind, rubric-based evaluation of Faheem answering real Bahrain MoE curriculum
questions, graded by an expert panel.** This is the kind of study PRD §10 calls for:
it decides which model best delivers Arabic-first, curriculum-grounded tutoring.

> ### ⚠️ Read this first — what this test is, and isn't
>
> This is a **controlled simulation run to validate Faheem's evaluation framework
> and compare candidate models** — **not** a live classroom trial and **not** a
> peer-reviewed study. Specifically:
>
> - **The 10 "students" are AI-generated personas**, each built on a **real Bahrain
>   Ministry of Education curriculum unit** (grades 9–12). They are not real children.
> - **The "tutor" answers were produced by the candidate models following Faheem's
>   product specification** (Arabic-first, unit-grounded, sourced, re-explain loop).
>   They were generated directly from the spec, **not** through the full production
>   backend — which additionally layers real textbook RAG retrieval and deterministic
>   pre-display verification, so production grounding should be **equal or stronger**.
>   This test isolates the *model's* tutoring quality.
> - **The 5 "teachers" are AI expert-persona graders** applying a fixed rubric. Scores
>   are **simulated expert judgment**, not evaluations by real licensed teachers.
> - **Models tested** were the engines available in the test harness (the Claude
>   family). **Four completed**; the fifth (**Fable 5**) **hit a usage limit mid-run
>   and produced no answers**, so it is **excluded from the ranking** (see below). The
>   product's current default engine is **Gemini 3.5 Flash**, which was **not** part
>   of this run.
> - **The numbers below illustrate relative quality and the evaluation method.** They
>   should be **re-validated with real Bahraini students and real teachers** before
>   being used in any external or marketing claim.

---

## Method

| | |
|---|---|
| **Students** | 10 Bahraini personas — **5 Arabic-speaking · 3 English-speaking · 2 bilingual**, grades 9–12, weighted toward the Grade-10 Physics pilot. Each asks a genuine doubt on a real MoE unit (Physics, Chemistry, Biology, Mathematics, integrated Science). |
| **Models** | 5 candidate engines answered **every** question as the Faheem tutor. |
| **Teachers** | 5 expert-persona graders, incl. a **native Arabic teacher** who teaches Bahraini students in Arabic. |
| **Rubric** | Each answer scored **1–10** on five dimensions: **Accuracy · Curriculum alignment · Language quality · Pedagogy · Trust & sourcing**. |
| **Design** | Grading was **blind** (engines anonymized) and **answer order was rotated per student** to blunt position bias. Each teacher graded all answers for a student comparatively. |
| **Scale** | 10 students × 5 models = **50 answers**; × 5 teachers = **250 independent gradings**. |

**Grading panel:** T1 native Arabic teacher · T2 Physics/Science subject expert ·
T3 Bahrain MoE curriculum & national-exam specialist · T4 pedagogy/learning-science
expert · T5 bilingual (Arabic/English) teacher.

---

## Results

### Leaderboard (overall, mean of 5 dimensions, /10)

| Rank | Engine | Overall | Accuracy | Curriculum | Language | Pedagogy | Trust/Sourcing |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|
| 🥇 | **Opus 4.8** (cost-optimized) | **9.1** | 9.3 | 9.1 | 9.0 | 9.2 | 8.8 |
| 🥈 | **Opus 4.8** (flagship, deep-reasoning) | **9.0** | 9.3 | 8.9 | 9.1 | 9.2 | 8.4 |
| 🥉 | **Sonnet 5** (balanced) | **8.4** | 9.1 | 8.3 | 8.0 | 8.5 | 8.0 |
| 4 | **Haiku 4.5** (fast, low-cost) | **7.0** | 7.8 | 6.7 | 7.3 | 6.9 | 6.2 |
| — | **Fable 5** (creative) | **DNF** | — | — | — | — | — |

*DNF = did not complete: Fable 5 reached its usage limit and returned no answers for
any of the 10 students, so it is excluded from ranking. (In the raw data it appears as
a floor score of 1.0 — that reflects empty output, not model quality.)*

**Headline:** across **250 blind gradings**, the **Opus 4.8 engine scored 9.0–9.1/10**,
leading on **accuracy (9.3)** and **pedagogy (9.2)**. Notably, the **cost-optimized**
Opus configuration matched the deep-reasoning flagship (9.1 vs 9.0) — strong
tutoring quality does **not** require the most expensive setting.

### Consistency across languages (overall /10)

| Engine | 🇧🇭 Arabic | 🇬🇧 English | 🔀 Bilingual |
|---|:--:|:--:|:--:|
| Opus 4.8 (cost-optimized) | 9.1 | 9.1 | 9.1 |
| Opus 4.8 (flagship) | 9.1 | 8.9 | 8.9 |
| Sonnet 5 | 8.6 | 8.5 | 7.5 |
| Haiku 4.5 | 7.0 | 7.9 | 5.4 |

The top engine holds **9.1/10 in all three language modes** — the hardest bar for an
Arabic-first product is staying equally strong in Arabic, English, *and* code-switching.
Smaller models degrade most on **bilingual** answers (term-pairing is hard).

### The native Arabic teacher's verdict (T1, /10)

| Opus 4.8 (cost-opt) | Opus 4.8 (flagship) | Sonnet 5 | Haiku 4.5 |
|:--:|:--:|:--:|:--:|
| **9.1** | 9.0 | 8.5 | 7.1 |

The grader who matters most for an Arabic-native student rated the top engine **9.1/10**,
repeatedly praising *"natural, warm Bahraini Arabic,"* correct English-term pairing, and
accurate MoE unit sourcing.

---

## What the graders said (verbatim excerpts)

> **"دقيقة تماماً… لهجة بحرينية طبيعية دافئة، توثيق بكود الوحدة moe.g10.physics.u1"**
> — Native Arabic teacher (T1)

> "All computing answers correctly derive a = F/m = 20/4 = 5 m/s². The strongest is
> complete, warm, rigorous, **exact sourcing, best bilingual term-pairing.**"
> — Bilingual teacher (T5)

> "It uniquely and explicitly **corrects the core misconception** (force produces
> acceleration, not speed directly), scaffolds intuition-before-numbers."
> — Physics subject expert (T2)

> "The best-balanced package: intuition-before-numbers scaffold, clean worked steps,
> the memorable F=m×a triangle exam trick, natural Bahraini-flavoured Arabic, and the
> **correct MoE unit citation.**" — MoE curriculum & exam specialist (T3)

> "A and B are both excellent… A edges ahead for its **standout honesty note about
> deliberately deferring out-of-scope topics to stay within the student's unit.**"
> — Native Arabic teacher (T1), on the bilingual chemistry question

The panel independently **verified the underlying work** — e.g. `mgh = 98 J` and
`v ≈ 9.9 m/s` (energy), projectile range `R = 35.3 m`, and `2 mol → 1.2044×10²⁴`
molecules — confirming the top answers were scientifically correct, not just fluent.

---

## Sample graded answers

### 1. Arabic · Grade 10 Physics — Newton's second law (scored 9.6/10)
> **نورة asked:** «ليش الجسم يزيد سرعته لما تزيد القوة؟ وكيف أحسب التسارع إذا القوة ٢٠ نيوتن والكتلة ٤ كيلوغرام؟»

Faheem answered with an intuition-first analogy (a supermarket trolley), the law
`a = F/m`, a full worked solution to **5 m/s²**, an exam-time memory trick, and an exact
MoE unit citation — closing with *"ما زال غير واضح؟"* (still unclear?).

### 2. English · Grade 10 Physics — why ships float (scored 9.1/10)
> **Ali asked:** "Why do huge metal ships float but a small iron nail sinks?"

Answered in English with Archimedes' principle and **average density** (`ρ = m/V`),
contrasting iron (≈7,850 kg/m³) with a hollow hull, pairing key terms in Arabic
(الطفو، الكثافة) for a Bahraini learner.

### 3. Bilingual · Grade 10 Physics — refraction (scored 9.0/10)
> **ليلى asked:** «ليش ينكسر الضوء لما يدخل الماء؟ يعني الـ refraction — اشرحها لي بالعربي بس خلّي المصطلحات بالإنجليزي.»

Explained refraction in Arabic while keeping every technical term in English, with a
runner-on-sand analogy, a clean **Arabic↔English term table**, and the exact source
*(moe.g10.physics.u5)*.

*(Full answers and all 250 gradings are in [`docs/eval/raw-results.json`](docs/eval/raw-results.json).)*

---

## Limitations & next steps

1. **Simulated participants.** Personas and graders are AI, not real students/teachers.
   The clear next step is a **pilot with real Grade-10 Physics students and 3–5 real
   Bahraini teachers** using the same rubric.
2. **Model, not full pipeline.** Answers came from the models on-spec; the production
   backend adds real corpus RAG + deterministic verification, which this test does not
   exercise. A follow-up should evaluate the **deployed** system end-to-end.
3. **Fable 5 incomplete.** One candidate could not run; re-run once its quota resets, or
   swap in the production Gemini engine for a like-for-like comparison.
4. **Single question per student.** A fuller study would use several questions per unit,
   including deliberate out-of-syllabus probes to stress-test the grounding gate.

**Reproducibility:** 10 students × 5 models × 5 teachers = 250 gradings, blind and
order-rotated. Raw inputs, answers, and per-dimension scores: `docs/eval/raw-results.json`.
