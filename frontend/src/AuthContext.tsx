/**
 * Auth context backed by the Express + JWT backend.
 * Holds the signed-in account (profile + study log), restores the session from
 * a stored token on load, and exposes login / signup / logout.
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import { ApiError, api, getToken, setToken, type Account, type SignupInput } from "./api";
import type { Subscription } from "./types";

interface AuthContextValue {
  account: Account | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  /** referralCode attributes the account to a partner if (and only if) this
   *  sign-in creates it; harmless for returning students. Resolves with
   *  whether an account was CREATED, so the caller can decide if a captured
   *  ?ref= code was actually consumed. */
  loginWithGoogle: (credential: string, referralCode?: string) => Promise<{ created: boolean }>;
  signup: (input: SignupInput) => Promise<void>;
  /** Adopt a session returned by a flow that mints its own token+user (the
   *  password reset auto-signs the student in). Same effect as login. */
  applySession: (token: string, user: Account) => void;
  logout: () => void;
  setAccount: (a: Account) => void;
  /** Merge a fresh plan/usage snapshot into the signed-in account. */
  applySubscription: (sub: Subscription) => void;
  /** Pull the latest plan/usage from the server (after asking or paying). */
  refreshSubscription: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [loading, setLoading] = useState<boolean>(Boolean(getToken()));

  // Restore session from a stored token.
  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api
      .me()
      .then(({ user }) => setAccount(user))
      .catch((err) => {
        // Only a real 401 means the session is dead. A network blip or a
        // server hiccup must NOT log the student out: flaky connections are
        // the norm for this audience, and api.ts already clears the token
        // itself when any request comes back 401.
        if (err instanceof ApiError && err.status === 401) setToken(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { token, user } = await api.login(email, password);
    setToken(token);
    setAccount(user);
  };

  const loginWithGoogle = async (credential: string, referralCode?: string) => {
    const { token, user, created } = await api.googleAuth(credential, referralCode);
    setToken(token);
    setAccount(user);
    return { created: created === true };
  };

  const signup = async (input: SignupInput) => {
    const { token, user } = await api.signup(input);
    setToken(token);
    setAccount(user);
  };

  const applySession = (token: string, user: Account) => {
    setToken(token);
    setAccount(user);
  };

  const logout = () => {
    setToken(null);
    setAccount(null);
  };

  const applySubscription = (sub: Subscription) =>
    setAccount((prev) => (prev ? { ...prev, subscription: sub } : prev));

  const refreshSubscription = async () => {
    try {
      const { subscription } = await api.getSubscription();
      applySubscription(subscription);
    } catch {
      /* non-fatal: the usage display just stays as-is until the next refresh */
    }
  };

  return (
    <AuthContext.Provider
      value={{ account, loading, login, loginWithGoogle, signup, applySession, logout, setAccount, applySubscription, refreshSubscription }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
