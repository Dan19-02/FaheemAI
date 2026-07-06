# Fahim

Arabic-first, RTL, mobile-first AI tutor grounded in Bahrain's Ministry of Education (MoE)
national curriculum (grades 7–12), student-facing only. **Accuracy is the product**: every
explanation is grounded in real MoE curriculum, verified before it is shown, and sourced.

Forked from the Clarify.AI shell (React 19 + Vite + Tailwind backend/frontend). This repo
is being built per the v2 PRD and the approved implementation plan (Grade 10 Physics pilot,
full-production build).

## Structure

```
backend/    Express + PostgreSQL + JWT API (auth, chat, notebook). AI behind a provider adapter.
frontend/   React 19 + Vite + Tailwind. RTL/Arabic-first, KaTeX math, mobile-first.
```

## Stack

- **Frontend:** React 19 + Vite + Tailwind v4. Markdown + KaTeX (bidi-isolated for RTL) + Mermaid.
- **Backend:** Express + PostgreSQL (pg-mem dev fallback) + JWT (email/password + Google).
- **AI:** provider-agnostic adapter (default Gemini for the prototype; the Arabic quality
  bake-off, PRD §10, decides the production model). Every external call is wrapped with a
  hard timeout, backoff+jitter retries, and a circuit breaker.

## Run locally (dev)

```bash
# backend
cd backend && npm install && cp .env.example .env   # fill in GEMINI_API_KEY, JWT_SECRET, GOOGLE_CLIENT_ID
npm run dev                                          # uses in-memory DB if DATABASE_URL unset

# frontend
cd frontend && npm install && npm run dev
```

## Accuracy engine (in progress)

- **Grounding:** unit-scoped RAG over the real MoE corpus, hard-filtered by a stable `unit_id`.
  Out-of-syllabus queries are **flagged**, never answered from general model knowledge.
- **Verification (Type A):** the worked solution is checked deterministically **before display**
  (no unverified draft is ever streamed).
- **Sourcing:** every answer shows its unit + section and a confidence/flag marker.
- **Launch surface = subjects that passed their validation gate** (a data + review step,
  driven by `curriculum_subjects.gate_status`, not a code deploy).

Billing is dormant in v2 (no monetization).
