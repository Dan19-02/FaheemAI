/**
 * Thin wrapper around Google Identity Services (the `accounts.google.com/gsi`
 * script loaded in index.html). Renders the official "Continue with Google"
 * button and hands the resulting credential (an ID token JWT) to a callback,
 * which the app exchanges for a session via POST /auth/google.
 *
 * Configured entirely by VITE_GOOGLE_CLIENT_ID: when it is unset, the button
 * simply does not render and email/password sign in is unaffected.
 */
import { useEffect, useRef } from "react";

interface GoogleIdApi {
  initialize: (config: {
    client_id: string;
    callback: (response: { credential?: string }) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  cancel: () => void;
}

declare global {
  interface Window {
    google?: { accounts: { id: GoogleIdApi } };
  }
}

/** The OAuth Web client id, shared with the backend's GOOGLE_CLIENT_ID. */
export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();

/**
 * Render Google's button into a div once the GSI script is ready. Returns a ref
 * to attach to that div, plus `enabled` so the caller can hide the whole block
 * (divider and all) when Google sign in is not configured.
 */
export function useGoogleButton(
  onCredential: (credential: string) => void,
  buttonText: "continue_with" | "signin_with" | "signup_with" = "continue_with"
) {
  const ref = useRef<HTMLDivElement | null>(null);
  // Keep the latest callback without re-running the effect (which would re-init GSI).
  const cbRef = useRef(onCredential);
  cbRef.current = onCredential;

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let cancelled = false;
    let tries = 0;

    const render = () => {
      if (cancelled || !ref.current) return;
      const gid = window.google?.accounts?.id;
      // The GSI script loads async; poll briefly until it is available.
      if (!gid) {
        if (tries++ < 60) window.setTimeout(render, 100);
        return;
      }
      gid.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (response) => {
          if (response?.credential) cbRef.current(response.credential);
        },
        cancel_on_tap_outside: true,
      });
      ref.current.innerHTML = "";
      gid.renderButton(ref.current, {
        type: "standard",
        theme: "outline",
        size: "large",
        text: buttonText,
        shape: "pill",
        logo_alignment: "center",
      });
    };

    render();
    return () => {
      cancelled = true;
    };
  }, [buttonText]);

  return { ref, enabled: Boolean(GOOGLE_CLIENT_ID) };
}
