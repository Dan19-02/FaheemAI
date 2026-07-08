/**
 * Razorpay billing: one-time monthly passes.
 *
 * Flow:
 *   1. client POST /billing/order { plan }         -> we create a Razorpay order
 *   2. client opens Razorpay Checkout with that order and the public key id
 *   3. on success the checkout handler POSTs /billing/verify with the signature
 *   4. we verify the HMAC signature, mark the payment paid, and grant 30 days
 *
 * /billing/webhook is an optional server-to-server backstop (payment.captured)
 * so a pass is still granted even if the browser closes before step 3. Plan
 * activation is idempotent, so verify and webhook can both fire safely.
 *
 * Talks to Razorpay over plain fetch + HMAC (node crypto), so there is no extra
 * dependency to install; the only config is the two keys in the environment.
 */
import { Router } from "express";
import type { Request, Response } from "express";
import crypto from "crypto";
import { requireAuth } from "./auth.js";
import { rateLimit } from "./ratelimit.js";
import {
  pool,
  getUserById,
  getUserByEmail,
  createPayment,
  getPaymentByOrderId,
  markPaymentPaid,
  activatePlan,
  withTransaction,
} from "./db.js";
import {
  PLANS,
  PLAN_BY_ID,
  PASS_DAYS,
  TRIAL_DAYS,
  TRIAL_DAILY_QUERIES,
  RENEW_WINDOW_DAYS,
  getEntitlement,
  renewalDecision,
} from "./subscription.js";

const KEY_ID = process.env.RAZORPAY_KEY_ID || "";
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || "";
const WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET || "";
const RAZORPAY_API = "https://api.razorpay.com/v1";

/** The ONLY support contact. All student-facing "reach us" copy uses this. */
const SUPPORT_EMAIL = "support@clarifyai.in";

export const billingConfigured = Boolean(KEY_ID && KEY_SECRET);
if (!billingConfigured) {
  console.warn("[Billing] RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set: payments are disabled until they are.");
} else {
  const mode = KEY_ID.startsWith("rzp_live") ? "LIVE" : "TEST";
  console.log(`[Billing] Razorpay enabled (${mode} keys). Plans: ${PLANS.map((p) => `${p.name} BHD ${p.price}`).join(", ")}.`);
}

const PASS_MS = PASS_DAYS * 24 * 60 * 60 * 1000;

/** Create an order on Razorpay via the REST API (Basic auth = key id:secret).
 *  Billing is dormant; the currency here is catalogue metadata for whatever
 *  processor goes live in Bahrain, while the Razorpay wiring stays intact. */
async function razorpayCreateOrder(amountFils: number, receipt: string, notes: Record<string, string>) {
  const auth = Buffer.from(`${KEY_ID}:${KEY_SECRET}`).toString("base64");
  const resp = await fetch(`${RAZORPAY_API}/orders`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountFils, currency: "BHD", receipt, notes, payment_capture: 1 }),
  });
  if (!resp.ok) {
    const body = await resp.text().catch(() => "");
    throw new Error(`Razorpay order failed (HTTP ${resp.status}): ${body.slice(0, 300)}`);
  }
  return resp.json() as Promise<{ id: string; amount: number; currency: string; status: string }>;
}

/** Constant-time compare of a Razorpay signature against our recomputed HMAC. */
function signatureValid(payload: string, signature: string, secret: string): boolean {
  // An empty secret (misconfigured deploy) must never verify anything: an
  // attacker can compute HMAC("", ...) themselves and forge a free pass.
  if (!secret) return false;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

/** Activate the paid plan, CHAINED onto any still-active pass (renewalDecision),
 *  so a renewal never overwrites days the student already paid for. */
async function activateForUser(q: any, userId: number, plan: string) {
  const row = await getUserById(q, userId);
  const start = renewalDecision(row || {}).startsAtMs;
  await activatePlan(q, userId, plan, new Date(start).toISOString(), new Date(start + PASS_MS).toISOString());
}

/**
 * Grant a 30-day pass for a confirmed payment. Idempotent AND crash-safe:
 *   1. mark-paid + activation run in ONE transaction, so on real Postgres a
 *      crash between them rolls back and the payment stays retryable;
 *   2. if the payment is already 'paid' but the user's plan does not reflect
 *      it (a partial state from a transaction-less engine or historical data),
 *      the next verify/webhook call HEALS it instead of short-circuiting.
 * Either way a student can never stay charged without access.
 * Exported for the pg-mem smoke test.
 */
export async function grantPass(userId: number, plan: string, paymentId: string, orderId: string, q: any = pool) {
  const granted = await withTransaction(async (tx) => {
    const paid = await markPaymentPaid(tx, orderId, paymentId);
    if (!paid) return false; // already marked by the other path (verify vs webhook)
    await activateForUser(tx, userId, plan);
    return true;
  }, q);
  if (granted) {
    console.log(`[Billing] Activated ${plan} for user ${userId} (order ${orderId}, payment ${paymentId}).`);
    return;
  }

  // Already marked paid. Normally the plan was activated in the same
  // transaction; repair the one partial state where it was not: the payment is
  // 'paid' but no pass window from on/after that payment exists on the user.
  const payment = await getPaymentByOrderId(q, orderId);
  const row = await getUserById(q, userId);
  if (!payment || payment.status !== "paid" || !row) return;
  const paidAt = new Date(payment.updated_at).getTime();
  const started = row.plan_started_at ? new Date(row.plan_started_at).getTime() : 0;
  const reflected = row.plan === payment.plan && started >= paidAt - 60_000;
  if (!reflected) {
    await activateForUser(q, userId, payment.plan);
    console.log(`[Billing] Healed missing activation of ${payment.plan} for user ${userId} (order ${orderId}).`);
  }
}

export const billingRouter = Router();

/**
 * Read-only billing surface, mounted even while purchasing is dormant: the
 * plan chooser needs the catalogue (it renders "coming soon" while
 * configured=false), and the usage pill refreshes /subscription after every
 * metered question. Neither route can move money.
 */
export const billingReadRouter = Router();

/** Public plan catalogue + trial terms (used to render the pricing UI). */
billingReadRouter.get("/billing/plans", (_req: Request, res: Response) => {
  res.json({
    plans: PLANS.map((p) => ({
      id: p.id,
      name: p.name,
      price: p.price,
      amountFils: p.amountFils,
      monthlyQueries: p.monthlyQueries,
      blurb: p.blurb,
    })),
    trial: { days: TRIAL_DAYS, dailyQueries: TRIAL_DAILY_QUERIES },
    passDays: PASS_DAYS,
    configured: billingConfigured,
    currency: "BHD",
  });
});

/** The signed-in student's current entitlement (plan, usage, remaining). */
billingReadRouter.get("/subscription", requireAuth, async (req: Request, res: Response) => {
  try {
    const row = await getUserById(pool, (req as any).userId);
    if (!row) return res.status(404).json({ error: "User not found." });
    res.json({ subscription: await getEntitlement(pool, row) });
  } catch (err: any) {
    console.error("Subscription error:", err);
    res.status(500).json({ error: "Could not load your plan." });
  }
});

/** Step 1: create a Razorpay order for the chosen plan. */
billingRouter.post("/billing/order", requireAuth, async (req: Request, res: Response) => {
  try {
    if (!billingConfigured) {
      return res.status(503).json({ error: "Payments are not switched on yet. Please try again a little later." });
    }
    const uid = (req as any).userId as number;
    const planId = String(req.body?.plan || "");
    const def = PLAN_BY_ID[planId];
    if (!def) return res.status(400).json({ error: "Please choose one of the available plans." });

    const row = await getUserById(pool, uid);
    if (!row) return res.status(404).json({ error: "User not found." });

    // A pass the student already paid for is never overwritten: while one is
    // active, buying is blocked until its last days, and a renewal bought then
    // starts AT the current expiry (grantPass chains the windows).
    const decision = renewalDecision(row);
    if (!decision.allowed) {
      const until = new Date(decision.activeUntilMs!).toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "Asia/Bahrain" });
      return res.status(409).json({
        error: `Your current pass is active until ${until}. Renewal opens in its last ${RENEW_WINDOW_DAYS} days, so nothing you have paid for is lost.`,
      });
    }

    const receipt = `faheem_${uid}_${Date.now()}`.slice(0, 40); // Razorpay caps receipt at 40 chars
    const order = await razorpayCreateOrder(def.amountFils, receipt, { userId: String(uid), plan: def.id });
    await createPayment(pool, { userId: uid, plan: def.id, orderId: order.id, amount: def.amountFils, currency: "BHD" });

    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: KEY_ID, // public key id, safe to expose; the secret never leaves the server
      plan: def.id,
      planName: def.name,
      prefill: { email: row.email, name: row.name },
    });
  } catch (err: any) {
    console.error("Create order error:", err);
    res.status(502).json({ error: "Could not start the payment. Please try again in a moment." });
  }
});

/** Step 3: verify the checkout signature and activate the plan. */
billingRouter.post("/billing/verify", requireAuth, async (req: Request, res: Response) => {
  try {
    // Same guard as /billing/order: with no KEY_SECRET, nothing can be
    // verified (and an empty secret must never be used to check signatures).
    if (!billingConfigured) {
      return res.status(503).json({ error: "Payments are not switched on right now. Please try again a little later." });
    }
    const uid = (req as any).userId as number;
    const orderId = String(req.body?.razorpay_order_id || "");
    const paymentId = String(req.body?.razorpay_payment_id || "");
    const signature = String(req.body?.razorpay_signature || "");
    if (!orderId || !paymentId || !signature) {
      return res.status(400).json({ error: "Payment details are incomplete." });
    }

    const payment = await getPaymentByOrderId(pool, orderId);
    if (!payment || payment.user_id !== uid) {
      return res.status(404).json({ error: "We could not find this order." });
    }
    if (!signatureValid(`${orderId}|${paymentId}`, signature, KEY_SECRET)) {
      // Honest: no automatic refund exists. If the money really left their
      // account, the webhook backstop usually activates the plan by itself.
      return res.status(400).json({
        error: `We could not verify this payment. If money left your account, your plan usually switches on by itself within a few minutes; if it does not, write to ${SUPPORT_EMAIL} and we will set it right.`,
      });
    }

    await grantPass(uid, payment.plan, paymentId, orderId);

    const row = await getUserById(pool, uid);
    res.json({ ok: true, subscription: await getEntitlement(pool, row) });
  } catch (err: any) {
    console.error("Verify payment error:", err);
    res.status(500).json({ error: `Something went wrong confirming your payment. If money was deducted, write to ${SUPPORT_EMAIL} and we will set it right.` });
  }
});

// --- Admin / support grant: comp a pass without a payment ---
// For internal testing and support (a refund gone wrong, a goodwill pass).
// Inert unless ADMIN_GRANT_TOKEN is set in the environment; the caller must
// present that exact token in the x-admin-token header. Never exposed to the
// app UI; it is a curl-only tool for the operator.
const ADMIN_GRANT_TOKEN = process.env.ADMIN_GRANT_TOKEN || "";

billingRouter.post("/billing/admin/grant", async (req: Request, res: Response) => {
  try {
    if (!ADMIN_GRANT_TOKEN) return res.status(503).json({ error: "Admin grants are not enabled." });
    if (!rateLimit(`admin-grant:${req.ip}`, 10)) return res.status(429).json({ error: "Too many attempts." });
    const given = Buffer.from(String(req.headers["x-admin-token"] || ""));
    const expected = Buffer.from(ADMIN_GRANT_TOKEN);
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) {
      return res.status(401).json({ error: "Not allowed." });
    }

    const email = String(req.body?.email || "").trim().toLowerCase();
    const planId = String(req.body?.plan || "");
    const days = Math.min(3650, Math.max(1, Number(req.body?.days) || PASS_DAYS));
    if (!PLAN_BY_ID[planId]) return res.status(400).json({ error: "Unknown plan. Use starter, regular, or unlimited." });
    const row = await getUserByEmail(pool, email);
    if (!row) return res.status(404).json({ error: "No account with that email. Sign it up first." });

    // Chain onto any active pass (never destroy paid days), same as a purchase.
    const start = renewalDecision(row).startsAtMs;
    await activatePlan(pool, row.id, planId, new Date(start).toISOString(), new Date(start + days * 24 * 60 * 60 * 1000).toISOString());
    const fresh = await getUserById(pool, row.id);
    console.log(`[Billing] ADMIN GRANT: ${planId} for ${days} days to ${email}.`);
    res.json({ ok: true, subscription: await getEntitlement(pool, fresh) });
  } catch (err) {
    console.error("Admin grant error:", err);
    res.status(500).json({ error: "Grant failed." });
  }
});

/**
 * Optional webhook backstop. Mounted in index.ts with a RAW body parser (before
 * express.json) so the signature can be verified against the exact bytes.
 */
export async function razorpayWebhookHandler(req: Request, res: Response) {
  try {
    if (!WEBHOOK_SECRET) return res.status(503).end();
    const signature = String(req.headers["x-razorpay-signature"] || "");
    const raw: Buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ""));
    if (!signatureValid(raw.toString("utf8"), signature, WEBHOOK_SECRET)) {
      return res.status(400).json({ error: "invalid signature" });
    }

    const event = JSON.parse(raw.toString("utf8"));
    if (event?.event === "payment.captured" || event?.event === "order.paid") {
      const entity = event.payload?.payment?.entity || {};
      const orderId = entity.order_id;
      const paymentId = entity.id;
      if (orderId && paymentId) {
        const payment = await getPaymentByOrderId(pool, orderId);
        if (payment) await grantPass(payment.user_id, payment.plan, paymentId, orderId);
      }
    }
    res.json({ ok: true });
  } catch (err: any) {
    console.error("Webhook error:", err);
    res.status(500).json({ error: "webhook error" });
  }
}
