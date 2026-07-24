import React, { useState, useEffect, useMemo, useRef, Suspense, lazy } from "react";
import {
  Sparkles,
  BookOpen,
  Search,
  Send,
  Trash2,
  ExternalLink,
  Settings,
  User,
  LogOut,
  MessageSquare,
  Loader2,
  Plus,
  Paperclip,
  X,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  BookMarked,
  Flame,
  Star
} from "lucide-react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import { ThemeToggle } from "./ThemeToggle";
import VerifyBanner from "./VerifyBanner";
import {
  ChatMessage,
  ChapterProgress,
  StudentProfile,
  Conversation,
  Subscription
} from "./types";
import {
  parseTeachingSections,
  filesToAttachments,
  dataUrlToBase64
} from "./utils";
import { useAuth } from "./AuthContext";
import { api, ApiError } from "./api";
import { DEFAULT_CHAPTERS, makeDefaultProfile, SUPPORT_EMAIL } from "./defaults";
import { Markdown } from "./Markdown";
import { NotebookViewer } from "./NotebookViewer";
import UpgradeModal from "./UpgradeModal";
import { UnderstandingPanel, type CompConcept, type CompSummary, type CompToday } from "./UnderstandingPanel";
import PreExamNotebook from "./PreExamNotebook";
import { CelebrationOverlay } from "./CelebrationOverlay";
import { ReadyToLandCard, type ReadyConcept } from "./ReadyToLand";
import { TrialArc } from "./TrialArc";
import {
  type Celebration,
  canFire,
  markFired,
  claimOnce,
  DOUBT_MILESTONES,
  SAVE_MILESTONES,
  SHEET_THRESHOLDS,
  practicedCopy,
  landedCopy,
  firstStarCopy,
  doubtsMilestoneCopy,
  savesMilestoneCopy,
  sheetCopy,
  savedToast,
  lampGreeting,
  lampTitle
} from "./celebrations";

// The public landing site is only for signed-out visitors, so it loads as its
// own chunk and never weighs down a student's session.
const Landing = lazy(() => import("./landing/Landing"));
import { STUDY_FACTS, FALLBACK_STUDY_FACT, pickFirstFactIndex } from "./facts";

const SUGGESTED_QUERIES = [
  { label: "Explain Photosynthesis", prompt: "Can you explain photosynthesis simply?", hint: "Start with a plain, everyday walk-through." },
  { label: "Newton's 2nd Law", prompt: "Explain Newton's Second Law of Motion at an exam level. Give me a good analogy!", hint: "Exam-level, with an analogy you will remember." },
  { label: "Cell Division", prompt: "What is the difference between mitosis and meiosis? I have a test coming up.", hint: "The comparison, side by side." },
  { label: "Quadratic Equations", prompt: "How do I find the roots of a quadratic equation?", hint: "The method, worked out step by step." }
];

const MAX_ATTACHMENTS = 6;

// One-tap "I'm still lost" signal. The student often can't articulate WHAT they
// don't get, this lets them say "go again, differently" with a single tap, and
// the backend's comprehension loop climbs the re-explain ladder (gut feel →
// fresh analogy → smallest step + picture → worked example → pinpoint).
const STILL_CONFUSED_PROMPT =
  "I still don't fully get it, can you explain that part differently, in a simpler way?";

const ACTION_PILL =
  "flex items-center gap-1.5 whitespace-nowrap shrink-0 px-3 py-1 rounded-full text-xs transition-all bg-editorial-stone hover:bg-editorial-sage/10 text-editorial-sage border border-editorial-line-light disabled:opacity-40 cursor-pointer motion-safe:active:scale-[0.97]";

// The stay-until-it-lands loop is the product's heart, so its one-tap retry is
// the warmest, most inviting action in the row, distinct from the utilities.
const STILL_FUZZY_PILL =
  "flex items-center gap-1.5 whitespace-nowrap shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all bg-editorial-sage/12 text-editorial-sage border border-editorial-sage/30 hover:bg-editorial-sage/20 disabled:opacity-40 cursor-pointer motion-safe:active:scale-[0.97]";

type MobileView = "study" | "chat";

// Can the student start a NEW question right now, judging from the cached
// subscription? The server is the real authority; this only avoids a doomed
// request and shows the paywall instantly. If the quota window has already
// rolled over (resetAt in the past), we let the request through so the server
// can refresh, rather than block on stale numbers.
function canAskNew(sub?: Subscription): boolean {
  if (!sub) return true;
  if (sub.resetAt && Date.parse(sub.resetAt) <= Date.now()) return true;
  return sub.active && (sub.remaining === null || sub.remaining > 0);
}

// Client mirror of the server's paywallMessage, for the instant soft-block.
function blockedReason(sub?: Subscription): string {
  if (!sub) return "Please choose a plan to keep learning.";
  if (sub.state === "trial")
    return "That is all 10 free questions for today. They refresh tomorrow morning, or you can unlock a plan to keep going right now.";
  if (sub.state === "active")
    return `You have used all ${sub.limit} questions on your ${sub.planName} plan this month. Upgrade any time to keep learning.`;
  if (sub.state === "plan_expired")
    return `Your ${sub.planName} pass has ended. Renew it to pick up right where you left off.`;
  return "Your free week is complete. Choose a plan to keep your patient teacher going, at any hour, as many times as you need.";
}

export default function App() {
  const { account, loading: authLoading, logout, applySubscription, refreshSubscription } = useAuth();
  const subscription = account?.subscription;

  // Paywall / plan chooser.
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState<string>("");

  // Pre-exam notebook overlay + line-selection save state + toast.
  const [notebookOpen, setNotebookOpen] = useState(false);

  // Escape closes whichever overlay is on top: a kid who taps into a modal
  // must always have the universal way back out.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setNotebookOpen((open) => (open ? false : open));
      setShowUpgrade((open) => (open ? false : open));
      setIsEditingProfile((open) => (open ? false : open));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const [selSave, setSelSave] = useState<{ msgId: string; text: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showToast = (msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  // Profile + study log come from the signed-in account.
  const [profile, setProfile] = useState<StudentProfile>(() => makeDefaultProfile());
  const [chapters, setChapters] = useState<ChapterProgress[]>(DEFAULT_CHAPTERS);
  const [dataLoading, setDataLoading] = useState(true);
  const loadedRef = useRef(false);

  // Conversations = separate chat windows. Only the active one's messages load.
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);

  // UI state
  const [inputText, setInputText] = useState("");
  const [attachments, setAttachments] = useState<{ dataUrl: string; mimeType: string; name: string; isImage: boolean }[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  // Synchronous companion to isGenerating (see handleSendMessage).
  const sendingRef = useRef(false);
  // "Go deeper" is one-shot per answer. Maps a source answer's id to the
  // notebook it already generated, so a repeat tap jumps to that notebook
  // instead of re-asking: deep answers are cache-served, so re-asking just
  // stacks a byte-identical notebook. Derived from the messages themselves
  // (each notebook persists a deepFor pointer to its source answer), so the
  // link survives reloads and conversation switches.
  const deepDiveOf = useMemo(() => {
    const map: Record<string, string> = {};
    for (const m of chatHistory) if (m.deepFor) map[m.deepFor] = m.id;
    return map;
  }, [chatHistory]);
  const [mobileView, setMobileView] = useState<MobileView>("chat");
  const [showChapters, setShowChapters] = useState(false);
  // Bumped after each answer so the "What's landing" read refreshes.
  const [understandingKey, setUnderstandingKey] = useState(0);

  // ---- The honest dopamine layer -------------------------------------------
  // All celebration/dedupe storage is scoped per account so two siblings on
  // one phone never see each other's moments claimed.
  const scope = `fhm:${account?.id ?? "anon"}`;

  // The Landing Signal read now lives here (not in the panel): the workspace
  // needs it to diff state transitions for mastery moments, feed the sidebar
  // panel, and drive the Ready-to-Land queue, wherever the panel is hidden.
  const [comp, setComp] = useState<{ enabled: boolean; concepts: CompConcept[]; summary: CompSummary; ready: ReadyConcept[]; today: CompToday }>({
    enabled: true,
    concepts: [],
    summary: { landed: 0, practiced: 0, working: 0 },
    ready: [],
    today: { learned: [], fuzzy: [], touched: 0 }
  });
  // Previous per-concept states; null until the first read (the baseline never
  // celebrates: a transition that happened while away is not a fresh win).
  const compPrevRef = useRef<Map<string, string> | null>(null);
  const [celebration, setCelebration] = useState<Celebration | null>(null);
  const celebrationQueue = useRef<Celebration[]>([]);
  // Mirrors `celebration` synchronously so pushCelebration can decide show-vs-
  // queue WITHOUT mutating state inside a setState updater (StrictMode double-
  // invokes updaters, which would double-enqueue).
  const celebrationActiveRef = useRef(false);
  const [glowKeys, setGlowKeys] = useState<string[]>([]);

  // Lifetime stats: lamp days (only ever grows) + doubts cleared. null until
  // loaded; when the load failed we show nothing rather than a made-up count.
  const [stats, setStats] = useState<{ daysActive: number; activeToday: boolean; doubtsCleared: number } | null>(null);

  // Pre-exam notebook accumulation: running total + per-chapter counts for
  // the sheet milestones (null until known / while the shelf is locked).
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const chapterCountsRef = useRef<Map<string, number> | null>(null);

  // Ready to Land: shown only on a fresh open, dismissible for the UTC day.
  const [sentThisSession, setSentThisSession] = useState(false);
  const [rtlState, setRtlState] = useState<"idle" | "loading" | "posed">("idle");
  const [rtlDismissed, setRtlDismissed] = useState(true); // true until storage is read
  const [checkNudgeDismissed, setCheckNudgeDismissed] = useState(false);

  const utcDayClient = () => new Date().toISOString().slice(0, 10);

  const pushCelebration = (c: Celebration) => {
    markFired(c.tone);
    // No side effects inside the setState updater: decide here, synchronously.
    if (celebrationActiveRef.current) {
      celebrationQueue.current.push(c);
      return;
    }
    celebrationActiveRef.current = true;
    setCelebration(c);
  };

  const advanceCelebration = () => {
    const next = celebrationQueue.current.shift() ?? null;
    celebrationActiveRef.current = next !== null;
    setCelebration(next);
  };

  // Live refs so the comprehension diff (a stable callback) reads current
  // profile/subscription/stats without re-subscribing effects.
  const profileRef = useRef(profile);
  profileRef.current = profile;
  const subscriptionRef = useRef(subscription);
  subscriptionRef.current = subscription;
  const statsRef = useRef(stats);
  statsRef.current = stats;
  // Which account is signed in RIGHT NOW. Async reads (comprehension, stats,
  // notebook) capture this at call time and bail if it changed before they
  // resolve, so account A's data can never celebrate or count into account B.
  const accountIdRef = useRef(account?.id);
  accountIdRef.current = account?.id;

  /** Fetch the comprehension read and celebrate any fresh, examiner-verified
   *  promotion (working -> practiced/landed, practiced -> landed). */
  const loadComprehension = React.useCallback(async () => {
    const myAcct = accountIdRef.current;
    try {
      const raw = await api.getComprehension();
      // Account switched mid-flight: drop this response entirely.
      if (accountIdRef.current !== myAcct) return;
      // Defensive against a frontend-first deploy hitting an older backend that
      // has no `ready` field yet: never let the card map over undefined.
      const data = {
        enabled: raw?.enabled ?? false,
        concepts: raw?.concepts ?? [],
        summary: raw?.summary ?? { landed: 0, practiced: 0, working: 0 },
        ready: raw?.ready ?? [],
        today: raw?.today ?? { learned: [], fuzzy: [], touched: 0 }
      };
      setComp(data);
      const prev = compPrevRef.current;
      const order: Record<string, number> = { working_on_it: 0, practiced: 1, landed: 2 };
      if (prev) {
        // Their trial's very first verified win is the First Star.
        const hadWinBefore = [...prev.values()].some((s) => s === "practiced" || s === "landed");
        for (const c of data.concepts) {
          const before = prev.get(c.key) ?? "working_on_it";
          if (order[c.state] <= order[before]) continue;
          if (c.state !== "practiced" && c.state !== "landed") continue;
          // Check the session cap BEFORE claiming: claimOnce is permanent, so
          // claiming a celebration we then suppress would burn it forever and
          // it could never fire in a later session.
          if (!canFire(c.state)) continue;
          if (!claimOnce(`${scope}:win:${c.key}:${c.state}`)) continue;
          const isTrial = subscriptionRef.current?.plan === "trial";
          const copy =
            c.state === "landed"
              ? landedCopy(c.label)
              : !hadWinBefore && isTrial && claimOnce(`${scope}:first-star`)
              ? firstStarCopy(c.label)
              : practicedCopy(c.label);
          pushCelebration({ tone: c.state === "landed" ? "landed" : "practiced", ...copy, conceptKey: c.key });
          // Glow this chip briefly, then clear the marker so it does not read as
          // a "fresh win" on later renders.
          setGlowKeys((k) => (k.includes(c.key) ? k : [...k, c.key]));
          const key = c.key;
          setTimeout(() => setGlowKeys((k) => k.filter((x) => x !== key)), 2000);
        }
      }
      compPrevRef.current = new Map(data.concepts.map((c) => [c.key, c.state]));
    } catch {
      // A progress read must never disrupt studying: fail silent.
    }
  }, [scope]);

  // Refresh the read after every answer (the server records the verdict just
  // AFTER responding, so refetch once more shortly after).
  useEffect(() => {
    if (!account || dataLoading) return;
    loadComprehension();
    const t = setTimeout(loadComprehension, 3500);
    return () => clearTimeout(t);
  }, [account?.id, dataLoading, understandingKey, loadComprehension]);

  // Lifetime stats + notebook totals, once per sign-in; and read today's
  // Ready-to-Land dismissal from storage.
  useEffect(() => {
    if (!account) return;
    const myAcct = account.id;
    // A fresh sign-in starts from a clean slate: no baseline, counters, pending
    // celebrations, glow, or session flags may carry across accounts (two
    // siblings sharing one phone must never see each other's wins or streak).
    compPrevRef.current = null;
    chapterCountsRef.current = null;
    celebrationQueue.current = [];
    celebrationActiveRef.current = false;
    setComp({ enabled: true, concepts: [], summary: { landed: 0, practiced: 0, working: 0 }, ready: [], today: { learned: [], fuzzy: [], touched: 0 } });
    setCelebration(null);
    setGlowKeys([]);
    setStats(null);
    setSavedCount(null);
    setSentThisSession(false);
    setRtlState("idle");
    setCheckNudgeDismissed(false);
    api.getMeStats().then((s) => { if (accountIdRef.current === myAcct) setStats(s); }).catch(() => {});
    api
      .getNotebook()
      .then((s) => {
        if (accountIdRef.current !== myAcct) return;
        setSavedCount(s.savedCount);
        chapterCountsRef.current = s.subjects
          ? new Map(s.subjects.flatMap((sub) => sub.chapters.map((ch) => [`${sub.subject}|${ch.chapter}`, ch.count] as [string, number])))
          : null;
      })
      .catch(() => {});
    try {
      setRtlDismissed(localStorage.getItem(`${scope}:rtl-dismiss`) === utcDayClient());
    } catch {
      setRtlDismissed(false);
    }
  }, [account?.id]);

  /** After a successful answer: light the lamp on the day's first ask, count
   *  the doubt, and fire any milestone that number just crossed. */
  const onAnswered = (text: string, opts?: { silent?: boolean }) => {
    // A silent send (a "Go deeper" dive) persists NO user message, so the
    // server's day/doubt counts never see it. Counting it optimistically here
    // would light the lamp and bump daysActive, then visibly shrink on the next
    // reload, breaking the "it never subtracts" promise. So silent sends are
    // inert for the streak and the doubt counter alike.
    if (opts?.silent) return;
    const s = statsRef.current;
    if (!s) return; // stats unknown: show nothing rather than invent numbers
    let next = s;
    if (!s.activeToday) {
      next = { ...next, activeToday: true, daysActive: s.daysActive + 1 };
      showToast(lampGreeting(next.daysActive));
    }
    // The "Still fuzzy?" sentinel is a retry signal, not a fresh doubt (the
    // server excludes it too), so it lights the lamp but never counts a doubt.
    const isRealAsk = Boolean(text.trim()) && text !== STILL_CONFUSED_PROMPT;
    if (isRealAsk) {
      next = { ...next, doubtsCleared: next.doubtsCleared + 1 };
      const n = next.doubtsCleared;
      if (DOUBT_MILESTONES.includes(n) && canFire("milestone") && claimOnce(`${scope}:milestone-doubts:${n}`)) {
        pushCelebration({ tone: "milestone", ...doubtsMilestoneCopy(n) });
      }
    }
    if (next !== s) setStats(next);
  };

  // ---- Ready to Land handlers ----------------------------------------------
  const handleReadyDismiss = () => {
    try {
      localStorage.setItem(`${scope}:rtl-dismiss`, utcDayClient());
    } catch {
      /* ignore */
    }
    setRtlDismissed(true);
  };

  const handleReadyConfirm = async (c: ReadyConcept) => {
    if (rtlState === "loading") return;
    setRtlState("loading");
    try {
      // Ensure a conversation exists to carry the check (mirrors handleSendMessage).
      let convId = activeId;
      if (!convId) {
        const { conversation } = await api.createConversation();
        setConversations((prev) => [conversation, ...prev.filter((cv) => cv.id !== conversation.id)]);
        setActiveId(conversation.id);
        setChatHistory([]);
        convId = conversation.id;
      }
      const { question } = await api.confirmCheck({
        conversationId: convId,
        conceptKey: c.key,
        grade: profile.grade,
        board: profile.board,
        language: profile.language
      });
      const msg: ChatMessage = {
        id: `model-confirm-${Date.now()}`,
        role: "model",
        text: question,
        timestamp: new Date().toLocaleTimeString()
      };
      // convId is the active conversation by construction (either it already
      // was, or we just created and activated it), so the bubble goes straight
      // into the on-screen thread.
      setChatHistory((prev) => [...prev, msg]);
      api.addMessage(convId, msg).catch(() => {});
      bumpConversation(convId);
      setRtlState("posed");
      document.getElementById("input-chat")?.focus();
    } catch (e: any) {
      setRtlState("idle");
      showToast(e?.message || "Could not prepare a check just now. Please try again in a moment. 🌱");
    }
  };

  // Add chapter
  const [newChapterName, setNewChapterName] = useState("");
  const [isAddingChapter, setIsAddingChapter] = useState(false);

  // Profile edit
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileForm, setEditProfileForm] = useState<StudentProfile>({ ...profile });

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  // Live view of the open conversation, readable inside long-lived stream
  // callbacks: an in-flight answer must never paint into a different chat.
  const activeIdRef = useRef<string | null>(null);
  useEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);

  // Track text selection inside answer bubbles. When a student highlights the
  // exact lines that made something click, a save bar appears (free selection
  // by design: a whole block would drag the filler back in at revision time).
  useEffect(() => {
    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) return setSelSave(null);
      const text = sel.toString().trim();
      if (!text) return setSelSave(null);
      const answerBodyOf = (n: Node | null | undefined) => {
        const el = n instanceof Element ? n : n?.parentElement;
        return el?.closest?.("[data-answer-body]") || null;
      };
      // BOTH ends of the selection must sit inside the SAME answer body: a
      // drag across two bubbles, or over buttons/sources/status chrome, must
      // never become a saved "point".
      const anchorBody = answerBodyOf(sel.anchorNode);
      const focusBody = answerBodyOf(sel.focusNode);
      if (!anchorBody || anchorBody !== focusBody) return setSelSave(null);
      const bubble = anchorBody.closest('[id^="msg-bubble-"]');
      if (!bubble) return setSelSave(null);
      setSelSave({ msgId: bubble.id.replace("msg-bubble-", ""), text: text.slice(0, 4000) });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () => document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  // Save the selected lines to the Pre-exam notebook. Saving is open to every
  // plan (viewing is gated); the AI files the point by subject and chapter.
  const [savingSelection, setSavingSelection] = useState(false);
  const saveSelectionToNotebook = async (explicitMsgId?: string) => {
    if (savingSelection) return; // a double tap must never save twice
    const target = selSave && (!explicitMsgId || selSave.msgId === explicitMsgId) ? selSave : null;
    if (!target) {
      showToast("Select the lines you like in the answer first, then tap Save lines.");
      return;
    }
    const idx = chatHistory.findIndex((m) => m.id === target.msgId);
    const msg = chatHistory[idx];
    if (!msg || msg.role !== "model") {
      showToast("Select lines inside an answer to save them.");
      return;
    }
    // Never save a draft the examiner is still reviewing: the corrected final
    // answer replaces it, and a wrong fact must not enter the revision shelf.
    if (msg.streaming || msg.verification === "checking") {
      showToast("One moment: Deep-check is still reviewing this answer. Save once it settles.");
      return;
    }
    // Snapshot taken; clear synchronously so repeat taps have nothing to save.
    setSavingSelection(true);
    setSelSave(null);
    window.getSelection()?.removeAllRanges();
    try {
      await api.saveNotebookEntry({
        text: target.text,
        question: questionBefore(idx),
        messageId: msg.id,
        conversationId: activeId || undefined
      });
      // Accumulation you can feel: the +1 flies into the notebook, the count
      // ticks, and every save states the payoff (all in one place on exam day).
      // Only claim a running total when the true count is known: showing "1
      // point saved" to a student who already has 30 (summary not yet loaded)
      // would be wrong, so fall back to a count-free line and skip milestones
      // until the authoritative refetch below settles the real total.
      flyToNotebook(document.getElementById("btn-save-selection") || document.getElementById(`btn-savelines-${msg.id}`));
      if (savedCount !== null) {
        const n = savedCount + 1;
        setSavedCount(n);
        showToast(savedToast(n));
        if (SAVE_MILESTONES.includes(n) && canFire("milestone") && claimOnce(`${scope}:milestone-saves:${n}`)) {
          pushCelebration({ tone: "milestone", ...savesMilestoneCopy(n) });
        }
      } else {
        showToast("Saved to your Pre-exam notebook. It files itself under the right chapter.");
      }
      // The AI files the point under its chapter asynchronously: refresh the
      // shelf shortly after and fire any sheet threshold a chapter crossed.
      const savedForAcct = accountIdRef.current;
      setTimeout(async () => {
        try {
          const s = await api.getNotebook();
          if (accountIdRef.current !== savedForAcct) return; // signed out/in meanwhile
          setSavedCount(s.savedCount);
          const next = s.subjects
            ? new Map(s.subjects.flatMap((sub) => sub.chapters.map((ch) => [`${sub.subject}|${ch.chapter}`, ch.count] as [string, number])))
            : null;
          const prevCounts = chapterCountsRef.current;
          if (next && prevCounts) {
            for (const [key, cnt] of next) {
              const before = prevCounts.get(key) ?? 0;
              for (const t of SHEET_THRESHOLDS) {
                if (before < t && cnt >= t && canFire("sheet") && claimOnce(`${scope}:sheet:${key}:${t}`)) {
                  const [subj, chap] = key.split("|");
                  pushCelebration({ tone: "sheet", ...sheetCopy(subj, chap, t) });
                }
              }
            }
          }
          if (next) chapterCountsRef.current = next;
        } catch {
          /* the shelf read is a bonus, never an error surface */
        }
      }, 6000);
    } catch (e: any) {
      showToast(e?.message || "Could not save that. Please select the lines again and retry.");
    } finally {
      setSavingSelection(false);
    }
  };

  /** The saved line flies as a "+1" pill from the save button into the
   *  notebook icon, which bounces once. Pure DOM + CSS; skipped entirely
   *  under reduced motion or when either end is not on screen. */
  const flyToNotebook = (fromEl: HTMLElement | null) => {
    try {
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      // Desktop header icon when visible, else the mobile nav's Notebook tab.
      const target =
        (document.getElementById("btn-notebook")?.offsetParent ? document.getElementById("btn-notebook") : null) ||
        document.getElementById("tab-notebook");
      const from = fromEl?.getBoundingClientRect();
      const to = target?.getBoundingClientRect();
      if (!from || !to || !target) return;
      const el = document.createElement("div");
      el.className = "cfy-fly";
      el.textContent = "+1";
      el.style.left = `${from.left + from.width / 2}px`;
      el.style.top = `${from.top}px`;
      document.body.appendChild(el);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.style.transform = `translate(${to.left + to.width / 2 - (from.left + from.width / 2)}px, ${to.top + to.height / 2 - from.top}px) scale(0.4)`;
          el.style.opacity = "0";
        })
      );
      setTimeout(() => {
        el.remove();
        target.classList.add("cfy-bounce");
        setTimeout(() => target.classList.remove("cfy-bounce"), 700);
      }, 820);
    } catch {
      /* decoration only: never let it break a save */
    }
  };

  // Load profile, study log, conversations, and the active chat for the user.
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    loadedRef.current = false;
    setDataLoading(true);
    setProfile(account.profile);
    setChapters(account.chapters || []);

    (async () => {
      try {
        const { conversations } = await api.listConversations(); // backend guarantees ≥1
        if (cancelled) return;
        setConversations(conversations);
        const first = conversations[0]?.id || null;
        setActiveId(first);
        if (first) {
          const { messages } = await api.getMessages(first);
          if (!cancelled) setChatHistory(messages);
        } else {
          setChatHistory([]);
        }
      } catch (err) {
        console.error("Failed to load your study data:", err);
      } finally {
        if (!cancelled) {
          setDataLoading(false);
          loadedRef.current = true;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [account?.id]);

  // Debounced save of profile + study log.
  useEffect(() => {
    if (!account || !loadedRef.current) return;
    const t = setTimeout(() => {
      api.updateMe({ ...profile, chapters }).catch((e) => console.error("Save failed:", e));
    }, 700);
    return () => clearTimeout(t);
  }, [profile, chapters, account?.id]);

  // Auto-scroll on new messages, but during streaming (same message count,
  // growing text) only follow when the student is already near the bottom, so
  // they can scroll up and re-read without being yanked back every token.
  const prevMsgCount = useRef(0);
  useEffect(() => {
    const el = messagesRef.current;
    const countChanged = chatHistory.length !== prevMsgCount.current;
    prevMsgCount.current = chatHistory.length;
    // An empty thread shows the arrival state; keep it pinned to the top so the
    // greeting and monogram stay in view instead of being scrolled past.
    if (chatHistory.length === 0) {
      el?.scrollTo({ top: 0 });
      return;
    }
    if (!el || countChanged) {
      chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
    if (nearBottom) chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [chatHistory, isGenerating]);

  useEffect(() => {
    // Clean up legacy device-local diagram cache from the removed Illustrator.
    localStorage.removeItem("faheem_images");
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  // ---- Conversation management ----
  const openConversation = async (id: string) => {
    setMobileView("chat");
    if (id === activeId) return;
    setActiveId(id);
    setInputText("");
    setAttachments([]);
    try {
      const { messages } = await api.getMessages(id);
      setChatHistory(messages);
    } catch (e) {
      console.error("Could not open conversation:", e);
      setChatHistory([]);
    }
  };

  const creatingChatRef = useRef(false);
  const handleNewChat = async () => {
    // A button-mashing kid should get ONE new chat, not five: guard the
    // in-flight create, and reuse an existing empty chat instead of stacking
    // "New chat" rows in the study log.
    if (creatingChatRef.current) return;
    const existingEmpty = conversations.find((c) => (c.messageCount ?? 0) === 0);
    if (existingEmpty) {
      setActiveId(null);
      openConversation(existingEmpty.id);
      setInputText("");
      setAttachments([]);
      setMobileView("chat");
      return;
    }
    creatingChatRef.current = true;
    try {
      const { conversation } = await api.createConversation();
      setConversations((prev) => [conversation, ...prev]);
      setActiveId(conversation.id);
      setChatHistory([]);
      setInputText("");
      setAttachments([]);
      setMobileView("chat");
    } catch (e) {
      console.error("Could not start a new chat:", e);
      showToast("Could not start a new chat. Please try once more. 🌱");
    } finally {
      creatingChatRef.current = false;
    }
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    // A 13px icon sits right next to the row a kid taps to open a chat: one
    // slip must not silently erase their study history.
    const doomed = conversations.find((c) => c.id === id);
    const label = doomed?.title && doomed.title !== "New chat" ? `“${doomed.title}”` : "this chat";
    if (!window.confirm(`Delete ${label}? Its messages go away for good (saved notebook lines stay).`)) return;
    const remaining = conversations.filter((c) => c.id !== id);
    setConversations(remaining);
    api.deleteConversation(id).catch(() => {});
    if (activeId === id) {
      if (remaining.length > 0) {
        setActiveId(null); // force openConversation to reload
        openConversation(remaining[0].id);
      } else {
        handleNewChat();
      }
    }
  };

  // Float the active conversation to the top after a new message.
  const bumpConversation = (id: string, patch: Partial<Conversation> = {}) => {
    setConversations((prev) => {
      const item = prev.find((c) => c.id === id);
      if (!item) return prev;
      const updated = { ...item, ...patch, updatedAt: new Date().toISOString() };
      return [updated, ...prev.filter((c) => c.id !== id)];
    });
  };

  // ---- File upload ----
  const handleFilesPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    const next = await filesToAttachments(files);
    setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const imageFiles = Array.from(e.clipboardData.files || []).filter((f) => f.type.startsWith("image/"));
    if (!imageFiles.length) return;
    e.preventDefault();
    const next = await filesToAttachments(imageFiles);
    setAttachments((prev) => [...prev, ...next].slice(0, MAX_ATTACHMENTS));
  };

  const removeAttachment = (idx: number) => setAttachments((prev) => prev.filter((_, i) => i !== idx));

  // ---- Send a message ----
  // opts.deep: ask for the full study view (exam-ready answer + notebook).
  // opts.silent: don't add a user bubble (the Deep understanding button
  // re-asks a question that is already on screen).
  const handleSendMessage = async (
    textToSend?: string,
    opts?: { deep?: boolean; silent?: boolean; convId?: string; freshChat?: boolean; deepSourceId?: string }
  ) => {
    const text = (textToSend ?? inputText).trim();
    const atts = opts?.silent ? [] : attachments;
    // sendingRef guards synchronously: React state (isGenerating) settles a
    // tick later, so a fast double-tap could fire two sends and charge two
    // credits before the button ever disabled.
    if ((!text && atts.length === 0) || isGenerating || sendingRef.current) return;
    sendingRef.current = true;
    // The student engaged with a question: the Ready-to-Land card belongs to
    // the fresh open only, so it steps aside for the rest of this session.
    setSentThisSession(true);
    // Set inside finalize (success only): drives the lamp + doubt counters.
    let answeredOk = false;
    let paywalled = false;
    // No open conversation (the list failed to load, or was emptied): create
    // one on the spot instead of silently swallowing the student's question.
    let convId = opts?.convId ?? activeId;
    if (!convId) {
      try {
        const { conversation } = await api.createConversation();
        setConversations((prev) => [conversation, ...prev.filter((c) => c.id !== conversation.id)]);
        setActiveId(conversation.id);
        setChatHistory([]);
        convId = conversation.id;
      } catch {
        sendingRef.current = false;
        showToast("Could not reach your study log. Check your internet and try again. 🌱");
        return;
      }
    }
    // freshChat: the caller just opened a brand-new conversation this same
    // tick, so the chatHistory closure may still show the previous thread.
    const isFirstMessage = opts?.freshChat === true || chatHistory.length === 0;
    const deep = opts?.deep === true;

    // Conservative pre-send gate: block instantly only for the case the client
    // can be SURE costs a credit, a brand-new thread with no quota left. A NEW
    // doubt raised mid-thread also costs a credit, but only the server's
    // classifier can tell it from a free same-doubt follow-up, so those go
    // through and the server returns the paywall if the student is out (see
    // handlePaywall). Deep dives and re-explains never cost a credit.
    const isNewQuestion = isFirstMessage && !deep && (Boolean(text) || atts.length > 0);
    if (isNewQuestion && !canAskNew(subscription)) {
      // Release the synchronous send guard before bailing: this early return is
      // BEFORE the try/finally that normally clears it, so without this the ref
      // would stay latched and silently block every future send until reload.
      sendingRef.current = false;
      // Heal a stale snapshot too (e.g. the plan was activated on another
      // device or by the payment webhook): the refreshed usage re-renders the
      // modal's status line, and the next attempt passes if access returned.
      refreshSubscription().catch(() => {});
      setUpgradeReason(blockedReason(subscription));
      setShowUpgrade(true);
      return;
    }

    let userMsgId: string | null = null;
    if (!opts?.silent) {
      setInputText("");
      setAttachments([]);

      userMsgId = `user-${Date.now()}`;
      const userMsg: ChatMessage = {
        id: userMsgId,
        role: "user",
        text,
        timestamp: new Date().toLocaleTimeString(),
        attachments: atts
      };

      setChatHistory((prev) => [...prev, userMsg]);
      api.addMessage(convId, userMsg).catch(() => {});

      // Name the chat after its first message.
      if (isFirstMessage && text) {
        const title = text.length > 48 ? text.slice(0, 48) + "…" : text;
        bumpConversation(convId, { title, messageCount: 1 });
        api.renameConversation(convId, title).catch(() => {});
      } else {
        bumpConversation(convId);
      }
    }

    setIsGenerating(true);

    // Streaming draft bubble: grows with each delta, then is REPLACED by the
    // authoritative final answer from the "done" event (with Deep-check on,
    // that final text is the examiner-corrected version of the draft).
    const streamId = `model-stream-${Date.now()}`;
    // Whether a streaming draft ever appeared: it decides the answer's id
    // (the draft's, kept in place on the final swap) vs the message's own,
    // on screen AND in the study log, which must match (see finalize).
    let draftShown = false;
    const patchStream = (patch: Partial<ChatMessage> | ((m: ChatMessage) => ChatMessage)) =>
      setChatHistory((prev) =>
        prev.map((m) => (m.id === streamId ? (typeof patch === "function" ? patch(m) : { ...m, ...patch }) : m))
      );

    // The student ran out of trial / quota: refresh the usage, open the plan
    // chooser, and fully unwind the blocked ask: bubbles off the screen, the
    // optimistically saved message deleted server-side (an orphan would make
    // the next ask in this thread look like a free follow-up), the auto-title
    // reverted, and the typed question handed back to the input box.
    const handlePaywall = (sub: Subscription | undefined, message: string) => {
      paywalled = true;
      if (sub) applySubscription(sub);
      else refreshSubscription();
      setUpgradeReason(message || blockedReason(sub));
      setShowUpgrade(true);
      if (activeIdRef.current === convId) {
        setChatHistory((prev) => prev.filter((m) => m.id !== streamId && m.id !== userMsgId));
        if (!opts?.silent && text) setInputText(text);
      }
      if (userMsgId) {
        api.deleteMessage(convId, userMsgId).catch(() => {});
        if (isFirstMessage && text) {
          bumpConversation(convId, { title: "New chat", messageCount: 0 });
          api.renameConversation(convId, "New chat").catch(() => {});
        }
      }
    };

    try {
      // Deep requests go with a clean history: the notebook is self-contained,
      // and a history-free request is cacheable, so one student's notebook
      // becomes every student's instant notebook.
      const serverHistory = deep ? [] : chatHistory.slice(-10).map((m) => ({ role: m.role, text: m.text }));
      const images = atts.map((a) => ({ data: dataUrlToBase64(a.dataUrl), mimeType: a.mimeType }));
      // The student's study log personalizes the answer: weak chapters first
      // (they need the connection most), then the most recently studied. The
      // backend keeps personalized answers out of the shared cache.
      const recentTopics = [...chapters]
        .sort((a, b) => {
          const weakFirst = Number(a.mastery === "weak" ? 0 : 1) - Number(b.mastery === "weak" ? 0 : 1);
          return weakFirst !== 0 ? weakFirst : (b.lastStudied || "").localeCompare(a.lastStudied || "");
        })
        .slice(0, 6)
        .map((ch) => `${ch.name}${ch.mastery === "weak" ? " (finding it hard)" : ""}`);
      const baseBody = {
        message: text,
        history: serverHistory,
        board: profile.board,
        grade: profile.grade,
        language: profile.language,
        preferredAnalogy: profile.preferredAnalogy,
        recentTopics,
        deep,
        images,
        // Lets the backend key the Landing Signal's posed-check state per chat.
        conversationId: convId
      };

      // The answer always persists to its own conversation, but only paints
      // into local state while that conversation is still the one on screen
      // (it reloads from the server if the student comes back later).
      const finalize = (raw: ChatMessage) => {
        answeredOk = true;
        // The answer keeps the streaming draft's id on screen (the in-place
        // swap below), so it must persist under that SAME id: every later
        // id-keyed operation (the Deep-check re-save upsert, a deepFor link
        // from a "Go deeper" tap) targets the on-screen id, and a mismatched
        // persisted id would leave it dangling after a reload. A notebook also
        // carries the pointer to the answer it deepens, right on the message.
        const msg: ChatMessage = {
          ...raw,
          id: draftShown ? streamId : raw.id,
          ...(opts?.deepSourceId ? { deepFor: opts.deepSourceId } : {})
        };
        if (activeIdRef.current === convId) {
          // If a streaming draft is already on screen, swap its content in
          // place (keeping its id) so the completed answer settles once and
          // does not fade out and re-rise on the draft-to-final swap. Only a
          // genuine first appearance (image path, stream skipped) animates in.
          setChatHistory((prev) =>
            prev.some((m) => m.id === streamId)
              ? prev.map((m) => (m.id === streamId ? msg : m))
              : [...prev.filter((m) => m.id !== streamId), msg]
          );
        }
        api.addMessage(convId, msg).catch(() => {});
      };

      // Try streaming first. Text-only, and not for explicit Search mode: the
      // server would just answer "fallback" while charging a rate-limit token.
      // (Auto-routed search from Standard is still caught server-side.)
      // Deltas are buffered and painted at most every 80ms: per-token
      // setChatHistory re-renders the whole workspace and re-parses the
      // growing draft, which chokes low-end phones (the primary audience).
      let streamResult: Awaited<ReturnType<typeof api.chatStream>> | null = null;
      let pendingDelta = "";
      let deltaTimer: ReturnType<typeof setTimeout> | null = null;
      const flushDelta = () => {
        if (deltaTimer) clearTimeout(deltaTimer);
        deltaTimer = null;
        const chunk = pendingDelta;
        pendingDelta = "";
        if (!chunk || activeIdRef.current !== convId) return;
        draftShown = true;
        setChatHistory((prev) => {
          if (prev.some((m) => m.id === streamId)) {
            return prev.map((m) => (m.id === streamId ? { ...m, text: m.text + chunk } : m));
          }
          const bubble: ChatMessage = {
            id: streamId,
            role: "model",
            text: chunk,
            timestamp: new Date().toLocaleTimeString(),
            streaming: true
          };
          return [...prev, bubble];
        });
      };
      if (images.length === 0) {
        try {
          streamResult = await api.chatStream(
            baseBody,
            (chunk) => {
              if (activeIdRef.current !== convId) return;
              pendingDelta += chunk;
              if (!deltaTimer) deltaTimer = setTimeout(flushDelta, 80);
            },
            () => {
              flushDelta();
              patchStream({ verification: "checking", streaming: false });
            }
          );
        } catch (streamErr: any) {
          console.warn("Streaming failed, retrying on /chat:", streamErr?.message || streamErr);
          streamResult = { kind: "fallback", reason: "stream-failed" };
        }
        // Whatever streamed is on screen before anything else happens; no
        // trailing timer may fire after the draft-to-final swap below.
        flushDelta();
      }

      // The stream reported the student is out of trial / quota: stop here and
      // show the plan chooser (do NOT fall back to /chat, which would re-block).
      if (streamResult && streamResult.kind === "paywall") {
        handlePaywall(streamResult.subscription, streamResult.error);
        return;
      }

      if (streamResult && streamResult.kind === "done") {
        finalize({
          id: `model-${Date.now()}`,
          role: "model",
          text: streamResult.text,
          timestamp: new Date().toLocaleTimeString(),
          sources: streamResult.sources || [],
          verification: streamResult.verification
        });
      } else {
        // Plain /chat: the proven whole-answer path (also the stream's safety
        // net). Same Gemini brain either way, so a failed stream just retries
        // as a whole answer.
        const data = await api.chat(baseBody);
        finalize({
          id: `model-${Date.now()}`,
          role: "model",
          text: data.text,
          timestamp: new Date().toLocaleTimeString(),
          sources: data.sources || [],
          verification: data.verification
        });
      }

      // The server is the authority on whether this ask cost a credit: a NEW
      // doubt raised mid-thread is charged there too, and only its classifier
      // knows. So always pull the true usage, never trust the client's guess,
      // and the "questions left" pill drops for every distinct topic asked.
      refreshSubscription().catch(() => {});
    } catch (error: any) {
      // Out of trial / quota on the /chat path: show the plan chooser, not an error.
      if (error instanceof ApiError && error.code === "payment_required") {
        handlePaywall(error.subscription, error.message);
        return;
      }
      console.error(error);
      // Errors surface only in the conversation that asked the question.
      if (activeIdRef.current === convId) {
        const errorMsg: ChatMessage = {
          id: `err-${Date.now()}`,
          role: "model",
          text: "I could not finish that one just now. This is on my side, not yours. Give it a moment and ask me again, and I will pick it right back up.",
          timestamp: new Date().toLocaleTimeString(),
          isError: true
        };
        setChatHistory((prev) => [...prev.filter((m) => m.id !== streamId), errorMsg]);
      }
    } finally {
      sendingRef.current = false;
      setIsGenerating(false);
      // Refresh the understanding read unless the send was paywalled (a
      // blocked ask produces no verdict). An errored send still refetches:
      // the server may have recorded a verdict before the client-side
      // failure, and a mastery moment must not wait for the next open.
      if (!paywalled) setUnderstandingKey((k) => k + 1);
      // A real answer arrived: light the lamp on the day's first ask and
      // count the doubt toward its lifetime milestones.
      if (answeredOk) onAnswered(text, opts);
    }
  };

  // ---- Chapters ----
  // A chapter-mastery study session ALWAYS opens in its own fresh chat: the
  // deep notebook is a self-contained lesson and must never land mid-thread
  // inside whatever doubt happens to be open. Reuses an empty "New chat" row
  // if one exists, otherwise creates one, then sends the study request into
  // exactly that conversation.
  const startChapterStudy = async (chapterName: string) => {
    if (isGenerating || sendingRef.current) return;
    let convId: string;
    const existingEmpty = conversations.find((c) => (c.messageCount ?? 0) === 0);
    if (existingEmpty) {
      convId = existingEmpty.id;
      setActiveId(existingEmpty.id);
      setChatHistory([]);
    } else {
      try {
        const { conversation } = await api.createConversation();
        setConversations((prev) => [conversation, ...prev.filter((c) => c.id !== conversation.id)]);
        setActiveId(conversation.id);
        setChatHistory([]);
        convId = conversation.id;
      } catch {
        showToast("Could not open a fresh chat for this chapter. Check your internet and try again. 🌱");
        return;
      }
    }
    setMobileView("chat");
    await handleSendMessage(`Teach me "${chapterName}" in depth.`, { deep: true, convId, freshChat: true });
  };

  const handleAddChapter = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newChapterName.trim()) return;
    const newCh: ChapterProgress = {
      id: `ch-${Date.now()}`,
      name: newChapterName,
      mastery: "developing",
      confidenceScore: 50,
      lastStudied: new Date().toISOString().split("T")[0]
    };
    setChapters((prev) => [newCh, ...prev]);
    setNewChapterName("");
    setIsAddingChapter(false);
    startChapterStudy(newCh.name);
  };

  const handleUpdateMastery = (id: string, newMastery: "weak" | "developing" | "strong") => {
    const score = newMastery === "strong" ? 85 : newMastery === "weak" ? 25 : 50;
    setChapters((prev) => prev.map((ch) => (ch.id === id ? { ...ch, mastery: newMastery, confidenceScore: score } : ch)));
  };

  const handleDeleteChapter = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setChapters((prev) => prev.filter((ch) => ch.id !== id));
  };

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    setProfile(editProfileForm);
    setIsEditingProfile(false);
  };

  const selectSuggestedPrompt = (prompt: string) => {
    setInputText(prompt);
    setMobileView("chat");
  };

  // The user question a model answer replied to (feeds deep dives and checks).
  // Skips the one-tap "still fuzzy" signal so a deep dive lands on the real topic.
  const questionBefore = (idx: number): string => {
    for (let i = idx - 1; i >= 0; i--) {
      const m = chatHistory[i];
      if (m.role === "user" && m.text.trim() && m.text !== STILL_CONFUSED_PROMPT) return m.text;
    }
    return chatHistory[idx]?.text.slice(0, 200) || "";
  };

  // Deep understanding applies to teaching answers that are not already the
  // notebook and not live-search results.
  const canGoDeep = (message: ChatMessage): boolean =>
    message.text.length > 200 &&
    !(message.sources && message.sources.length > 0) &&
    parseTeachingSections(message.text).sections.length === 0;

  // "Go deeper" is one-shot per answer: the first tap generates the notebook,
  // later taps scroll back to it. Regenerating would only re-serve the same
  // cached notebook and stack a duplicate at the bottom of the thread.
  const openDeepDive = (msgIdx: number, message: ChatMessage) => {
    const existingId = deepDiveOf[message.id];
    if (existingId) {
      document.getElementById(`msg-bubble-${existingId}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    handleSendMessage(questionBefore(msgIdx), { deep: true, silent: true, deepSourceId: message.id });
  };

  // ---- On-demand Deep-check: examiner pass over an existing answer ----
  const handleDeepCheck = async (msg: ChatMessage, question: string) => {
    if (!activeId || isGenerating) return;
    const convId = activeId;
    setChatHistory((prev) => prev.map((m) => (m.id === msg.id ? { ...m, verification: "checking" } : m)));
    try {
      const data = await api.deepCheck({ question, text: msg.text });
      if (activeIdRef.current === convId) {
        setChatHistory((prev) => prev.map((m) => (m.id === msg.id ? { ...m, text: data.text, verification: data.verification } : m)));
      }
      // Re-save under the same id so the study log keeps the corrected answer.
      // deepFor rides along: if the original save was lost (flaky network),
      // this re-save CREATES the row, and the deep-dive link must not be
      // dropped with it (the upsert only backfills it, never overwrites).
      api.addMessage(convId, { id: msg.id, role: "model", text: data.text, sources: msg.sources || [], deepFor: msg.deepFor }).catch(() => {});
    } catch (e) {
      console.error("Deep-check failed:", e);
      if (activeIdRef.current === convId) {
        setChatHistory((prev) => prev.map((m) => (m.id === msg.id ? { ...m, verification: "unavailable" } : m)));
      }
    }
  };

  const renderMessageContent = (message: ChatMessage) => {
    // While a draft is streaming in, render it as plain markdown; the tabbed
    // notebook appears once the final answer lands (no mid-stream reshuffle),
    // and diagrams hold a placeholder so Mermaid never parses a partial chart.
    if (message.streaming) return <Markdown streaming>{message.text}</Markdown>;
    const { preamble, sections } = parseTeachingSections(message.text);
    if (sections.length > 0) {
      // The Exam-Ready Answer (preamble) renders in full above the tabbed notebook.
      return (
        <>
          {preamble && (
            <div className="mb-4 pb-3 border-b border-editorial-line-light">
              <div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-editorial-sage">
                <span className="h-px w-4 bg-editorial-sage/50" />
                Exam-ready answer
              </div>
              <Markdown>{preamble}</Markdown>
            </div>
          )}
          <NotebookViewer sections={sections} />
        </>
      );
    }
    return <Markdown>{message.text}</Markdown>;
  };

  // --- Gated rendering ---
  if (authLoading || (account && dataLoading)) {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-5 bg-editorial-ivory text-editorial-charcoal px-6 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-editorial-sage motion-safe:animate-[faheem-breathe_2.2s_ease-in-out_infinite]">
          <span lang="ar" className="fhm-arabic text-2xl leading-none text-editorial-ivory">ف</span>
        </div>
        <div>
          <p className="text-sm font-medium text-editorial-sage">Preparing your study desk</p>
          <p className="mt-1 text-xs text-editorial-charcoal/60">One moment. Your notebook and study log are loading.</p>
        </div>
      </div>
    );
  }

  if (!account) {
    return (
      <Suspense
        fallback={
          <div className="flex min-h-[100dvh] items-center justify-center bg-night">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-editorial-sage">
              <span lang="ar" className="fhm-arabic text-2xl leading-none text-editorial-ivory">ف</span>
            </div>
          </div>
        }
      >
        <Landing />
      </Suspense>
    );
  }

  return (
    <MotionConfig reducedMotion="user">
    <div className="h-[100dvh] bg-editorial-ivory text-editorial-charcoal font-sans flex flex-col antialiased">
      {/* Header */}
      <nav className="flex justify-between items-center px-4 py-3 md:px-8 border-b border-editorial-line bg-editorial-ivory">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-[2px] bg-editorial-sage flex items-center justify-center shrink-0">
            <span lang="ar" className="fhm-arabic text-lg leading-none" style={{ color: "var(--color-editorial-ivory)" }}>ف</span>
          </div>
          <span className="kod-display hidden sm:inline text-xl tracking-tight text-editorial-charcoal">Faheem</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden md:block text-xs text-editorial-charcoal/70 mr-1">
            {profile.name} · {profile.board}
          </span>
          {/* The lamp: lifetime days you showed up. It only ever grows; an
              unlit lamp is an invitation, never a loss. */}
          {stats && stats.daysActive > 0 && (
            <div
              title={lampTitle(stats.daysActive, stats.activeToday)}
              className="flex items-center gap-1 px-2.5 h-9 rounded-full border border-editorial-line text-xs text-editorial-charcoal/80 shrink-0 select-none"
              id="lamp-badge"
            >
              <Flame size={13} className={stats.activeToday ? "text-amber-500 fill-amber-400 cfy-lamp-lit" : "text-editorial-charcoal/30"} />
              <span className="tabular-nums">{stats.daysActive}</span>
            </div>
          )}
          <UsagePill
            subscription={subscription}
            onClick={() => {
              setUpgradeReason("");
              setShowUpgrade(true);
            }}
          />
          <ThemeToggle className="!h-9 !w-9 shrink-0" />
          <button
            onClick={() => setNotebookOpen(true)}
            title="Pre-exam notebook"
            aria-label="Pre-exam notebook"
            /* Below lg the bottom nav carries a Notebook tab, so this header
               button would be a redundant, crowding duplicate: show it only on
               desktop where there is no bottom nav. */
            className="w-9 h-9 rounded-full border border-editorial-line hidden lg:flex items-center justify-center text-editorial-charcoal/60 hover:bg-editorial-stone hover:text-editorial-sage transition-all cursor-pointer shrink-0"
            id="btn-notebook"
          >
            <BookMarked size={15} />
          </button>
          <button
            onClick={() => {
              setEditProfileForm({ ...profile });
              setIsEditingProfile(true);
            }}
            title="Change your board, class, language, or study style"
            className="flex items-center gap-2 px-3 md:px-4 py-2 rounded-full border border-editorial-line text-xs hover:bg-editorial-stone transition-colors cursor-pointer"
            id="btn-settings-profile"
          >
            <Settings size={14} />
            <span className="hidden sm:inline">Preferences</span>
          </button>
          <button
            onClick={() => logout()}
            title="Sign out"
            aria-label="Sign out"
            className="w-9 h-9 rounded-full border border-editorial-line flex items-center justify-center text-editorial-charcoal/60 hover:bg-red-50 hover:text-red-700 hover:border-red-200 dark:hover:bg-red-950/50 dark:hover:text-red-300 dark:hover:border-red-900 transition-all cursor-pointer shrink-0"
            id="btn-logout"
          >
            <LogOut size={15} />
          </button>
        </div>
      </nav>

      {/* Non-blocking nudge to verify email (only for unverified accounts). */}
      <VerifyBanner />

      {/* Two-panel workspace */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden max-w-[1500px] w-full mx-auto pb-14 lg:pb-0">

        {/* LEFT: Study panel */}
        <motion.aside
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
          className={`${mobileView === "study" ? "flex" : "hidden"} lg:flex w-full lg:w-80 lg:shrink-0 min-h-0 border-r border-[color:rgba(90,90,64,0.14)] p-4 md:p-5 flex-col gap-4 bg-editorial-ivory overflow-y-auto`}
        >

          {/* New chat */}
          <button
            onClick={handleNewChat}
            title="Start a fresh chat for a new doubt"
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-full bg-editorial-charcoal text-white text-sm font-medium hover:bg-editorial-charcoal/90 transition-colors cursor-pointer shadow-sm"
            id="btn-new-chat"
          >
            <Plus size={16} />
            New chat
          </button>

          {/* Profile details: quiet context, so it grounds on stone and casts
              no shadow (shadow + white are reserved for actions/active state). */}
          <div className="bg-editorial-stone border border-editorial-line-light rounded-2xl p-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-full bg-editorial-sage/15 flex items-center justify-center text-editorial-sage shrink-0">
                <User size={16} />
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="text-sm font-semibold text-editorial-charcoal truncate">{profile.name}</h3>
                <p className="text-xs text-editorial-charcoal/60">{profile.grade} · {profile.language}</p>
              </div>
            </div>
            <p className="text-xs text-editorial-charcoal/70 kod-display border-t border-editorial-line-light pt-2.5">
              "{profile.examGoals || "Learn deeply with real analogies"}"
            </p>
          </div>

          {/* My Study Log = conversations */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <MessageSquare size={14} className="text-editorial-sage" />
                <h3 className="text-sm font-semibold text-editorial-sage">My Study Log</h3>
              </div>
              <button
                onClick={handleNewChat}
                title="Start a new chat"
                className="w-6 h-6 rounded-full bg-editorial-sage/10 text-editorial-sage hover:bg-editorial-sage/20 flex items-center justify-center transition-colors cursor-pointer"
              >
                <Plus size={13} />
              </button>
            </div>

            <div className="flex flex-col gap-1.5">
              {conversations.length === 0 && (
                <p className="text-xs text-editorial-charcoal/70 px-1 py-2">No chats yet. Start one above.</p>
              )}
              {conversations.map((c) => (
                <div
                  key={c.id}
                  onClick={() => openConversation(c.id)}
                  className={`group flex items-center gap-2 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${
                    activeId === c.id
                      ? "bg-editorial-sage/10 border-l-2 border-editorial-sage shadow-[0_1px_2px_rgba(26,26,26,0.05)]"
                      : "bg-transparent border-l-2 border-transparent hover:bg-editorial-stone"
                  }`}
                >
                  <MessageSquare size={13} className={activeId === c.id ? "text-editorial-sage shrink-0" : "text-editorial-charcoal/50 shrink-0"} />
                  <span className={`flex-1 text-xs truncate ${activeId === c.id ? "font-medium text-editorial-charcoal" : "text-editorial-charcoal/85"}`}>{c.title || "New chat"}</span>
                  <button
                    onClick={(e) => handleDeleteConversation(c.id, e)}
                    title="Delete chat"
                    aria-label="Delete chat"
                    className="opacity-40 lg:opacity-0 lg:group-hover:opacity-100 text-editorial-charcoal/50 hover:text-red-700 transition-all shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <UnderstandingPanel enabled={comp.enabled} concepts={comp.concepts} summary={comp.summary} glowKeys={glowKeys} today={comp.today} />

          {/* Chapter mastery, collapsible, secondary */}
          <div className="flex flex-col gap-2 border-t border-editorial-line pt-3 mt-auto">
            <button
              onClick={() => setShowChapters((v) => !v)}
              title="Your chapters and how strong each one feels"
              className="flex items-center justify-between px-1 cursor-pointer text-editorial-sage"
            >
              <span className="flex items-center gap-2 text-sm font-semibold">
                {showChapters ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                Chapter mastery
              </span>
              <span className="text-[10px] text-editorial-charcoal/60">{chapters.length}</span>
            </button>

            {showChapters && (
              <>
                <button
                  onClick={() => setIsAddingChapter((v) => !v)}
                  title="Add a chapter you are studying right now"
                  className="flex items-center gap-1.5 self-start px-2.5 py-1 text-[11px] text-editorial-sage hover:bg-editorial-sage/10 rounded-full transition-colors cursor-pointer"
                >
                  <Plus size={12} /> Add chapter
                </button>

                {isAddingChapter && (
                  <form onSubmit={handleAddChapter} className="bg-surface border border-editorial-line p-3 rounded-xl flex flex-col gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Chapter / topic name…"
                      value={newChapterName}
                      onChange={(e) => setNewChapterName(e.target.value)}
                      className="px-3 py-1.5 border border-editorial-line rounded-lg text-xs bg-editorial-ivory/50 focus:outline-none focus:ring-1 focus:ring-editorial-sage placeholder-editorial-charcoal/35"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => setIsAddingChapter(false)} title="Close without adding" className="px-2.5 py-1 text-[10px] text-editorial-charcoal/60 hover:bg-editorial-stone rounded">Cancel</button>
                      <button type="submit" title="Add this chapter and start a deep study session on it" className="px-3 py-1 text-[10px] bg-editorial-sage text-white rounded font-medium">Add & study</button>
                    </div>
                  </form>
                )}

                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                  {chapters.map((ch) => (
                    <div
                      key={ch.id}
                      onClick={() => startChapterStudy(ch.name)}
                      className="group bg-editorial-stone border border-editorial-line-light p-3 rounded-xl flex flex-col gap-2 hover:border-editorial-sage/40 hover:bg-editorial-sage/[0.05] transition-all cursor-pointer relative"
                    >
                      <div className="flex justify-between items-start gap-1">
                        <h4 className="text-xs font-medium text-editorial-charcoal leading-tight pr-4">{ch.name}</h4>
                        <button onClick={(e) => handleDeleteChapter(ch.id, e)} title="Remove this chapter" className="opacity-0 group-hover:opacity-100 absolute top-2 right-2 text-editorial-charcoal/40 hover:text-red-700 transition-opacity">
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] font-semibold">
                        {(["weak", "developing", "strong"] as const).map((m) => (
                          <button
                            key={m}
                            title={`Mark this chapter as ${m} for you`}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateMastery(ch.id, m);
                            }}
                            className={`px-2 py-0.5 rounded-full transition-colors capitalize ${
                              ch.mastery === m
                                ? m === "weak"
                                  ? "bg-red-50 text-red-800 border border-red-200 dark:bg-red-950/50 dark:text-red-300 dark:border-red-900"
                                  : m === "developing"
                                  ? "bg-yellow-50 text-yellow-800 border border-yellow-200 dark:bg-yellow-950/50 dark:text-yellow-300 dark:border-yellow-900"
                                  : "bg-emerald-50/70 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900"
                                : "text-editorial-charcoal/60 hover:bg-editorial-stone"
                            }`}
                          >
                            {m === "developing" ? "Dev" : m}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </motion.aside>

        {/* RIGHT: Chat panel */}
        <motion.main
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.06, ease: [0.22, 0.61, 0.36, 1] }}
          className={`${mobileView === "chat" ? "flex" : "hidden"} lg:flex flex-1 min-h-0 flex-col bg-surface/40 p-3 md:p-6 overflow-hidden`}
        >

          {/* First Star: the free week made visible for trial students. */}
          <TrialArc
            subscription={subscription}
            doubtsCleared={stats?.doubtsCleared ?? null}
            savedCount={savedCount}
            practiced={comp.summary.practiced}
            landed={comp.summary.landed}
            landingEnabled={comp.enabled}
            scope={scope}
          />

          {/* Messages */}
          <div ref={messagesRef} className="flex-1 bg-editorial-ivory border border-editorial-line-light rounded-2xl p-3 md:p-5 overflow-y-auto flex flex-col gap-5 min-h-[280px]">
            {chatHistory.length === 0 && !isGenerating && (() => {
              // "Today": a quiet progress mirror. Every row below is honest, it
              // only appears when the signal is real, so a brand-new student
              // (no streak, no landing, nothing due) sees just the warm prompt
              // and the starters, and never an empty scoreboard.
              const streakDays = stats && stats.daysActive > 0 ? stats.daysActive : 0;
              const streakLit = Boolean(stats?.activeToday);
              const lampTip = stats ? lampTitle(stats.daysActive, stats.activeToday) : "";
              const landedToday = comp.enabled ? comp.today.learned.length : 0;
              const fuzzyToday = comp.enabled ? comp.today.fuzzy.length : 0;
              const showToday = comp.enabled && comp.today.touched > 0 && (landedToday > 0 || fuzzyToday > 0);
              // The one thing worth doing first: the top concept waiting for its
              // spaced-confirmation check. Free, and it re-uses the same handler
              // as the Ready-to-Land card so the flow is identical.
              const readyPick =
                comp.enabled && !rtlDismissed && rtlState !== "posed" && comp.ready.length > 0 ? comp.ready[0] : null;
              const firstName = profile.name ? profile.name.split(" ")[0] : "";
              const hasMirror = streakDays > 0 || showToday || Boolean(readyPick);
              return (
                <div className="m-auto w-full max-w-lg px-2 py-6 flex flex-col items-center gap-5 text-center">
                  {(streakDays > 0 || showToday) && (
                    <div className="flex w-full items-center justify-center gap-3 flex-wrap">
                      {streakDays > 0 && (
                        <span
                          title={lampTip}
                          className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-full border border-editorial-line text-xs text-editorial-charcoal/80 select-none"
                        >
                          <Flame size={13} className={streakLit ? "text-amber-500 fill-amber-400 cfy-lamp-lit" : "text-editorial-charcoal/30"} />
                          <span className="tabular-nums">{streakDays}-day streak</span>
                        </span>
                      )}
                      {showToday && (
                        <span className="text-xs text-editorial-charcoal/60 tabular-nums">
                          {landedToday > 0 && <>{landedToday} landed</>}
                          {landedToday > 0 && fuzzyToday > 0 && <span className="text-editorial-charcoal/30"> · </span>}
                          {fuzzyToday > 0 && <>{fuzzyToday} still fuzzy today</>}
                        </span>
                      )}
                    </div>
                  )}

                  <div>
                    <h2 className="kod-display text-2xl md:text-[26px] leading-snug text-editorial-charcoal">
                      {readyPick
                        ? `Warm it up${firstName ? `, ${firstName}` : ""}.`
                        : `What are we working through today${firstName ? `, ${firstName}` : ""}?`}
                    </h2>
                    <p className="mt-2.5 text-sm leading-relaxed text-editorial-sage">
                      {readyPick
                        ? "One small check settles what was still fuzzy. It costs no credits."
                        : "Ask it once, ask it ten times. I will explain it a fresh way each time, until it lands."}
                    </p>
                  </div>

                  {readyPick && (
                    <button
                      onClick={() => handleReadyConfirm(readyPick)}
                      disabled={rtlState === "loading"}
                      className="inline-flex items-center gap-2 max-w-full rounded-xl bg-editorial-sage px-4 py-2.5 text-sm font-medium text-editorial-ivory hover:bg-editorial-sage/90 disabled:opacity-60 motion-safe:active:scale-[0.98] transition-all cursor-pointer"
                    >
                      <Sparkles size={15} className="shrink-0" />
                      <span className="text-left">{`Land "${readyPick.label}" · 1 min check`}</span>
                    </button>
                  )}

                  <div className="w-full mt-1">
                    <p className="mb-2.5 text-left kod-display text-xs uppercase tracking-wide text-editorial-charcoal/60">
                      {hasMirror ? "Or start something new" : "Not sure where to start?"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {SUGGESTED_QUERIES.map((q, idx) => (
                        <button
                          key={idx}
                          title={q.hint}
                          onClick={() => selectSuggestedPrompt(q.prompt)}
                          className="rounded-full border border-editorial-line bg-surface px-3.5 py-2 text-sm text-editorial-charcoal hover:border-editorial-sage/50 hover:bg-editorial-sage/[0.06] motion-safe:active:scale-[0.98] transition-all duration-200 cursor-pointer"
                        >
                          {q.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {chatHistory.map((message, msgIdx) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
                className={`flex flex-col max-w-[92%] md:max-w-[85%] ${message.role === "user" ? "self-end items-end" : "self-start items-start"}`}
              >
                <div className="flex items-center gap-2 mb-1 text-[10px] text-editorial-charcoal/70">
                  <span>{message.role === "user" ? "You" : "Faheem"}</span>
                  <span>·</span>
                  <span>{message.timestamp}</span>
                </div>

                <div
                  className={`p-4 md:p-5 relative border ${
                    message.role === "user"
                      ? "bg-editorial-stone/70 border-editorial-line-light rounded-2xl rounded-tr-sm text-editorial-charcoal text-sm md:text-base"
                      : message.isError
                      ? "bg-editorial-stone/60 border-editorial-line-light rounded-2xl rounded-tl-sm text-editorial-charcoal/85 text-sm md:text-base leading-relaxed"
                      : "bg-editorial-ivory border-editorial-line border-l-[3px] border-l-editorial-sage/40 rounded-2xl rounded-tl-sm text-editorial-charcoal text-sm md:text-base leading-relaxed shadow-[0_1px_2px_rgba(26,26,26,0.05)]"
                  }`}
                  id={`msg-bubble-${message.id}`}
                >
                  {/* Attachments */}
                  {message.attachments && message.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {message.attachments.map((att, i) =>
                        att.isImage ? (
                          <img key={i} src={att.dataUrl} alt={att.name} className="max-h-44 rounded-xl border border-editorial-line-light object-cover" />
                        ) : (
                          <a
                            key={i}
                            href={att.dataUrl}
                            download={att.name}
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-surface border border-editorial-line-light text-xs text-editorial-charcoal hover:bg-editorial-stone"
                          >
                            <FileText size={14} className="text-editorial-sage" />
                            <span className="truncate max-w-40">{att.name}</span>
                          </a>
                        )
                      )}
                    </div>
                  )}

                  {/* data-answer-body clamps line-selection saving to the answer
                      text itself: never buttons, sources, or status chrome. */}
                  {message.text &&
                    (message.role === "model" ? (
                      <div data-answer-body="true">{renderMessageContent(message)}</div>
                    ) : (
                      renderMessageContent(message)
                    ))}

                  {/* Deep-check state: honest at every stage. The passed state
                      earns a quiet sage seal; checking and unavailable stay
                      plain (a seal on an unverified answer would be dishonest). */}
                  {message.role === "model" && message.verification && (
                    <div
                      className={`mt-3 flex items-center gap-1.5 text-[11px] ${
                        message.verification === "passed"
                          ? "inline-flex rounded-full bg-editorial-sage/10 px-2.5 py-1 font-medium text-editorial-sage"
                          : message.verification === "unavailable"
                          ? "text-amber-800 dark:text-amber-300"
                          : "text-editorial-sage"
                      }`}
                    >
                      {message.verification === "checking" ? (
                        <Loader2 size={12} className="motion-safe:animate-spin" />
                      ) : message.verification === "passed" ? (
                        <CheckCircle2 size={12} />
                      ) : (
                        <AlertTriangle size={12} />
                      )}
                      {message.verification === "checking"
                        ? "Deep-check is reviewing this answer…"
                        : message.verification === "passed"
                        ? "Deep-checked: a second examiner pass reviewed this answer."
                        : "Deep-check could not run this time, so this answer is shown unverified."}
                    </div>
                  )}

                  {/* Sources */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-editorial-line-light flex flex-wrap gap-2 items-center">
                      <span className="text-[10px] text-editorial-charcoal/70 flex items-center gap-1">
                        <Search size={10} className="text-editorial-sage" /> Sources:
                      </span>
                      {message.sources.map((src, sIdx) => (
                        <a key={sIdx} href={src.uri} target="_blank" rel="noreferrer" className="text-[10px] bg-editorial-stone text-editorial-sage px-2.5 py-1 rounded-full border border-editorial-line-light flex items-center gap-1 hover:bg-editorial-sage/10">
                          {src.title}
                          <ExternalLink size={8} />
                        </a>
                      ))}
                    </div>
                  )}

                  {/* Action row: simpler, deeper, checked, saved, or heard. One
                      wrapping cluster so the buttons pair up tidily as the column
                      narrows (phone, tablet, sidebar-shrunk desktop) instead of
                      wrapping raggedly. Listen only floats right once there is
                      room for it (sm+); on a phone it joins the same wrap. */}
                  {message.role === "model" && message.text && !message.streaming && (
                    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-editorial-line-light pt-2.5">
                      {message.text.length > 200 && (
                        <button
                          onClick={() => handleSendMessage(STILL_CONFUSED_PROMPT)}
                          disabled={isGenerating}
                          className={STILL_FUZZY_PILL}
                          id={`btn-reexplain-${message.id}`}
                          title="Explain it again, a different way, as many times as you need"
                        >
                          <Sparkles size={12} className="shrink-0" /> Teach me again
                        </button>
                      )}
                      {canGoDeep(message) && (
                        <button
                          onClick={() => openDeepDive(msgIdx, message)}
                          disabled={isGenerating}
                          className={ACTION_PILL}
                          id={`btn-deepdive-${message.id}`}
                          title={deepDiveOf[message.id]
                            ? "Jump to the study notebook you already opened for this answer"
                            : "Open the full study view: the exam-ready answer plus the nine-part notebook"}
                        >
                          <BookOpen size={12} className="shrink-0" /> {deepDiveOf[message.id] ? "View notebook" : "Go deeper"}
                        </button>
                      )}
                      {message.text.length > 200 && message.verification !== "passed" && message.verification !== "checking" && (
                        <button
                          onClick={() => handleDeepCheck(message, questionBefore(msgIdx))}
                          disabled={isGenerating}
                          className={ACTION_PILL}
                          id={`btn-deepcheck-${message.id}`}
                          title="A second examiner pass double-checks the facts and calculations in this answer"
                        >
                          <CheckCircle2 size={12} className="shrink-0" /> Deep-check
                        </button>
                      )}
                      {message.verification !== "checking" && (
                        <button
                          onMouseDown={(e) => e.preventDefault() /* keep the text selection alive */}
                          onClick={() => saveSelectionToNotebook(message.id)}
                          disabled={savingSelection}
                          className={ACTION_PILL}
                          id={`btn-savelines-${message.id}`}
                          title="Select the lines that made it click, then save them to your Pre-exam notebook"
                        >
                          <BookMarked size={12} className="shrink-0" /> Save lines
                        </button>
                      )}
                    </div>
                  )}

                  {/* First-star nudge: a trial student with no measured win yet
                      gets one gentle pointer toward the shortest path to their
                      first verified win, replying in their own words. Worded so it
                      holds true even when this particular answer poses no closing
                      check. Dismissible, one line, never a demand. */}
                  {message.role === "model" &&
                    message.text.length > 200 &&
                    !message.streaming &&
                    !message.isError &&
                    msgIdx === chatHistory.length - 1 &&
                    !isGenerating &&
                    !checkNudgeDismissed &&
                    subscription?.plan === "trial" &&
                    comp.enabled &&
                    comp.summary.practiced + comp.summary.landed === 0 && (
                      <div className="mt-2 flex items-center gap-2 text-[11px] text-editorial-charcoal/60">
                        <Star size={11} className="text-amber-500 shrink-0" />
                        <span className="min-w-0">
                          Reply below in your own words, that is where your first star lights up
                        </span>
                        <button
                          onClick={() => setCheckNudgeDismissed(true)}
                          aria-label="Dismiss"
                          className="shrink-0 text-editorial-charcoal/40 hover:text-editorial-charcoal cursor-pointer"
                        >
                          <X size={11} />
                        </button>
                      </div>
                    )}
                </div>
              </motion.div>
            ))}

            {/* Facts fill the wait until the first streamed token arrives. */}
            {isGenerating && !chatHistory.some((m) => m.streaming || m.verification === "checking") && (
              <SmartFactsLoader seedMessage={[...chatHistory].reverse().find((m) => m.role === "user")?.text || ""} />
            )}

            <div ref={chatEndRef} />
          </div>

          {/* Attachment preview */}
          {attachments.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {attachments.map((att, i) => (
                <div key={i} className="relative group">
                  {att.isImage ? (
                    <img src={att.dataUrl} alt={att.name} className="h-16 w-16 object-cover rounded-lg border border-editorial-line" />
                  ) : (
                    <div className="h-16 w-16 flex flex-col items-center justify-center gap-1 rounded-lg border border-editorial-line bg-surface text-editorial-sage px-1">
                      <FileText size={18} />
                      <span className="text-[8px] text-editorial-charcoal/60 truncate w-full text-center">{att.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-editorial-charcoal text-white flex items-center justify-center hover:bg-red-700 transition-colors"
                    title="Remove"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Ready to Land: on a fresh open, up to three concepts whose one
              graded pass was on an earlier day. One 30-second check each, free,
              and a PASS today promotes it to landed for good. Skips carry no
              debt; the card steps aside the moment the student asks anything. */}
          <AnimatePresence>
            {comp.enabled &&
              comp.ready.length > 0 &&
              rtlState !== "posed" &&
              !rtlDismissed &&
              !sentThisSession &&
              !isGenerating &&
              !dataLoading && (
                <ReadyToLandCard
                  ready={comp.ready}
                  busy={rtlState === "loading"}
                  onConfirm={handleReadyConfirm}
                  onDismiss={handleReadyDismiss}
                />
              )}
          </AnimatePresence>

          {/* Selected-lines save bar: appears while the student is highlighting
              inside an answer, so keeping a line is one calm tap. */}
          {selSave &&
            (() => {
              const m = chatHistory.find((mm) => mm.id === selSave.msgId);
              // Never offer to save a streaming draft or one Deep-check is
              // still reviewing: the corrected final answer replaces it.
              return m?.role === "model" && !m.streaming && m.verification !== "checking";
            })() && (
              <div className="mt-3 flex items-center justify-between gap-3 rounded-2xl border border-editorial-sage/40 bg-editorial-sage/5 px-4 py-2.5">
                <p className="min-w-0 flex-1 truncate text-xs italic text-editorial-charcoal/70">
                  "{selSave.text.slice(0, 90)}
                  {selSave.text.length > 90 ? "…" : ""}"
                </p>
                <button
                  onMouseDown={(e) => e.preventDefault() /* keep the selection alive */}
                  onClick={() => saveSelectionToNotebook()}
                  disabled={savingSelection}
                  title="Save the highlighted lines to your Pre-exam notebook"
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-editorial-sage px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 cursor-pointer motion-safe:active:scale-[0.97]"
                  id="btn-save-selection"
                >
                  <BookMarked size={13} /> {savingSelection ? "Saving…" : "Save lines"}
                </button>
              </div>
            )}

          {/* Input */}
          <div className="mt-3 bg-surface border border-editorial-line rounded-2xl p-2 flex items-center gap-1.5 shadow-sm focus-within:border-editorial-sage focus-within:ring-1 focus-within:ring-editorial-sage/30 transition-all">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={handleFilesPicked}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isGenerating || attachments.length >= MAX_ATTACHMENTS}
              title="Upload an image or file"
              className="w-11 h-11 flex items-center justify-center rounded-full text-editorial-charcoal/50 hover:bg-editorial-stone hover:text-editorial-sage transition-colors shrink-0 disabled:opacity-30 cursor-pointer motion-safe:active:scale-[0.96]"
              id="btn-upload"
            >
              <Paperclip size={18} />
            </button>
            <input
              type="text"
              dir="auto"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && handleSendMessage()}
              onPaste={handlePaste}
              placeholder="Ask anything, or paste / upload a photo of a question…"
              className="flex-1 px-2 py-2 bg-transparent text-editorial-charcoal focus:outline-none text-sm md:text-base placeholder-editorial-charcoal/30"
              disabled={isGenerating}
              id="input-chat"
            />
            <button
              onClick={() => handleSendMessage()}
              title="Send your question"
              className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer motion-safe:transition-all motion-safe:active:scale-[0.96] ${
                isGenerating
                  ? "bg-editorial-sage/70 text-white"
                  : "bg-editorial-sage hover:bg-editorial-sage/90 text-white disabled:bg-editorial-stone disabled:text-editorial-charcoal/45 disabled:border disabled:border-editorial-line"
              }`}
              disabled={isGenerating || (!inputText.trim() && attachments.length === 0)}
              id="btn-send-chat"
            >
              {isGenerating ? <Loader2 size={16} className="motion-safe:animate-spin" /> : <Send size={16} />}
            </button>
          </div>
        </motion.main>
      </div>

      {/* Mobile bottom nav: 2 view tabs + the Pre-exam notebook overlay */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 flex items-stretch border-t border-editorial-line bg-editorial-ivory/95 backdrop-blur-sm pb-[env(safe-area-inset-bottom)]">
        {([
          { k: "study", label: "Study Log", icon: <MessageSquare size={18} /> },
          { k: "chat", label: "Chat", icon: <Sparkles size={18} /> }
        ] as const).map((t) => (
          <button
            key={t.k}
            title={t.k === "study" ? "Your chats, progress, and chapters" : "Ask and read answers"}
            onClick={() => setMobileView(t.k)}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium border-t-2 transition-colors ${
              mobileView === t.k
                ? "text-editorial-sage border-editorial-sage bg-editorial-sage/8"
                : "text-editorial-charcoal/70 border-transparent hover:text-editorial-charcoal"
            }`}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
        <button
          onClick={() => setNotebookOpen(true)}
          title="Every line you saved, filed by subject and chapter"
          className="flex-1 flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium border-t-2 border-transparent text-editorial-charcoal/70 hover:text-editorial-charcoal transition-colors"
          id="tab-notebook"
        >
          <BookMarked size={18} />
          Notebook
        </button>
      </nav>

      {/* Pre-exam notebook (full-screen overlay on every device) */}
      <PreExamNotebook
        open={notebookOpen}
        onClose={() => setNotebookOpen(false)}
        subscription={subscription}
        onUpgrade={() => {
          setNotebookOpen(false);
          setUpgradeReason("");
          setShowUpgrade(true);
        }}
      />

      {/* Mastery moments: examiner-verified wins and real milestones only. */}
      <CelebrationOverlay celebration={celebration} onDone={advanceCelebration} />

      {/* Quiet toast (saves, hints) */}
      <AnimatePresence>
        {toast && (
          <motion.div
            role="status"
            aria-live="polite"
            initial={{ opacity: 0, y: -8, x: "-50%" }}
            animate={{ opacity: 1, y: 0, x: "-50%" }}
            exit={{ opacity: 0, y: -8, x: "-50%" }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="fixed left-1/2 top-4 z-[70] max-w-[92vw] rounded-full bg-editorial-charcoal px-5 py-2.5 text-center text-xs text-white shadow-lg"
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Plan chooser / paywall */}
      {account && (
        <UpgradeModal
          open={showUpgrade}
          onClose={() => setShowUpgrade(false)}
          account={account}
          subscription={subscription}
          reason={upgradeReason}
          onActivated={(sub) => {
            applySubscription(sub);
            setShowUpgrade(false);
            setUpgradeReason("");
          }}
        />
      )}

      {/* Preferences modal */}
      <AnimatePresence>
        {isEditingProfile && (
          <div className="fixed inset-0 bg-[#101a2b]/45 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="bg-editorial-ivory border border-editorial-line w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <Settings size={18} className="text-editorial-sage" />
                  <h3 className="text-base kod-display font-medium text-editorial-charcoal">Study Preferences</h3>
                </div>
                <button onClick={() => setIsEditingProfile(false)} title="Close preferences" className="text-editorial-charcoal/40 hover:text-editorial-charcoal text-2xl cursor-pointer leading-none">&times;</button>
              </div>

              <form onSubmit={handleSaveProfile} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-editorial-charcoal/70">My name</label>
                  <input
                    type="text"
                    required
                    value={editProfileForm.name}
                    onChange={(e) => setEditProfileForm({ ...editProfileForm, name: e.target.value })}
                    className="px-4 py-2.5 border border-editorial-line rounded-xl text-sm bg-surface focus:outline-none focus:ring-1 focus:ring-editorial-sage text-editorial-charcoal"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-editorial-charcoal/70">Curriculum / Board</label>
                    {/* Values must match the backend syllabus corpus board names
                        (backend/src/data/syllabusCorpus.ts): retrieval keys on them. */}
                    <select value={editProfileForm.board} onChange={(e) => setEditProfileForm({ ...editProfileForm, board: e.target.value })} className="px-4 py-2.5 border border-editorial-line rounded-xl text-sm bg-surface focus:outline-none text-editorial-charcoal">
                      <option value="General">General Study</option>
                      <option value="Cambridge (CAIE)">Cambridge (CAIE)</option>
                      <option value="Pearson Edexcel">Pearson Edexcel</option>
                      <option value="IB">IB</option>
                      <option value="American (US)">American (US)</option>
                      <option value="CBSE">CBSE</option>
                      <option value="ICSE / ISC">ICSE / ISC</option>
                      <option value="French (AEFE)">French (AEFE)</option>
                      <option value="SABIS">SABIS</option>
                      <option value="UAE MoE">UAE MoE</option>
                      <option value="Saudi Arabia MoE">Saudi Arabia MoE</option>
                      <option value="Qatar MoEHE">Qatar MoEHE</option>
                      <option value="Kuwait MoE">Kuwait MoE</option>
                      <option value="Bahrain MoE">Bahrain MoE</option>
                      <option value="Oman MoE">Oman MoE</option>
                      <option value="None">None</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-editorial-charcoal/70">Grade / Level</label>
                    <input type="text" value={editProfileForm.grade} onChange={(e) => setEditProfileForm({ ...editProfileForm, grade: e.target.value })} className="px-4 py-2.5 border border-editorial-line rounded-xl text-sm bg-surface focus:outline-none focus:ring-1 focus:ring-editorial-sage text-editorial-charcoal" />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-editorial-charcoal/70">Language</label>
                    <select value={editProfileForm.language} onChange={(e) => setEditProfileForm({ ...editProfileForm, language: e.target.value })} className="px-4 py-2.5 border border-editorial-line rounded-xl text-sm bg-surface focus:outline-none text-editorial-charcoal">
                      <option value="English">English</option>
                      <option value="Arabic">Arabic (العربية)</option>
                      <option value="Hindi">Hindi (हिंदी)</option>
                      <option value="Urdu">Urdu (اردو)</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-editorial-charcoal/70">Preferred analogy</label>
                    <select value={editProfileForm.preferredAnalogy} onChange={(e) => setEditProfileForm({ ...editProfileForm, preferredAnalogy: e.target.value })} className="px-4 py-2.5 border border-editorial-line rounded-xl text-sm bg-surface focus:outline-none text-editorial-charcoal">
                      <option value="Daily Life">Daily Life / Everyday objects</option>
                      <option value="Sports">Sports / Football / Basketball</option>
                      <option value="Cooking">Cooking & Kitchen recipes</option>
                      <option value="Bicycles & Trains">Bicycles, Trains & Transportation</option>
                      <option value="Mobile Phones & Tech">Mobile Phones, Games & Apps</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-editorial-charcoal/70">Exam goals</label>
                  <textarea rows={2} value={editProfileForm.examGoals} onChange={(e) => setEditProfileForm({ ...editProfileForm, examGoals: e.target.value })} className="px-4 py-3 border border-editorial-line rounded-xl text-sm bg-surface focus:outline-none focus:ring-1 focus:ring-editorial-sage resize-none text-editorial-charcoal" />
                </div>

                <div className="flex justify-end gap-2 mt-2">
                  <button type="button" onClick={() => setIsEditingProfile(false)} title="Close without saving" className="px-5 py-2.5 border border-editorial-line text-editorial-charcoal hover:bg-editorial-stone rounded-full text-sm transition-colors cursor-pointer">Cancel</button>
                  <button type="submit" title="Save your study preferences" className="px-5 py-2.5 bg-editorial-charcoal hover:bg-editorial-charcoal/90 text-white rounded-full text-sm transition-colors cursor-pointer">Save changes</button>
                </div>

                <p className="border-t border-editorial-line-light pt-3 text-center text-[11px] text-editorial-charcoal/70">
                  Need help with anything, including payments? Write to{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`} className="text-editorial-sage underline underline-offset-2 hover:text-editorial-charcoal">
                    {SUPPORT_EMAIL}
                  </a>
                  . It is the only address we answer.
                </p>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}

// Compact plan + usage chip in the header. Tapping it opens the plan chooser so
// a student can upgrade or renew at any time. Turns amber when access has run
// out, so the state is honest at a glance without ever nagging. Rendered on
// EVERY screen size (phones are the primary audience) with a shorter label on
// small screens, because this is the only voluntary path to plans and usage.
function UsagePill({ subscription, onClick }: { subscription?: Subscription; onClick: () => void }) {
  let label = "Plans";
  let shortLabel = "Plans";
  let alert = false;
  if (subscription) {
    const { state, planName, remaining } = subscription;
    if (state === "trial") {
      const left = remaining ?? 0;
      label = `Trial · ${left} left today`;
      shortLabel = `${left} today`;
      alert = left <= 0;
    } else if (state === "active") {
      // "Unlimited · Unlimited" reads like a stutter: the plan name alone says it.
      label = remaining == null
        ? (planName === "Unlimited" ? "Unlimited" : `${planName} · Unlimited`)
        : `${planName} · ${remaining} left`;
      shortLabel = remaining == null ? "Unlimited" : `${remaining} left`;
      alert = remaining != null && remaining <= 0;
    } else {
      label = state === "plan_expired" ? "Renew plan" : "Choose a plan";
      shortLabel = state === "plan_expired" ? "Renew" : "Plans";
      alert = true;
    }
  }
  return (
    <button
      onClick={onClick}
      title="View plans and usage"
      id="btn-usage-plan"
      className={`flex items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors cursor-pointer ${
        alert
          ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-950"
          : "border-editorial-line text-editorial-charcoal/70 hover:bg-editorial-stone"
      }`}
    >
      <Sparkles size={13} className={alert ? "text-amber-600" : "text-editorial-sage"} />
      <span className="whitespace-nowrap hidden md:inline">{label}</span>
      <span className="whitespace-nowrap md:hidden">{shortLabel}</span>
    </button>
  );
}

// Engaging loader: rotates curated "Did you know?" facts (client-only, no model
// call) while the answer generates. Facts auto-change every 10s and stay until
// the full answer has been generated.
function SmartFactsLoader({ seedMessage }: { seedMessage: string }) {
  const [idx, setIdx] = useState(() => pickFirstFactIndex(seedMessage));
  useEffect(() => {
    const t = setInterval(() => setIdx((i) => (i + 1) % STUDY_FACTS.length), 10000);
    return () => clearInterval(t);
  }, []);
  const fact = STUDY_FACTS[idx] || FALLBACK_STUDY_FACT;
  return (
    <div className="self-start max-w-[92%] md:max-w-[85%] flex flex-col items-start">
      <div className="flex items-center gap-2 mb-1.5 text-[11px] text-editorial-sage">
        <span className="flex h-1.5 w-1.5 rounded-full bg-editorial-sage motion-safe:animate-pulse shrink-0" />
        Working it out carefully, and checking it before I show you.
      </div>
      <div className="p-4 rounded-2xl bg-editorial-stone/40 border border-editorial-line-light rounded-tl-sm max-w-md">
        <div className="flex items-center gap-1.5 mb-2 text-editorial-sage">
          <Sparkles size={12} />
          <span className="kod-display text-xs">Did you know?</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={idx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            className="text-sm text-editorial-charcoal/80 kod-display leading-relaxed"
          >
            {fact.text}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

