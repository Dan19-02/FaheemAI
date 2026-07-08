/**
 * Razorpay Checkout on the client.
 *
 * The server owns the money: it creates the order and verifies the signature.
 * Here we only load Razorpay's hosted checkout script (from their CDN), open the
 * modal for a server-created order, and hand the result back to the server to
 * verify. The secret key never touches the browser; only the public key id does,
 * and that arrives inside the order response.
 */
import { api, type Account } from "./api";
import type { Subscription } from "./types";
import { SUPPORT_EMAIL } from "./defaults";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void; on: (e: string, cb: (r: any) => void) => void };
  }
}

const CHECKOUT_SRC = "https://checkout.razorpay.com/v1/checkout.js";
let scriptPromise: Promise<boolean> | null = null;

/** Load the Razorpay checkout script once; resolves false if it cannot load. */
export function loadRazorpay(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<boolean>((resolve) => {
    const s = document.createElement("script");
    s.src = CHECKOUT_SRC;
    s.async = true;
    s.onload = () => resolve(Boolean(window.Razorpay));
    s.onerror = () => {
      scriptPromise = null; // allow a retry on the next attempt
      resolve(false);
    };
    document.body.appendChild(s);
  });
  return scriptPromise;
}

export interface CheckoutCallbacks {
  onSuccess: (subscription: Subscription) => void;
  onDismiss?: () => void;
  onError?: (message: string) => void;
}

/**
 * Full purchase flow for one plan: create the order, open Razorpay, verify the
 * payment, then report the fresh subscription. Rejects only on setup failures
 * (order/script); in-checkout failures are surfaced through onError/onDismiss.
 */
export async function startCheckout(plan: string, account: Account, cb: CheckoutCallbacks): Promise<void> {
  const order = await api.createOrder(plan);
  const ready = await loadRazorpay();
  if (!ready || !window.Razorpay) {
    throw new Error("Could not load the payment window. Please check your connection and try again.");
  }

  const rzp = new window.Razorpay({
    key: order.keyId,
    order_id: order.orderId,
    amount: order.amount,
    currency: order.currency,
    name: "Faheem",
    description: `${order.planName} plan, 30 days`,
    // Absolute URL: Razorpay renders this inside its own iframe, where a
    // relative path would resolve against their origin and 404.
    image: `${window.location.origin}/favicon.svg`,
    prefill: { email: order.prefill.email || account.email, name: order.prefill.name || account.profile.name },
    theme: { color: "#6f7d5f" }, // editorial sage
    handler: async (resp: any) => {
      try {
        const { subscription } = await api.verifyPayment({
          razorpay_order_id: resp.razorpay_order_id,
          razorpay_payment_id: resp.razorpay_payment_id,
          razorpay_signature: resp.razorpay_signature,
          plan,
        });
        cb.onSuccess(subscription);
      } catch (err: any) {
        // Honest fallback: no automatic refund exists. If money really left the
        // account, the server-side webhook usually activates the plan by itself.
        cb.onError?.(
          err?.message ||
            `We could not confirm your payment just now. If money left your account, your plan usually switches on by itself within a few minutes; if it does not, write to ${SUPPORT_EMAIL} and we will set it right.`
        );
      }
    },
    modal: { ondismiss: () => cb.onDismiss?.() },
  });
  rzp.on("payment.failed", (r: any) => cb.onError?.(r?.error?.description || "The payment did not go through. Please try again."));
  rzp.open();
}
