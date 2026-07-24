# Deferred work

A running log of things we deliberately left for later. Whenever we ship a fix
that leaves a known gap, take a shortcut, or spot something that should change
but is out of scope right now, add it here with enough context to act on later.

Format per item: what, why deferred, where in the code, and the fuller fix.
Newest at the top. Check items off when done (keep the line, mark it `[x]`).

---

## Referral codes (2026-07-16)

Shipped: partner referral codes (see `REFERRALS.md`): `referral_codes` table +
`users.referral_code`, atomic claim/release, signup + Google attribution, the
`x-admin-token` admin API (reuses ADMIN_GRANT_TOKEN, one operator secret),
`?ref=` capture + signup-form field. Known gaps:

- **[ ] Admin API brute-force brake is in-memory.** `requireAdmin`
  (`referral.ts`) rate-limits by IP via the in-process `rateLimit` bucket, so a
  restart or a second instance resets it. Same standing gap as the login
  limiter (see Redis item below); fold the admin token into the Redis limiter
  when that lands. The token itself is compared timing-safe over sha256, so
  guessing a long random token is impractical either way.
- **[ ] No admin UI.** Codes are managed with curl (examples in
  `REFERRALS.md`). If partners multiply, a tiny internal dashboard (list +
  create + pause + per-code people table) is the fuller fix.
- **[ ] Attribution is signup-time only.** A student who signs up bare and
  SHOULD have carried a partner's code cannot be attributed later except by
  SQL. A "set referral on an existing user" admin endpoint is the fuller fix
  if partners start disputing counts.
- **[ ] Google-path claim is best-effort by design.** When a capped code's
  last slot is taken between the claim and a concurrent Google signup, the
  later student is created unattributed (never blocked). Documented in
  `REFERRALS.md`; revisit only if partners get per-head payouts, in which case
  the email path's claim-then-create should be ported to the Google path with
  a pre-check + user-visible error instead of silence.
- **[ ] Claim + user insert are not one transaction.** (2026-07-16 review
  find.) The claim, the insert, and the compensating release are separate
  autocommit statements (`auth.ts` signup, `db.ts` findOrCreateGoogleUser). A
  dropped connection between claim and insert usually also kills the release,
  leaving use_count one above the true count forever, silently shrinking a
  capped partner's slots (reporting is unaffected: it counts
  users.referral_code). Failures are at least logged now. Fuller fix: run
  claim+insert inside withTransaction on real Postgres (pg-mem ignores BEGIN,
  same caveat as billing grantPass), or a periodic reconcile of use_count
  from the attributed-user count.
- **[ ] Capped codes can be drained by scripted junk signups.** (2026-07-16
  review find.) Signup is instant with a soft email gate, so a rival with a
  partner's public code and ~15 signups/min/IP can exhaust a max_uses cap
  with throwaway emails. Mitigation shipped: stats now carry verifiedCount
  (and per-person emailVerified) so junk is visible and the pause/PATCH lever
  works. Fuller fix if it ever happens: claim the use at email verification
  instead of signup, or CAPTCHA the signup route (product decision: adds
  friction for real students on shared phones).

## Launch readiness (before ~1000 users)

From a 2026-07-14 read-only audit (rate limiting, secrets, observability, data
safety, HTTP/auth). The good news: the correctness core is solid, money and
quota writes are atomic and transactional, all SQL is parameterized, every
sensitive route is behind requireAuth, OTP is DB-backed / peppered / constant
time, helmet is on, body caps are tiered, the migration ADD-COLUMN backfill
trap is handled, and client errors never leak stack traces. The gaps below are
OPERATIONAL, not feature work.

### Blockers (do before real traffic)
> All three DONE 2026-07-14 (fixed + verified: typecheck, tests, live prod-boot refusal). Kept below for the record.

- **[x] Crash resilience: unguarded emitters + no process safety net.** The pg
  Pool has no `error` listener (`db.ts:74`), the voice WebSocket has `message`
  and `close` but no `error` listener (`ai.ts:1549,1591`), and there is no
  `process.on('unhandledRejection'|'uncaughtException')` anywhere. A routine idle
  Postgres connection drop (managed PG reaps these) or a student losing signal
  mid voice call emits an unhandled `error` and **kills the whole process**,
  dropping every user. Fix: add `pool.on('error', ...)` after the pool is
  assigned, `clientWs.on('error', ...)` in the WS handler, and the two
  `process.on(...)` logging guards in `index.ts`. ~10 lines, biggest stability win.
- **[x] `trust proxy` is unset, so all IP rate limits collapse to one bucket.**
  No `app.set('trust proxy', ...)` (`index.ts`). Behind Render's proxy every
  request's `req.ip` is the proxy, so `signup:ip` (15/min), `login:ip` (20/min),
  `forgot:ip`, `reset:ip` are shared across the ENTIRE userbase. At 1000 users
  that is a launch-day wall (the 21st login/min anywhere gets 429'd) AND per-IP
  abuse protection is nullified. Fix: `app.set('trust proxy', 1)` before the
  routers (hop count 1, not `true`, so clients can't spoof XFF).
- **[x] Config fails open, not closed, in production.** Critical secrets read at
  import with an insecure fallback and only a `console.warn`, so a misconfigured
  deploy boots green: `JWT_SECRET || "dev-insecure-secret-change-me"` (`auth.ts:62`,
  forgeable tokens for any user), unset `DATABASE_URL` silently loads pg-mem and
  **loses every account and payment on restart** (`db.ts:106-116`), and
  `OTP_PEPPER` chains to the same literal (`otp.ts:24`). Fix: in production, boot
  a config check that `process.exit(1)` if `JWT_SECRET`/`DATABASE_URL` are unset
  or defaulted, and restrict the pg-mem fallback to non-production.

### High (before launch or same week)
- **[ ] Postgres TLS runs `rejectUnauthorized: false`** (`db.ts:76`): encrypted
  but the server cert is never verified, so the link carrying minors' PII,
  bcrypt hashes, and the payments table is MITM-able. Fix: support a
  `PG_CA_CERT`/`PGSSLROOTCERT` path and use `{ ca, rejectUnauthorized: true }`
  for managed PG (Neon/Supabase/Render publish their CA).
- **[ ] No error monitoring and no global Express error handler.** All errors go
  to `console.error` on ephemeral stdout (no Sentry/APM), and there is no 4-arg
  error middleware, so with `NODE_ENV` unset (the default) Express leaks full
  stack traces to clients on a bad body/CORS reject. Fix: add Sentry init +
  `captureException`, a terminal error handler returning a generic message, and
  set/document `NODE_ENV=production`.
- **[ ] Live-voice WebSocket is unmetered with no session cap** (`ai.ts:1529+`):
  realtime audio (the most expensive op) has no `rateLimit`, no metering, and no
  per-user concurrent-session limit. Fix: gate `start` with a rate limit, one
  live session per user, and a max duration / idle timeout.
- **[ ] No DB backup or restore drill.** No `pg_dump`/PITR script or doc anywhere;
  data safety rests on the provider's unverified defaults. Fix: confirm and
  document provider PITR, add a nightly off-box `pg_dump` of users/payments/
  notebook, and rehearse a restore once so RTO/RPO is known.
- **[ ] Rate limiter is in-memory (no Redis)** (`ai.ts:302`): resets on deploy,
  per-instance if scaled, and unbounded key growth (`login:email:*` is
  attacker-controlled, no eviction). The founder's own top prod item. Fix: move
  buckets to Redis with TTL eviction; at minimum add a periodic sweep + size cap.

### Medium (soon after)
- **[ ] Free AI routes have no cost ceiling:** `/tts` has no text-length cap and
  is unmetered (`ai.ts:1487`), `/chat/verify` (Deep-check) is unmetered
  (`ai.ts:1310`). Both lean only on the resettable in-memory limiter. Cap text
  length and tighten/meter these.
- **[ ] Pool has no `max`/`statement_timeout`/`query_timeout`/idle tuning**
  (`db.ts:74`): one hung query can exhaust the default 10 connections and stall
  everything. Set explicit values sized to the DB plan.
- **[ ] `runMigrations` swallows ALL errors and has no versioning/lock**
  (`db.ts:458`): a genuinely failed migration is silent, and a rolling deploy
  runs concurrent `ALTER TABLE`. Narrow the catch to duplicate-* errors, re-throw
  the rest, and wrap in `pg_advisory_lock`.
- **[ ] CORS defaults to `*`** when `CORS_ORIGIN` is unset (`index.ts:31`). Auth is
  a Bearer header (not cookies) so it is not a CSRF hole, but make the default
  fail closed. Set the real origins in prod.
- **[ ] `/api/health` is static + leaky:** reports the startup DB mode, not a live
  `SELECT 1`, so it stays green during a DB outage; and it returns raw
  `mail.lastError` publicly. Make it ping the DB (503 on fail) and hide internal
  detail. Also add AI-key presence to it.
- **[ ] `.env.example` is missing vars the code reads** (`NODE_ENV`, `PGSSL`,
  `KIMI_*`, `ANSWER_BACKEND`, `PG_CA_CERT`). An operator can't discover them.
- **[ ] Login leaks account type** ("This account uses Google sign in",
  `auth.ts:254`) and signup 409s on existing email, both enumeration oracles.
  Low-ish; forgot-password is already enumeration-safe as the pattern to copy.
- Nits: pin JWT `algorithms:['HS256']` (`auth.ts:88,134`); WS token is in the URL
  query and skips token_version (`ai.ts:1539`); password min length is 6.

## Open

### [ ] Server-side answer persistence / resumable generation
- **What:** When a student refreshes or navigates away mid-generation, the answer
  they were watching is lost. Today we only refund the credit (see below), so
  they are not charged, but they still have to ask again.
- **Why deferred:** The nicer behavior (the answer keeps generating server-side,
  is saved, and simply appears on reload) needs server-side message persistence,
  which does not exist yet. Answers are currently persisted only by the client in
  `finalize()` (`frontend/src/App.tsx`), never by the server. That is a real
  change (save the assistant message in the DB from the route, reconcile message
  ids with the client) and was out of scope for the immediate fix.
- **Where:** `backend/src/ai.ts` `/chat` and `/chat/stream`; would add a
  server-side save + a client reconciliation on load.
- **Fix:** Generate to completion server-side even after the client disconnects,
  persist the assistant message, and have the reloaded client show it. Then the
  refund-on-disconnect becomes a fallback for the truly-lost case only.

### [ ] Hide the new-doubt classifier latency on typed follow-ups
- **What:** The per-doubt charge gate runs a ~1.3s Gemini Flash classification
  before the answer starts, on every typed mid-thread message (both free
  follow-ups and new doubts). It adds a noticeable pre-roll to the follow-up
  loop, which is the product's heart.
- **Why deferred:** The immediate metering fix chose the simple, correct,
  synchronous gate. Hiding the latency needs a two-branch flow.
- **Where:** `backend/src/ai.ts` `isNewDoubt` / `decideIsNewQuestion`, called at
  both charge gates.
- **Fix:** For students with quota headroom (remaining > 1 or unlimited), start
  generating immediately and run the classifier concurrently, then settle the
  charge after the answer. Only block synchronously on the classifier when they
  are on their last credit (remaining <= 1).

### [ ] Image-only mid-thread messages are never charged
- **What:** A bare image upload mid-thread with no text is treated as a free
  follow-up, so a new problem photo dropped into an existing chat does not cost a
  credit.
- **Why deferred:** Trust-first choice. The reported leak was typed topics, and a
  clearer re-upload of the same problem must not be wrongly charged. The
  classifier is text-based, so a no-text turn has nothing to classify.
- **Where:** `backend/src/ai.ts` `decideIsNewQuestion` (the `!hasText` branch).
- **Fix:** If this becomes a real leak, treat a fresh image mid-thread as a new
  doubt, or add a lightweight vision check to tell a new problem from a re-upload.

### [ ] Preview harness: new-chat doesn't reliably reach the empty state
- **What:** In `frontend/src/previewMock.ts` (`?preview=1`), clicking "New chat"
  often keeps the seeded conversation on screen instead of switching to the
  fresh empty thread, and console logs come through doubled. Dev-only, but it
  made end-to-end verification of the empty state fiddly.
- **Why deferred:** It is a dev-tooling quirk, not a production bug; the real
  app (real backend, no StrictMode double-invoke of the mock) switches fine.
- **Where:** `frontend/src/previewMock.ts`, and the new-chat / load effects in
  `frontend/src/App.tsx`.
- **Fix:** Check whether the preview double-invokes mount (StrictMode vs a real
  second root), and make `createConversation` + the seeded conversation list
  cooperate so a new chat lands on an empty thread deterministically.

### [ ] Stream keeps running after the client leaves
- **What:** On a mid-stream disconnect the credit is now refunded, but the
  underlying model stream (Kimi / Gemini) keeps being awaited until it yields the
  next chunk or errors. Wasted compute if the model stalls.
- **Why deferred:** Not a correctness or billing issue; the refund and the
  `res.destroyed` loop break already handle the money and the response.
- **Where:** `backend/src/ai.ts` `/chat/stream` generation loop.
- **Fix:** Propagate an `AbortSignal` (from res "close") into `kimiStream` /
  `streamGemini` so generation stops promptly when the student leaves.

---

## Done
