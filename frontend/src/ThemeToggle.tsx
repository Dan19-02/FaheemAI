/**
 * The one dark-mode switch, shared by the landing page and the workspace so
 * both surfaces flip together. Theme lives as data-theme="dark" on <html>
 * (every color token swaps in index.css) and persists in localStorage under
 * "faheem-theme". index.html applies the stored theme before first paint,
 * so there is no light flash.
 */
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const THEME_KEY = "faheem-theme"; // index.html hardcodes this for the pre-paint apply

function currentTheme(): "light" | "dark" {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"light" | "dark">(() => currentTheme());

  // Keep multiple toggles (landing header, workspace header) in sync.
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(currentTheme()));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => observer.disconnect();
  }, []);

  const flip = () => {
    const next = theme === "dark" ? "light" : "dark";
    if (next === "dark") {
      document.documentElement.dataset.theme = "dark";
    } else {
      delete document.documentElement.dataset.theme;
    }
    // Keep the mobile browser chrome (address bar) in the same world.
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", next === "dark" ? "#0e1523" : "#f7f2e9");
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Private mode without storage: the flip still works for this visit.
    }
  };

  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={flip}
      aria-pressed={dark}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
      className={`flex h-9 w-9 items-center justify-center rounded-full border-2 border-ink-line text-ink transition-colors hover:border-cobalt-bright hover:text-cobalt-bright focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalt-bright ${className}`}
    >
      {dark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
}
