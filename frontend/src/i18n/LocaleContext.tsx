/**
 * Locale + direction provider for Faheem (Arabic-first tutor).
 *
 * Holds the active UI language ('ar' | 'en') and its writing direction, exposes
 * a flat-key translator `t`, and mirrors the choice onto <html lang> / <html dir>
 * so native controls, form fields, and the browser's bidi algorithm all inherit
 * the correct base direction. Arabic (RTL) is the default.
 *
 * IMPORTANT: switching language ONLY changes which message dictionary `t` reads
 * from and the document direction. It NEVER transforms, reorders, or rewrites any
 * stored message / notebook / chat content, that text is rendered verbatim.
 */
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import ar from "./ar.json";
import en from "./en.json";

export type Lang = "ar" | "en";
export type Dir = "rtl" | "ltr";

type Dict = Record<string, string>;

const DICTS: Record<Lang, Dict> = { ar, en };

/** Persist the user's UI-language choice across sessions. */
const STORAGE_KEY = "fahim.lang";

/** Arabic is the product's home language, so it is the default on first paint. */
const DEFAULT_LANG: Lang = "ar";

function dirFor(lang: Lang): Dir {
  return lang === "ar" ? "rtl" : "ltr";
}

function readStoredLang(): Lang {
  if (typeof localStorage === "undefined") return DEFAULT_LANG;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "ar" || stored === "en" ? stored : DEFAULT_LANG;
}

/**
 * Look up `key` in the active dictionary and interpolate `{var}` placeholders.
 * Returns the key itself when the string is missing, so a stray key is visible
 * (and greppable) rather than rendering as an empty gap.
 */
export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

interface LocaleContextValue {
  lang: Lang;
  dir: Dir;
  t: TranslateFn;
  setLang: (lang: Lang) => void;
}

const LocaleContext = createContext<LocaleContextValue | undefined>(undefined);

export function LocaleProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);
  const dir = dirFor(lang);

  // Mirror state onto the document so native controls + the bidi algorithm
  // inherit the correct base direction. index.html seeds ar/rtl for first paint;
  // this keeps it in sync once the user toggles.
  useEffect(() => {
    const root = document.documentElement;
    root.lang = lang;
    root.dir = dir;
  }, [lang, dir]);

  // RENDER-ONLY TOGGLE GUARANTEE: this is the single entry point for changing
  // language. It ONLY updates `lang` (which re-points `t` and flips `dir` via the
  // effect above) and persists the choice. It does NOT, and any UI toggle wired
  // to it MUST NOT, transform, reorder, translate, or rewrite any stored
  // message / notebook / chat text. Content is always rendered verbatim.
  const setLang = useCallback((next: Lang) => {
    setLangState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* private-mode / storage-disabled: choice just won't persist, non-fatal */
    }
  }, []);

  const t = useCallback<TranslateFn>(
    (key, vars) => {
      const raw = DICTS[lang][key];
      if (raw == null) return key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (match, name: string) =>
        name in vars ? String(vars[name]) : match
      );
    },
    [lang]
  );

  const value = useMemo<LocaleContextValue>(() => ({ lang, dir, t, setLang }), [lang, dir, t, setLang]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useLocale(): LocaleContextValue {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useLocale must be used within a LocaleProvider");
  return ctx;
}
