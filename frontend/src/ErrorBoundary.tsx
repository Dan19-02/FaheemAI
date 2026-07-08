/**
 * Error boundaries for the study desk.
 *
 * A single malformed answer (a Mermaid edge case, a KaTeX parse crash) must
 * never blank the whole app for a student mid-session. Two layers:
 * - AppErrorBoundary wraps the entire tree with a calm full-screen fallback.
 * - MessageErrorBoundary wraps ONE message body, so a bad answer degrades to
 *   a small inline notice while the rest of the conversation keeps working.
 */
import React from "react";

interface BoundaryProps {
  children: React.ReactNode;
  /** Rendered when the subtree throws. Kept as a prop because class
   *  components cannot call the useLocale hook. */
  fallback: React.ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

class Boundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Render error caught by boundary:", error);
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Inline, per-message fallback: the rest of the chat stays alive. */
export function MessageErrorBoundary({ children, notice }: { children: React.ReactNode; notice: string }) {
  return (
    <Boundary
      fallback={
        <p className="text-xs text-[var(--color-ink-soft)] italic" role="alert">
          {notice}
        </p>
      }
    >
      {children}
    </Boundary>
  );
}

/** Last-resort whole-app fallback. Bilingual by construction (no locale
 *  context available if the crash happened above the provider). */
export function AppErrorBoundary({ children }: { children: React.ReactNode }) {
  return (
    <Boundary
      fallback={
        <div className="fahim-app flex min-h-[100dvh] flex-col items-center justify-center gap-4 bg-[var(--color-pearl)] px-6 text-center text-[var(--color-ink)]">
          <div className="faheem-mark h-14 w-14 text-2xl">ف</div>
          <p className="text-sm font-bold" dir="rtl">
            حدث خطأ غير متوقّع. حدّث الصفحة للمتابعة.
          </p>
          <p className="text-xs text-[var(--color-ink-soft)]" dir="ltr">
            Something went wrong. Refresh the page to continue.
          </p>
        </div>
      }
    >
      {children}
    </Boundary>
  );
}
