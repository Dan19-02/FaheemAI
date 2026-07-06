/**
 * Auth context backed by the Express + JWT backend.
 * Holds the signed-in account (profile + study log), restores the session from
 * a stored token on load, and exposes login / signup / logout.
 */
import React, { createContext, useContext, useEffect, useState } from "react";
import { api, getToken, setToken, type Account, type SignupInput } from "./api";
import type { Subscription } from "./types";

interface AuthContextValue {
  account: Account | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<void>;
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
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  const login = async (email: string, password: string) => {
    const { token, user } = await api.login(email, password);
    setToken(token);
    setAccount(user);
  };

  const loginWithGoogle = async (credential: string) => {
    const { token, user } = await api.googleAuth(credential);
    setToken(token);
    setAccount(user);
  };

  const signup = async (input: SignupInput) => {
    const { token, user } = await api.signup(input);
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
      value={{ account, loading, login, loginWithGoogle, signup, logout, setAccount, applySubscription, refreshSubscription }}
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
