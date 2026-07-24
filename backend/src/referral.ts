/**
 * Partner referral codes.
 *
 * We hand codes to partners (financial institutes, schools, creators); a
 * student enters one at signup (or arrives via ?ref=CODE) and the account is
 * stamped with it, so every partner's signups and paid conversions are
 * countable later.
 *
 * Two surfaces live here:
 *  - GET /referral/check: public, rate-limited, answers only "would this code
 *    be accepted right now" so the signup form can validate inline. It never
 *    reveals the partner behind a code.
 *  - /admin/referral-codes: create/list/inspect/update codes. Guarded by the
 *    shared operator guard (adminAuth.ts requireAdmin): the same
 *    ADMIN_GRANT_TOKEN + x-admin-token header as billing's admin grant.
 *    One operator secret, one guard, not two.
 */
import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { rateLimit } from "./ai.js";
import { requireAdmin } from "./adminAuth.js";
import {
  pool,
  createReferralCode,
  getReferralCode,
  updateReferralCode,
  redeemReferralCode,
  listReferralCodeStats,
  referralSignups,
} from "./db.js";

/** Uppercase letters, digits, and inner dashes; 3 to 32 chars. */
const CODE_RE = /^[A-Z0-9][A-Z0-9-]{1,30}[A-Z0-9]$/;

/**
 * One canonical spelling per code: trimmed, uppercase, and inner runs of
 * spaces or underscores become a single dash, so "clfy 7wq2m" and
 * " FHM_7WQ2M " both match the stored "FHM-7WQ2M". Codes are printed and
 * read aloud; the separator is the part people mis-transcribe.
 */
export function normalizeReferralCode(raw: unknown): string {
  return String(raw ?? "")
    .trim()
    .toUpperCase()
    .replace(/[\s_]+/g, "-");
}

export function isValidReferralCodeFormat(code: string): boolean {
  return CODE_RE.test(code);
}

// No 0/O/1/I/L: partners read these codes out loud and print them on paper.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

/** A fresh random code like FHM-7WQ2M (5 chars = ~28 bits, plenty here). */
export function generateReferralCode(): string {
  let suffix = "";
  for (let i = 0; i < 5; i++) suffix += CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)];
  return `FHM-${suffix}`;
}

export const referralRouter = Router();

// --- Public: would this code be accepted right now? ---
// Used by the signup form for inline feedback. Read-only (no claim happens
// here) and deliberately terse: { valid } only, never the partner's name.
referralRouter.get("/referral/check", async (req: Request, res: Response) => {
  try {
    if (!rateLimit(`refcheck:ip:${req.ip}`, 30)) {
      return res.status(429).json({ error: "One moment, then try again." });
    }
    const code = normalizeReferralCode(req.query.code);
    if (!isValidReferralCodeFormat(code)) return res.json({ valid: false });
    const row = await getReferralCode(pool, code);
    const open = !!row && row.active === true && (row.max_uses == null || Number(row.use_count) < Number(row.max_uses));
    res.json({ valid: open });
  } catch (err) {
    console.error("referral check error:", err);
    res.status(500).json({ error: "Could not check that code right now." });
  }
});

// --- Admin: create a code for a partner ---
// Body: { partnerName, code?, notes?, maxUses? }. Omitting code generates one.
referralRouter.post("/admin/referral-codes", requireAdmin, async (req: Request, res: Response) => {
  try {
    const b = req.body || {};
    const partnerName = String(b.partnerName || "").trim();
    if (!partnerName) return res.status(400).json({ error: "partnerName is required." });

    const explicit = b.code !== undefined && b.code !== null && String(b.code).trim() !== "";
    const code = explicit ? normalizeReferralCode(b.code) : generateReferralCode();
    if (!isValidReferralCodeFormat(code)) {
      return res.status(400).json({ error: "Codes are 3-32 letters, digits, and dashes." });
    }
    let maxUses: number | null = null;
    if (b.maxUses !== undefined && b.maxUses !== null) {
      maxUses = Number(b.maxUses);
      if (!Number.isInteger(maxUses) || maxUses < 1) {
        return res.status(400).json({ error: "maxUses must be a positive integer (or omitted for unlimited)." });
      }
    }
    const row = await createReferralCode(pool, {
      code,
      partnerName,
      notes: String(b.notes || "").trim(),
      maxUses,
    });
    res.status(201).json({ code: row.code, partnerName: row.partner_name, notes: row.notes, active: row.active === true, maxUses: row.max_uses ?? null });
  } catch (err: any) {
    if (err?.code === "23505") return res.status(409).json({ error: "That code already exists." });
    console.error("referral create error:", err);
    res.status(500).json({ error: "Could not create the code." });
  }
});

// --- Admin: every code with signup + paid counts ---
referralRouter.get("/admin/referral-codes", requireAdmin, async (_req: Request, res: Response) => {
  try {
    res.json({ codes: await listReferralCodeStats(pool) });
  } catch (err) {
    console.error("referral list error:", err);
    res.status(500).json({ error: "Could not load referral codes." });
  }
});

// --- Admin: one code in depth, including the people who used it ---
referralRouter.get("/admin/referral-codes/:code", requireAdmin, async (req: Request, res: Response) => {
  try {
    const code = normalizeReferralCode(req.params.code);
    const row = await getReferralCode(pool, code);
    if (!row) return res.status(404).json({ error: "No such code." });
    const signups = await referralSignups(pool, code);
    res.json({
      code: row.code,
      partnerName: row.partner_name,
      notes: row.notes || "",
      active: row.active === true,
      maxUses: row.max_uses ?? null,
      useCount: Number(row.use_count || 0),
      signupCount: signups.length,
      paidCount: signups.filter((s) => s.hasPaid).length,
      signups,
    });
  } catch (err) {
    console.error("referral detail error:", err);
    res.status(500).json({ error: "Could not load that code." });
  }
});

// --- Admin: edit a code (rename partner, pause, cap, annotate) ---
// Body: any of { partnerName, notes, active, maxUses } (maxUses: null clears).
referralRouter.patch("/admin/referral-codes/:code", requireAdmin, async (req: Request, res: Response) => {
  try {
    const code = normalizeReferralCode(req.params.code);
    if (!(await getReferralCode(pool, code))) return res.status(404).json({ error: "No such code." });
    const b = req.body || {};
    const patch: any = {};
    if (b.partnerName !== undefined) {
      const name = String(b.partnerName).trim();
      if (!name) return res.status(400).json({ error: "partnerName cannot be empty." });
      patch.partnerName = name;
    }
    if (b.notes !== undefined) patch.notes = String(b.notes);
    if (b.active !== undefined) patch.active = b.active === true;
    if (b.maxUses !== undefined) {
      if (b.maxUses === null) patch.maxUses = null;
      else {
        const n = Number(b.maxUses);
        if (!Number.isInteger(n) || n < 1) return res.status(400).json({ error: "maxUses must be a positive integer or null." });
        patch.maxUses = n;
      }
    }
    const row = await updateReferralCode(pool, code, patch);
    res.json({ code: row.code, partnerName: row.partner_name, notes: row.notes || "", active: row.active === true, maxUses: row.max_uses ?? null, useCount: Number(row.use_count || 0) });
  } catch (err) {
    console.error("referral update error:", err);
    res.status(500).json({ error: "Could not update the code." });
  }
});

/** Flat shape (not a discriminated union): the project runs with strict:false,
 *  where union narrowing on `ok` is unreliable (same pattern as VerifyOutcome). */
export interface ReferralClaim {
  ok: boolean;
  /** Set on ok: the claimed code, or null when no code was supplied. */
  code?: string | null;
  /** Set on !ok: the warm message to show the student. */
  error?: string;
}

/**
 * Claim a code for an email/password signup. Called by auth.ts BEFORE the
 * account insert so a typo'd code becomes a warm, fixable 400 instead of a
 * silently unattributed account. Returns:
 *  - { ok: true, code } on a successful claim (caller must release on failure)
 *  - { ok: true, code: null } when no code was supplied (nothing to do)
 *  - { ok: false, error } when a code was supplied but cannot be accepted
 */
export async function claimReferralForSignup(raw: unknown): Promise<ReferralClaim> {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return { ok: true, code: null };
  const code = normalizeReferralCode(trimmed);
  const rejected = {
    ok: false as const,
    error: "That referral code isn't being accepted right now. Check it with whoever gave it to you, or leave it blank.",
  };
  if (!isValidReferralCodeFormat(code)) return rejected;
  const claimed = await redeemReferralCode(pool, code);
  return claimed ? { ok: true, code } : rejected;
}
