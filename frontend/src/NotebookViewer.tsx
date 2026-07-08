/**
 * Visual notebook: parses structured teacher responses into tabbed sections.
 * Shared by the study workspace (App.tsx) and the landing page's live demo,
 * so what visitors see on the landing page IS the product component.
 */
import { useState } from "react";
import { BookOpen } from "lucide-react";
import { motion } from "motion/react";
import { NotebookSection } from "./utils";
import { Markdown } from "./Markdown";

interface NotebookViewerProps {
  sections: NotebookSection[];
}

export function NotebookViewer({ sections }: NotebookViewerProps) {
  const [activeTabIdx, setActiveTabIdx] = useState(0);

  return (
    <div className="flex flex-col gap-4 max-w-full my-1">
      <div className="bg-editorial-stone border border-editorial-line-light border-t-2 border-t-editorial-sage/40 p-3 rounded-xl flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BookOpen size={15} className="text-editorial-sage shrink-0" />
          <span className="text-xs font-bold text-editorial-charcoal">دفتر المذاكرة</span>
        </div>
        <span className="text-[10px] text-white font-medium bg-editorial-sage px-2.5 py-0.5 rounded-full">{sections.length} أجزاء</span>
      </div>

      <div className="flex flex-col md:flex-row gap-3 items-stretch min-h-[240px] max-w-full">
        <div className="flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto pb-1.5 md:pb-0 shrink-0 md:w-44 border-b md:border-b-0 md:border-e border-editorial-line-light pe-0 md:pe-3 scrollbar-none">
          {sections.map((sec, idx) => (
            <button
              key={idx}
              aria-pressed={activeTabIdx === idx}
              onClick={() => setActiveTabIdx(idx)}
              className={`flex items-center gap-2 px-3 py-2 rounded-full text-start text-xs font-medium transition-all shrink-0 md:w-full border cursor-pointer ${
                activeTabIdx === idx ? "bg-editorial-sage text-white border-editorial-sage" : "bg-transparent text-editorial-charcoal/70 hover:text-editorial-charcoal hover:bg-editorial-stone/50 border-editorial-line-light"
              }`}
            >
              <span className="text-sm shrink-0">{sec.emoji}</span>
              <span className="truncate">{sec.title}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 bg-white border border-editorial-line-light border-t-2 border-t-editorial-sage/25 rounded-2xl p-4 md:p-5 flex flex-col gap-2 min-w-0 max-w-full relative overflow-y-auto">
          {sections[activeTabIdx] && (
            <motion.div
              key={activeTabIdx}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 0.61, 0.36, 1] }}
              className="flex flex-col h-full justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-center gap-2 pb-3 border-b border-editorial-line-light mb-3">
                  <span className="text-xl">{sections[activeTabIdx].emoji}</span>
                  <h3 className="text-sm font-serif font-bold text-editorial-charcoal">{sections[activeTabIdx].title}</h3>
                </div>
                <div className="max-w-full overflow-x-auto">
                  <Markdown>{sections[activeTabIdx].content}</Markdown>
                </div>
              </div>

              <div className="mt-5 pt-3 border-t border-editorial-line-light flex items-center justify-between text-[10px] text-editorial-charcoal/65">
                <span>الجزء {activeTabIdx + 1} من {sections.length}</span>
                <div className="flex gap-1.5">
                  <button disabled={activeTabIdx === 0} onClick={() => setActiveTabIdx((p) => p - 1)} className="px-3 py-1 rounded-full bg-editorial-stone hover:bg-editorial-sage/10 text-editorial-charcoal hover:text-editorial-sage border border-editorial-line-light text-[11px] disabled:opacity-30 cursor-pointer transition-colors">السابق</button>
                  <button disabled={activeTabIdx === sections.length - 1} onClick={() => setActiveTabIdx((p) => p + 1)} className="px-3 py-1 rounded-full bg-editorial-stone hover:bg-editorial-sage/10 text-editorial-charcoal hover:text-editorial-sage border border-editorial-line-light text-[11px] disabled:opacity-30 cursor-pointer transition-colors">التالي</button>
                </div>
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
