# Partner referral codes

Track which signups came through codes we hand to partners (financial
institutes, schools, creators). A student either types the code into the
optional "Referral code" field on the signup card, or arrives through a
partner link like:

```
https://faheem.ai/?ref=FHM-7WQ2M
```

The frontend captures `?ref=` once at page load (into localStorage, so it
survives browsing the landing page) and prefills the signup form. The account
row is stamped with the code in `users.referral_code` at creation time, so
attribution is permanent and queryable.

## Attribution rules

- **Email signup**: a supplied code must be real. A typo returns a warm 400
  before the account is created, so the student can fix it or clear the field.
  The claim is atomic (`active` + `max_uses` are enforced inside one UPDATE),
  and a claim is released again if the account insert fails.
- **Google signup**: best-effort, create-only. A valid code attributes the new
  account; an invalid or exhausted code is dropped silently (never blocks a
  sign-in). Returning students are never re-attributed; `/auth/google` returns
  `created` so the app only forgets a captured link code after a real signup
  (a returning sign-in on a shared phone leaves it for the next new student).
- Codes are normalized before every comparison: trimmed, uppercased, spaces
  and underscores become dashes. `clfy 7wq2m` matches `FHM-7WQ2M`.

## Setting up

The admin API is guarded by the same curl-only operator secret as billing's
admin grant: `ADMIN_GRANT_TOKEN` (already set in production for comped
passes). Without it, every `/api/admin/referral-codes` route answers 503 and
the rest of the system works normally. One operator secret, not two.

## Admin API

All admin calls send the token in the `x-admin-token` header (same header as
`/api/billing/admin/grant`). Base URL is your backend origin.

Create a code for a partner (omit `code` to get a generated `FHM-XXXXX`):

```bash
curl -s -X POST "$BASE/api/admin/referral-codes" \
  -H "x-admin-token: $ADMIN_GRANT_TOKEN" -H "content-type: application/json" \
  -d '{"partnerName": "HDFC Vashi branch", "notes": "pilot batch", "maxUses": 500}'
```

List every code with live counts (`signupCount` = accounts attributed,
`verifiedCount` = of those, how many proved their email, so scripted junk
signups stand out, `paidCount` = how many ever bought a pass):

```bash
curl -s "$BASE/api/admin/referral-codes" -H "x-admin-token: $ADMIN_GRANT_TOKEN"
```

One code in depth, including the people who used it (name, email, board,
grade, plan, paid yes/no, signup date):

```bash
curl -s "$BASE/api/admin/referral-codes/FHM-7WQ2M" -H "x-admin-token: $ADMIN_GRANT_TOKEN"
```

Pause a code (or edit partnerName / notes / maxUses; `"maxUses": null` clears
the cap):

```bash
curl -s -X PATCH "$BASE/api/admin/referral-codes/FHM-7WQ2M" \
  -H "x-admin-token: $ADMIN_GRANT_TOKEN" -H "content-type: application/json" \
  -d '{"active": false}'
```

## Notes

- `use_count` on a code exists only to enforce `max_uses` atomically at claim
  time. Reporting always counts `users.referral_code` (the source of truth).
- The public `GET /api/referral/check?code=X` endpoint powers the signup
  form's inline feedback. It answers only `{ valid }` and never reveals which
  partner a code belongs to.
- Tests: `npm run test:referral`.
