/**
 * Visual notebook: parses structured teacher responses into tabbed sections.
 * Shared by the study workspace (App.tsx) and the landing page's live demo,
 * so what visitors see on the landing page IS the product component.
 *
 * Pearl & Ink: sea-teal is the passive "selected/grounded" state (red is
 * reserved for actions), headings use fh-display (Tajawal), and every control
 * carries the app-wide focus-visible ring.
 */
import { useState } from "react";
import { BookOpen } from "lucide-react";
import { motion } from "motion/react";
import { NotebookSection } from "./utils";
import { Markdown } from "./Markdown";

interface NotebookViewerProps {
  sections: NotebookSection[];
}

const FOCUS =
  "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-red)]";

export function NotebookViewer({ sections }: NotebookViewerProps) {
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  return (
    <div className="flex flex-col gap-4 max-w-full my-1">
      <div className="bg-[var(--color-sand)] border border-[var(--color-line-soft)] border-t-2 border-t-[var(--color-sea)]/40 p-3 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-[var(--color-sea)] shrink-0" />
          <span className="text-xs font-bold text-[var(--color-ink)]">دفتر المذاكرة</span>
        </div>
        <span className="text-[10px] text-white font-medium bg-[var(--color-sea)] px-2.5 py-0.5 rounded-full">{sections.length} أجزاء</span>
      </div>

      <div className="flex flex-col md:flex-row gap-3 items-stretch min-h-[240px] max-w-full">
        <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto pb-1.5 md:pb-0 shrink-0 md:w-44 border-b md:border-b-0 md:border-e border-[var(--color-line-soft)] pe-0 md:pe-3 scrollbar-none">
          {sections.map((sec, idx) => (
            <button
              key={idx}
              aria-pressed={activeTabIdx === idx}
              onClick={() => setActiveTabIdx(idx)}
              className={`flex items-center gap-2 px-3 py-2 rounded-full text-start text-xs font-medium transition-all shrink-0 md:w-full border cursor-pointer ${FOCUS} ${
                activeTabIdx === idx
                  ? "bg-[var(--color-sea)] text-white border-[var(--color-sea)]"
                  : "bg-transparent text-[var(--color-ink)]/70 hover:text-[var(--color-ink)] hover:bg-[var(--color-sea-soft)]/50 border-[var(--color-line-soft)]"
              }`}
            >
              <span className="text-sm shrink-0">{sec.emoji}</span>
              <span className="truncate">{sec.title}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 bg-[var(--color-pearl)] border border-[var(--color-line-soft)] border-t-2 border-t-[var(--color-sea)]/25 rounded-2xl p-4 md:p-5 flex flex-col gap-2 min-w-0 max-w-full relative overflow-y-auto">
          {sections[activeTabIdx] && (
            <motion.div
              key={activeTabIdx}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
              className="flex flex-col h-full justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-3 border-b border-[var(--color-line-soft)] mb-3">
                  <span className="text-xl">{sections[activeTabIdx].emoji}</span>
                  <h3 className="fh-display text-sm text-[var(--color-ink)]">{sections[activeTabIdx].title}</h3>
                </div>
                <div className="max-w-full overflow-x-auto">
                  <Markdown>{sections[activeTabIdx].content}</Markdown>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-[var(--color-line-soft)] flex items-center justify-between text-[10px] text-[var(--color-ink)]/65">
                <span>الجزء {activeTabIdx + 1} من {sections.length}</span>
                <div className="flex gap-1.5">
                  <button disabled={activeTabIdx === 0} onClick={() => setActiveTabIdx((p) => p - 1)} className={`px-3 py-1 rounded-full bg-[var(--color-sand)] hover:bg-[var(--color-sea-soft)] text-[var(--color-ink)] hover:text-[var(--color-sea)] border border-[var(--color-line-soft)] text-[11px] disabled:opacity-30 cursor-pointer transition-colors ${FOCUS}`}>السابق</button>
                  <button disabled={activeTabIdx === sections.length - 1} onClick={() => setActiveTabIdx((p) => p + 1)} className={`px-3 py-1 rounded-full bg-[var(--color-sand)] hover:bg-[var(--color-sea-soft)] text-[var(--color-ink)] hover:text-[var(--color-sea)] border border-[var(--color-line-soft)] text-[11px] disabled:opacity-30 cursor-pointer transition-colors ${FOCUS}`}>التالي</button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
