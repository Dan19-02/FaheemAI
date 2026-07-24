# Faheem (فهيم) — the patient AI tutor for Gulf classrooms

Faheem, Arabic for "the one who understands", is an AI tutor for students in
grades 6-12 across the GCC. It explains what school rushed past, re-teaches a
different way each time until it truly lands, verifies every answer with a
second examiner pass, and only counts a concept as understood after the
student proves it again on a later day.

**Languages:** English, Arabic, Hindi, Urdu (technical terms stay in English).
**Curricula:** Cambridge (CAIE), Pearson Edexcel, IB, American (US), CBSE,
ICSE/ISC, French (AEFE), SABIS, plus the ministry curricula of the UAE,
Saudi Arabia, Qatar, Kuwait, Bahrain, and Oman — backed by a verified
topic-level syllabus corpus (`backend/src/data/syllabusCorpus.ts`).

## Stack

- `frontend/` — React + Vite + Tailwind v4. The public landing site and the
  signed-in study workspace (chat, re-explain ladder, photo doubts, pre-exam
  notebook, honest mastery tracking).
- `backend/` — Express + Postgres (pg-mem fallback for dev). Kimi (Moonshot)
  is the answer brain; Gemini serves image vision, embeddings/RAG, and
  fallback. One-time monthly passes in USD via the payments provider.

## Run locally

```bash
# backend (copy backend/.env.example to backend/.env and fill keys first)
cd backend && npm install && npm run dev   # http://localhost:4000

# frontend
cd frontend && npm install && npm run dev  # http://localhost:3000 (proxies /api)
```

Without a reachable Postgres the backend runs an in-memory dev database
(data resets on restart, syllabus corpus ingestion skipped). Create the real
database (`createdb faheem`) to get persistence and the full RAG corpus.

Backend smoke tests: `npm run test:subscription | test:db | test:otp | test:referral`.

## Regenerating the syllabus corpus

Update `backend/scripts/data/GCC_Boards_Topic_Level_Syllabus_v2_VERIFIED.xlsx`,
then:

```bash
cd backend && python3 scripts/parse_syllabus.py
```

The next boot against real Postgres tops up only the new chunks.
