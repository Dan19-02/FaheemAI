# Deploying Faheem to Render

This repo ships a [`render.yaml`](./render.yaml) **Blueprint** that provisions the
entire stack — database, API, and web app — in one step.

```
                         ┌──────────────────────────┐
   Student's browser ───▶│  faheem-frontend (static) │   React 19 + Vite SPA, on Render's CDN
                         └────────────┬─────────────┘
                                      │  VITE_API_URL (https, baked at build time)
                                      ▼
                         ┌──────────────────────────┐
                         │  faheem-backend (node)    │   Express + WebSocket API, binds 0.0.0.0:$PORT
                         └────────────┬─────────────┘
                                      │  DATABASE_URL (SSL)
                                      ▼
                         ┌──────────────────────────┐
                         │  faheem-db (PostgreSQL)   │   users, curriculum, corpus + embeddings
                         └──────────────────────────┘

   External: Google Gemini API (generation + embeddings) · Google Identity (optional sign-in)
```

Everything durable lives in **Postgres** — the web service writes nothing to local
disk, so **no persistent disk is needed**. The one hard requirement is a real
`DATABASE_URL`; without it the backend falls back to an in-memory DB that resets on
every restart.

---

## 1. One-click Blueprint deploy

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Dan19-02/FaheemAI)

Or manually:

1. Push this repo to GitHub (already done if you're reading this there).
2. In the [Render dashboard](https://dashboard.render.com/) → **New → Blueprint**.
3. Connect the **FaheemAI** repo. Render detects `render.yaml` and shows the three
   resources it will create. Click **Apply**.
4. Render provisions `faheem-db`, then builds `faheem-backend` and `faheem-frontend`.

## 2. Set the required secret (and optional ones)

`render.yaml` marks a few values `sync: false` — Render will **not** deploy the
backend until you supply the required one. In **faheem-backend → Environment**:

| Variable            | Required?   | What to put                                                        |
| ------------------- | ----------- | ------------------------------------------------------------------ |
| `GEMINI_API_KEY`    | **Yes**     | Your [Google Gemini API key](https://aistudio.google.com/apikey). Without it, generation, embeddings, and RAG are all disabled. |
| `GOOGLE_CLIENT_ID`  | Optional    | Google OAuth client id — only if you want "Continue with Google".  |
| `JWT_SECRET`        | Auto        | Generated for you by Render (`generateValue: true`). Don't touch.  |
| `DATABASE_URL`      | Auto        | Wired from `faheem-db`. Don't touch.                               |

If you enabled Google sign-in, also set **`VITE_GOOGLE_CLIENT_ID`** (same value) on
**faheem-frontend** and redeploy it (it's baked in at build time).

## 3. Confirm the two service URLs match

The blueprint hardcodes the expected Render URLs so the first deploy just works.
Both plain names were already taken globally, so Render suffixed ours — the ACTUAL
deployed URLs are:

- `faheem-backend`  → `https://faheem-backend-t2oh.onrender.com`
- `faheem-frontend` → `https://faheem-frontend-vqjw.onrender.com`

**If Render appended a suffix** (because a service name was already taken globally),
the two cross-references will be wrong. Fix them:

- On **faheem-frontend**, set `VITE_API_URL` to the **actual** backend URL, then
  **Clear build cache & deploy** (Vite bakes this in at build time).
- On **faheem-backend**, set `CORS_ORIGIN` to the **actual** frontend URL, then
  redeploy. (This is what the browser sends as the `Origin` header; it must match
  exactly, scheme included.)

You can verify the backend is healthy any time:

```bash
curl https://faheem-backend-t2oh.onrender.com/api/health
# {"ok":true,"db":"postgres"}     <- "db":"memory" means DATABASE_URL isn't wired
```

## 4. Seed the curriculum (data, not code)

On boot the backend embeds a small built-in seed corpus (enough for the app to
answer), so a fresh deploy is functional. The **full** Bahrain MoE / NCERT corpus is
**not** in this repo — the source PDFs are licensed and gitignored
(`backend/corpus-source/`). To load the full curriculum into your Render Postgres,
run the offline seed **from your machine** against the deployed DB:

```bash
cd backend
# put the licensed PDFs in backend/corpus-source/ first
DATABASE_URL="<your Render external DATABASE_URL>" npm run seed:curriculum
```

Grab the **External Database URL** from `faheem-db` → **Info** in the dashboard.

---

## Free-tier caveats (read before you rely on it)

- **Cold starts** — free web services sleep after ~15 min idle; the first request
  after that takes ~30–60s while it wakes. Upgrade the backend to a paid instance
  to keep it warm.
- **Free Postgres expires** — Render deletes free databases after ~30 days. For
  anything real, change `faheem-db` to a paid plan (or point `DATABASE_URL` at an
  external Postgres like Neon/Supabase).
- **`VITE_API_URL` is build-time** — changing it always needs a frontend rebuild,
  never just a restart.

## Environment variables — full reference

All backend variables have safe defaults except where noted; only `GEMINI_API_KEY`
is practically required. See [`backend/.env.example`](./backend/.env.example) and
[`frontend/.env.example`](./frontend/.env.example) for the complete annotated list
(AI model names, timeouts, circuit-breaker thresholds, retrieval-gate tuning, etc.).

| Service  | Variable              | Default / source            | Notes                                             |
| -------- | --------------------- | --------------------------- | ------------------------------------------------- |
| backend  | `DATABASE_URL`        | from `faheem-db`            | Postgres; SSL auto-enabled for managed hosts.     |
| backend  | `JWT_SECRET`          | Render-generated            | HMAC secret for auth tokens.                      |
| backend  | `GEMINI_API_KEY`      | **you set it**              | Google Gemini — generation + embeddings.          |
| backend  | `GOOGLE_CLIENT_ID`    | unset → Google login off    | Verifies Google ID tokens.                        |
| backend  | `CORS_ORIGIN`         | frontend URL                | Exact-match allowlist (comma-separated).          |
| backend  | `PORT`                | injected by Render          | Server binds `0.0.0.0:$PORT`.                     |
| frontend | `VITE_API_URL`        | backend URL                 | Baked in at build; scheme + no trailing slash.    |
| frontend | `VITE_GOOGLE_CLIENT_ID` | unset → Google button off | Same value as backend `GOOGLE_CLIENT_ID`.         |

## Deploying without the Blueprint (manual)

Prefer to click through the dashboard? Create three resources by hand:

1. **PostgreSQL** — name `faheem-db`, region Frankfurt.
2. **Web Service** (Node) — root dir `backend`, build `npm install && npm run build`,
   start `npm start`, health check `/api/health`, and the backend env vars above.
3. **Static Site** — root dir `frontend`, build `npm install && npm run build`,
   publish dir `dist`, add a Rewrite rule `/*` → `/index.html`, and the frontend
   env vars above.
