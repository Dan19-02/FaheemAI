/**
 * Rich markdown renderer for Faheem teaching responses.
 *
 * The model is prompted to use Markdown tables, LaTeX math, and Mermaid
 * diagrams. The old UI dumped raw text, so equations and diagrams showed as
 * gibberish. This component renders:
 *   - GitHub-flavored markdown (tables, lists, bold, links)
 *   - LaTeX math via KaTeX ($...$ inline, $$...$$ block)
 *   - Mermaid flowcharts (```mermaid code fences)
 */
import React, { useEffect, useId, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";

// Mermaid (and its cytoscape/dagre deps) is ~1.5MB, so we load it lazily, only
// when a response actually contains a diagram. Critical for low-end mobile.
let mermaidPromise: Promise<typeof import("mermaid").default> | null = null;
function getMermaid() {
  if (!mermaidPromise) {
    mermaidPromise = import("mermaid").then((m) => {
      // suppressErrorRendering is essential: without it, a failed parse
      // injects a big "Syntax error" bomb SVG into document.body, one per
      // attempt. We handle failures ourselves (source fallback below).
      m.default.initialize({ startOnLoad: false, theme: "neutral", securityLevel: "strict", suppressErrorRendering: true });
      return m.default;
    });
  }
  return mermaidPromise;
}

// Right-pointing unicode / decorative arrows the model reaches for instead of
// the plain ASCII edge Mermaid needs. (The no-dash punctuation rule nudges it
// away from "-->", so it substitutes a glyph the parser then rejects.)
const UNICODE_ARROWS = /[→➔➙➜➝➞➟➠➡⇒⇨⟶⟹⟼↦⭢⮕⮞⮞⬎]/g;

/**
 * Repair the two Mermaid mistakes that make the model's diagrams fail to parse
 * and fall back to raw source: unicode arrows where "-->" belongs, and
 * unquoted parentheses in square-bracket labels. Label/edge-label text is
 * protected so an arrow that is genuinely part of a label is never rewritten.
 */
export function sanitizeMermaid(src: string): string {
  // 1) Quote square-bracket labels containing parentheses: C[Watt (W)] -> C["Watt (W)"].
  let s = src.replace(/\[([^\[\]"]*\([^\[\]"]*)\]/g, '["$1"]');
  // 2) Stash label / bracket / pipe content behind a sentinel that cannot occur
  //    in real Mermaid, then fix connector arrows outside it. (A bare-number
  //    placeholder would collide with digits in the diagram itself.)
  const stash: string[] = [];
  s = s.replace(/"[^"]*"|\[[^\]]*\]|\([^)]*\)|\{[^}]*\}|\|[^|]*\|/g, (m) => {
    stash.push(m);
    return `@@S${stash.length - 1}@@`;
  });
  s = s
    .replace(UNICODE_ARROWS, "-->")
    .replace(/[\u2013\u2014]+>/g, "-->") // en/em dash used as an arrow becomes a plain edge
    .replace(/-{4,}>/g, "-->"); // collapse an accidentally long "---->" edge
  s = s.replace(/@@S(\d+)@@/g, (_, i) => stash[Number(i)] ?? "");
  return s;
}

/**
 * When a diagram genuinely will not render, present it in words instead of
 * dumping raw Mermaid DSL at the student. Returns "" if nothing readable can
 * be salvaged (the caller then shows nothing, which beats broken code).
 */
function mermaidToWords(src: string): string {
  const lines = src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !/^(graph|flowchart|subgraph|end|style|classDef|class|linkStyle|direction)\b/i.test(l))
    .map((l) =>
      l
        .replace(/-->\s*\|([^|]*)\|/g, " → ($1) → ") // labelled edge
        .replace(/-\.->|==>|-->|---/g, " → ") // any edge to a display arrow
        .replace(/[A-Za-z0-9_]+\s*[\[({]+\s*"?([^\])}"]*?)"?\s*[\])}]+/g, "$1") // id[label] -> label
        .replace(/\s+/g, " ")
        .trim()
    )
    .filter((l) => l && l !== "→");
  return lines.join("\n");
}

function MermaidBlock({ chart }: { chart: string }) {
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "");
  const clean = React.useMemo(() => sanitizeMermaid(chart), [chart]);
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    setFailed(false);
    getMermaid()
      .then((mermaid) => mermaid.render(`mmd-${reactId}`, clean))
      .then(({ svg }) => {
        if (!cancelled) setSvg(svg);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [clean, reactId]);

  if (failed) {
    // Never show raw Mermaid DSL: render the diagram in words, or nothing.
    const words = mermaidToWords(clean);
    if (!words) return null;
    return (
      <div className="my-3 rounded-xl border border-editorial-line-light bg-editorial-stone/40 p-4">
        <div className="mb-1.5 text-xs font-semibold text-editorial-charcoal/70">Diagram, in words</div>
        <ul className="space-y-1 text-sm text-editorial-charcoal/85">
          {words.split("\n").map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label="Concept flowchart drawn by Faheem"
      className="my-3 flex justify-center overflow-x-auto rounded-xl border border-editorial-line-light bg-surface p-3"
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    >
      {svg ? undefined : <span className="text-xs text-editorial-charcoal/40">Drawing diagram…</span>}
    </div>
  );
}

interface MarkdownProps {
  children: string;
  /** True while the text is still streaming in. Mermaid is NEVER invoked on a
   *  partial chart (every delta would re-parse an incomplete diagram and fail);
   *  a quiet placeholder holds the spot until the final answer renders. */
  streaming?: boolean;
}

/** Placeholder shown where a diagram will draw once the answer completes. */
function DiagramPending() {
  return (
    <div className="my-3 flex justify-center rounded-xl border border-dashed border-editorial-line bg-editorial-stone/40 p-4">
      <span className="text-xs text-editorial-charcoal/70">Diagram will draw when the answer completes…</span>
    </div>
  );
}

/**
 * The teaching models sometimes emit LaTeX with backslash delimiters
 * (\( x \) and \[ x \]) despite the prompt asking for dollars. remark-math
 * only parses $/$$, so without this normalisation a student sees raw TeX
 * source in the middle of a math answer. Applied at render time so old saved
 * answers and notebook entries are healed too. Code fences are left alone.
 */
function normalizeMathDelimiters(md: string): string {
  if (!md.includes("\\(") && !md.includes("\\[")) return md;
  // Split out fenced code blocks so TeX-looking content inside them survives.
  return md
    .split(/(```[\s\S]*?```|`[^`]*`)/g)
    .map((part, i) =>
      i % 2 === 1
        ? part
        : part
            .replace(/\\\[([\s\S]*?)\\\]/g, (_, inner) => `$$${inner}$$`)
            .replace(/\\\(([\s\S]*?)\\\)/g, (_, inner) => `$${inner}$`)
    )
    .join("");
}

function MarkdownImpl({ children, streaming }: MarkdownProps) {
  return (
    <div dir="auto" className="faheem-prose space-y-3 text-sm leading-[1.7] text-editorial-charcoal break-words md:text-[15px]">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={{
          // Unwrap <pre> so our block code renders without invalid <pre><div> nesting.
          pre: ({ children }) => <>{children}</>,
          code({ className, children }) {
            const match = /language-(\w+)/.exec(className || "");
            const lang = match?.[1];
            const value = String(children).replace(/\n$/, "");

            if (lang === "mermaid") return streaming ? <DiagramPending /> : <MermaidBlock chart={value} />;

            if (lang || value.includes("\n")) {
              return (
                <pre className="my-2 overflow-x-auto rounded-xl bg-editorial-charcoal/95 p-3 text-xs leading-relaxed text-editorial-ivory">
                  <code className="font-mono">{children}</code>
                </pre>
              );
            }
            return (
              <code className="rounded bg-editorial-stone px-1.5 py-0.5 font-mono text-[0.85em] text-editorial-sage">
                {children}
              </code>
            );
          },
          table: ({ children }) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-xs md:text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-editorial-line bg-editorial-stone/60 px-3 py-2 text-left font-semibold">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border border-editorial-line-light px-3 py-2 align-top">{children}</td>
          ),
          a: ({ children, href }) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="text-editorial-sage underline underline-offset-2 hover:opacity-80"
            >
              {children}
            </a>
          ),
          h1: ({ children }) => <h1 className="kod-display text-xl font-bold mt-1">{children}</h1>,
          h2: ({ children }) => <h2 className="kod-display text-lg font-semibold mt-3">{children}</h2>,
          h3: ({ children }) => <h3 className="kod-display text-base font-semibold text-editorial-sage mt-2">{children}</h3>,
          ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-[3px] border-editorial-sage/60 bg-editorial-stone/30 py-1 pl-3 italic">
              {children}
            </blockquote>
          ),
        }}
      >
        {normalizeMathDelimiters(children)}
      </ReactMarkdown>
    </div>
  );
}

// Memoize: chat re-renders often, but a message's text is immutable once set.
export const Markdown = React.memo(MarkdownImpl);
