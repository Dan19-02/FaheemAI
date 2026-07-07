import React, { useState, useEffect, useRef, Suspense, lazy } from "react";
import {
  Sparkles,
  BookOpen,
  Search,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
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
  BookMarked
} from "lucide-react";
import { motion, AnimatePresence, MotionConfig } from "motion/react";
import {
  ChatMessage,
  ChapterProgress,
  StudentProfile,
  Conversation,
  Subscription
} from "./types";
import {
  float32ToInt16PCM,
  arrayBufferToBase64,
  base64ToFloat32PCM,
  parseTeachingSections,
  filesToAttachments,
  dataUrlToBase64
} from "./utils";
import { useAuth } from "./AuthContext";
import { api, getToken, ApiError } from "./api";
import { DEFAULT_CHAPTERS, makeDefaultProfile, SUPPORT_EMAIL } from "./defaults";
import { Markdown } from "./Markdown";
import { NotebookViewer } from "./NotebookViewer";
import UpgradeModal from "./UpgradeModal";
import PreExamNotebook from "./PreExamNotebook";

// The public landing site is only for signed-out visitors, so it loads as its
// own chunk and never weighs down a student's session.
const Landing = lazy(() => import("./landing/Landing"));
import { STUDY_FACTS, FALLBACK_STUDY_FACT, pickFirstFactIndex } from "./facts";

const SUGGESTED_QUERIES = [
  { label: "Explain Photosynthesis", prompt: "Can you explain photosynthesis simply?", hint: "Start with a plain, everyday walk-through." },
  { label: "Newton's 2nd Law", prompt: "Explain Newton's Second Law of Motion at an exam level. Give me a good analogy!", hint: "Exam-level, with an analogy you will remember." },
  { label: "Cell Division", prompt: "What is the difference between mitosis and meiosis? Explain it clearly for my exam.", hint: "The comparison, side by side." },
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
  const [mobileView, setMobileView] = useState<MobileView>("chat");
  const [showChapters, setShowChapters] = useState(false);

  // Add chapter
  const [newChapterName, setNewChapterName] = useState("");
  const [isAddingChapter, setIsAddingChapter] = useState(false);

  // Profile edit
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editProfileForm, setEditProfileForm] = useState<StudentProfile>({ ...profile });
  const [selectedVoice, setSelectedVoice] = useState<"Kore" | "Zephyr" | "Puck" | "Charon" | "Fenrir">("Kore");

  // TTS playback
  const [playingMessageId, setPlayingMessageId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Live voice
  const [isLiveActive, setIsLiveActive] = useState(false);
  const [liveStatus, setLiveStatus] = useState<string>("Disconnected");
  const liveWsRef = useRef<WebSocket | null>(null);
  const micCtxRef = useRef<AudioContext | null>(null);
  const micProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const playCtxRef = useRef<AudioContext | null>(null);
  const nextPlayTimeRef = useRef<number>(0);
  const liveInterruptedRef = useRef<boolean>(false);

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
      showToast("Saved to your Pre-exam notebook. It files itself under the right chapter.");
    } catch (e: any) {
      showToast(e?.message || "Could not save that. Please select the lines again and retry.");
    } finally {
      setSavingSelection(false);
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
    localStorage.removeItem("clarify_images");
    return () => {
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
      if (toastTimer.current) clearTimeout(toastTimer.current);
      stopLiveSession();
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

  const handleNewChat = async () => {
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
    }
  };

  const handleDeleteConversation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
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
  const handleSendMessage = async (textToSend?: string, opts?: { deep?: boolean; silent?: boolean }) => {
    const text = (textToSend ?? inputText).trim();
    const atts = opts?.silent ? [] : attachments;
    if ((!text && atts.length === 0) || !activeId || isGenerating) return;
    const convId = activeId;
    const isFirstMessage = chatHistory.length === 0;
    const deep = opts?.deep === true;

    // A new question (first in a thread, not a deep dive) is what costs a credit.
    // Follow-ups, "still fuzzy" re-explains, and deep dives are always free.
    const isNewQuestion = isFirstMessage && !deep && (Boolean(text) || atts.length > 0);
    if (isNewQuestion && !canAskNew(subscription)) {
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
        images
      };

      // The answer always persists to its own conversation, but only paints
      // into local state while that conversation is still the one on screen
      // (it reloads from the server if the student comes back later).
      const finalize = (msg: ChatMessage) => {
        if (activeIdRef.current === convId) {
          // If a streaming draft is already on screen, swap its content in
          // place (keeping its id) so the completed answer settles once and
          // does not fade out and re-rise on the draft-to-final swap. Only a
          // genuine first appearance (image path, stream skipped) animates in.
          setChatHistory((prev) =>
            prev.some((m) => m.id === streamId)
              ? prev.map((m) => (m.id === streamId ? { ...msg, id: m.id } : m))
              : [...prev.filter((m) => m.id !== streamId), msg]
          );
        }
        api.addMessage(convId, msg).catch(() => {});
      };

      // Try streaming first. Text-only, and not for explicit Search mode: the
      // server would just answer "fallback" while charging a rate-limit token.
      // (Auto-routed search from Standard is still caught server-side.)
      let streamResult: Awaited<ReturnType<typeof api.chatStream>> | null = null;
      if (images.length === 0) {
        try {
          streamResult = await api.chatStream(
            baseBody,
            (chunk) => {
              if (activeIdRef.current !== convId) return;
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
            },
            () => patchStream({ verification: "checking", streaming: false })
          );
        } catch (streamErr: any) {
          console.warn("Streaming failed, retrying on /chat:", streamErr?.message || streamErr);
          streamResult = { kind: "fallback", reason: "stream-failed" };
        }
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
          verification: streamResult.verification,
          grounding: streamResult.grounding,
          outOfSyllabus: streamResult.outOfSyllabus
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
          verification: data.verification,
          grounding: data.grounding,
          outOfSyllabus: data.outOfSyllabus
        });
      }

      // A new question was charged server-side: refresh the usage display.
      if (isNewQuestion) refreshSubscription().catch(() => {});
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
      setIsGenerating(false);
    }
  };

  // ---- TTS ----
  const handleSpeak = async (messageId: string, text: string) => {
    if (playingMessageId === messageId) {
      if (audioPlayerRef.current) audioPlayerRef.current.pause();
      setPlayingMessageId(null);
      return;
    }
    if (audioPlayerRef.current) audioPlayerRef.current.pause();

    const cached = chatHistory.find((m) => m.id === messageId);
    if (cached?.audioBase64) {
      playBase64Audio(cached.audioBase64, messageId);
      return;
    }

    setPlayingMessageId(messageId);
    try {
      const cleanText = text
        .replace(/[*_#`~\[\]()\-]/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .substring(0, 500);
      const data = await api.tts({ text: cleanText, voice: selectedVoice });
      if (data.audio) {
        setChatHistory((prev) => prev.map((m) => (m.id === messageId ? { ...m, audioBase64: data.audio } : m)));
        playBase64Audio(data.audio, messageId);
      }
    } catch (err) {
      console.error("TTS synthesis failed", err);
      setPlayingMessageId(null);
    }
  };

  const playBase64Audio = (base64: string, messageId: string) => {
    const audio = new Audio(`data:audio/wav;base64,${base64}`);
    audioPlayerRef.current = audio;
    setPlayingMessageId(messageId);
    audio.onended = () => setPlayingMessageId(null);
    audio.onerror = () => setPlayingMessageId(null);
    audio.play().catch((err) => {
      console.error("Audio playback interrupted", err);
      setPlayingMessageId(null);
    });
  };

  // ---- Chapters ----
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
    handleSendMessage(`Teach me "${newCh.name}" in depth.`, { deep: true });
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

  // ---- Live voice ----
  const startLiveSession = async () => {
    try {
      setLiveStatus("Initializing microphone...");
      const playCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
      playCtxRef.current = playCtx;
      nextPlayTimeRef.current = playCtx.currentTime;
      liveInterruptedRef.current = false;

      // Microphone needs a secure context (HTTPS, or localhost). Fail clearly
      // instead of throwing a cryptic error when the page is served over http://.
      if (!navigator.mediaDevices?.getUserMedia) {
        setLiveStatus("Microphone needs a secure page. Open the app over HTTPS (or localhost) and allow mic access.");
        setIsLiveActive(false);
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const token = getToken();
      // Route the socket to the BACKEND origin (the same place HTTP calls go via
      // VITE_API_URL), so live voice works when the frontend and backend are
      // deployed on different URLs. Falls back to same-origin for local dev.
      const apiBase = (import.meta.env.VITE_API_URL || "").trim().replace(/\/$/, "");
      const wsBase = apiBase
        ? apiBase.replace(/^http/i, "ws") // http→ws, https→wss
        : `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}`;
      const wsUrl = `${wsBase}/api/live${token ? `?token=${encodeURIComponent(token)}` : ""}`;

      const ws = new WebSocket(wsUrl);
      liveWsRef.current = ws;
      setIsLiveActive(true);

      ws.onopen = () => {
        setLiveStatus("Connected. Say hello to Faheem!");
        ws.send(JSON.stringify({ type: "start" }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === "ready") {
            setLiveStatus("Faheem is listening to your voice!");
          } else if (msg.type === "audio") {
            if (liveInterruptedRef.current) return;
            playLiveAudioChunk(base64ToFloat32PCM(msg.audio));
          } else if (msg.type === "interrupted") {
            liveInterruptedRef.current = true;
            nextPlayTimeRef.current = playCtxRef.current?.currentTime || 0;
          } else if (msg.type === "error") {
            setLiveStatus(`Error: ${msg.error}`);
            stopLiveSession();
          }
        } catch (e) {
          console.error("WebSocket client parsing error:", e);
        }
      };

      ws.onclose = () => {
        setLiveStatus("Closed");
        stopLiveSession();
      };
      ws.onerror = (err) => {
        setLiveStatus("Socket Error");
        console.error("Live WebSocket Error", err);
      };

      const micCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
      micCtxRef.current = micCtx;
      const source = micCtx.createMediaStreamSource(stream);
      const processor = micCtx.createScriptProcessor(2048, 1, 1);
      micProcessorRef.current = processor;
      source.connect(processor);
      processor.connect(micCtx.destination);
      processor.onaudioprocess = (e) => {
        if (ws.readyState === WebSocket.OPEN) {
          const base64PCM = arrayBufferToBase64(float32ToInt16PCM(e.inputBuffer.getChannelData(0)));
          ws.send(JSON.stringify({ audio: base64PCM }));
        }
      };
    } catch (err: any) {
      console.error(err);
      setLiveStatus("Microphone permission denied. Please allow mic access and try again.");
      setIsLiveActive(false);
    }
  };

  const stopLiveSession = () => {
    setIsLiveActive(false);
    setLiveStatus("Disconnected");
    if (liveWsRef.current) {
      liveWsRef.current.close();
      liveWsRef.current = null;
    }
    if (micProcessorRef.current) {
      micProcessorRef.current.disconnect();
      micProcessorRef.current = null;
    }
    if (micCtxRef.current) {
      micCtxRef.current.close();
      micCtxRef.current = null;
    }
    if (playCtxRef.current) {
      playCtxRef.current.close();
      playCtxRef.current = null;
    }
  };

  const playLiveAudioChunk = (float32Array: Float32Array) => {
    const playCtx = playCtxRef.current;
    if (!playCtx) return;
    const audioBuffer = playCtx.createBuffer(1, float32Array.length, 24000);
    audioBuffer.getChannelData(0).set(float32Array);
    const source = playCtx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(playCtx.destination);
    const currentTime = playCtx.currentTime;
    let startTime = nextPlayTimeRef.current;
    if (startTime < currentTime) startTime = currentTime + 0.05;
    source.start(startTime);
    nextPlayTimeRef.current = startTime + audioBuffer.duration;
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
      api.addMessage(convId, { id: msg.id, role: "model", text: data.text, sources: msg.sources || [] }).catch(() => {});
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
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-editorial-sage motion-safe:animate-[clarify-breathe_2.2s_ease-in-out_infinite]">
          <span className="font-serif text-2xl italic leading-none text-editorial-ivory">F</span>
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
              <span className="font-serif text-2xl italic leading-none text-editorial-ivory">F</span>
            </div>
          </div>
        }
      >
        <Landing />
      </Suspense>
    );
  }

  // TODO(fahim-rtl): logical-props sweep is complete for the main app shell
  // (header, study panel, chat panel, message bubbles, input bar, bottom nav,
  // attachment/save bars, preferences modal) and the Markdown prose renderer.
  // Still physical and NOT yet swept: NotebookViewer.tsx, PreExamNotebook.tsx
  // (the notebook overlay's inner chrome), UpgradeModal.tsx, Login.tsx. The
  // landing (src/landing/**) is intentionally LTR and must stay physical.
  return (
    <MotionConfig reducedMotion="user">
    {/* fahim-app: applies the Arabic-capable font stack (var(--font-arabic)).
        dir is inherited from <html> (set by LocaleProvider), so the whole shell
        mirrors via logical properties without a hardcoded dir here. */}
    <div className="fahim-app h-[100dvh] bg-editorial-ivory text-editorial-charcoal font-sans flex flex-col antialiased">
      {/* Header */}
      <nav className="flex justify-between items-center px-4 py-3 md:px-8 border-b border-editorial-line bg-editorial-ivory">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-editorial-sage flex items-center justify-center shrink-0">
            <span className="text-editorial-ivory font-serif italic text-lg leading-none">F</span>
          </div>
          <span className="font-serif italic text-xl tracking-tight text-editorial-charcoal">فهيم</span>
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden md:block text-xs text-editorial-charcoal/70 me-1">
            {profile.name} · {profile.board}
          </span>
          <UsagePill
            subscription={subscription}
            onClick={() => {
              setUpgradeReason("");
              setShowUpgrade(true);
            }}
          />
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
            className="w-9 h-9 rounded-full border border-editorial-line flex items-center justify-center text-editorial-charcoal/60 hover:bg-red-50 hover:text-red-700 hover:border-red-200 transition-all cursor-pointer shrink-0"
            id="btn-logout"
          >
            <LogOut size={15} />
          </button>
        </div>
      </nav>

      {/* Two-panel workspace */}
      <div className="flex-1 min-h-0 flex flex-col lg:flex-row overflow-hidden max-w-[1500px] w-full mx-auto pb-14 lg:pb-0">

        {/* LEFT: Study panel */}
        <motion.aside
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.22, 0.61, 0.36, 1] }}
          className={`${mobileView === "study" ? "flex" : "hidden"} lg:flex w-full lg:w-80 lg:shrink-0 min-h-0 border-e border-[color:rgba(206,17,38,0.14)] p-4 md:p-5 flex-col gap-4 bg-editorial-ivory overflow-y-auto`}
        >

          {/* New chat */}
          <button
            onClick={handleNewChat}
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
            <p className="text-xs text-editorial-charcoal/70 font-serif italic border-t border-editorial-line-light pt-2.5">
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
                      ? "bg-editorial-sage/10 border-s-2 border-editorial-sage shadow-[0_1px_2px_rgba(26,26,26,0.05)]"
                      : "bg-transparent border-s-2 border-transparent hover:bg-editorial-stone"
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

          {/* Chapter mastery, collapsible, secondary */}
          <div className="flex flex-col gap-2 border-t border-editorial-line pt-3 mt-auto">
            <button
              onClick={() => setShowChapters((v) => !v)}
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
                  className="flex items-center gap-1.5 self-start px-2.5 py-1 text-[11px] text-editorial-sage hover:bg-editorial-sage/10 rounded-full transition-colors cursor-pointer"
                >
                  <Plus size={12} /> Add chapter
                </button>

                {isAddingChapter && (
                  <form onSubmit={handleAddChapter} className="bg-white border border-editorial-line p-3 rounded-xl flex flex-col gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Chapter / topic name…"
                      value={newChapterName}
                      onChange={(e) => setNewChapterName(e.target.value)}
                      className="px-3 py-1.5 border border-editorial-line rounded-lg text-xs bg-editorial-ivory/50 focus:outline-none focus:ring-1 focus:ring-editorial-sage placeholder-editorial-charcoal/35"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button type="button" onClick={() => setIsAddingChapter(false)} className="px-2.5 py-1 text-[10px] text-editorial-charcoal/60 hover:bg-editorial-stone rounded">Cancel</button>
                      <button type="submit" className="px-3 py-1 text-[10px] bg-editorial-sage text-white rounded font-medium">Add & study</button>
                    </div>
                  </form>
                )}

                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pe-1">
                  {chapters.map((ch) => (
                    <div
                      key={ch.id}
                      onClick={() => handleSendMessage(`Teach me "${ch.name}" in depth.`, { deep: true })}
                      className="group bg-editorial-stone border border-editorial-line-light p-3 rounded-xl flex flex-col gap-2 hover:border-editorial-sage/40 hover:bg-editorial-sage/[0.05] transition-all cursor-pointer relative"
                    >
                      <div className="flex justify-between items-start gap-1">
                        <h4 className="text-xs font-medium text-editorial-charcoal leading-tight pe-4">{ch.name}</h4>
                        <button onClick={(e) => handleDeleteChapter(ch.id, e)} className="opacity-0 group-hover:opacity-100 absolute top-2 end-2 text-editorial-charcoal/40 hover:text-red-700 transition-opacity">
                          <Trash2 size={11} />
                        </button>
                      </div>
                      <div className="flex items-center gap-1 text-[9px] font-semibold">
                        {(["weak", "developing", "strong"] as const).map((m) => (
                          <button
                            key={m}
                            onClick={(e) => {
                              e.stopPropagation();
                              handleUpdateMastery(ch.id, m);
                            }}
                            className={`px-2 py-0.5 rounded-full transition-colors capitalize ${
                              ch.mastery === m
                                ? m === "weak"
                                  ? "bg-red-50 text-red-800 border border-red-200"
                                  : m === "developing"
                                  ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
                                  : "bg-emerald-50/70 text-emerald-800 border border-emerald-200"
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
          className={`${mobileView === "chat" ? "flex" : "hidden"} lg:flex flex-1 min-h-0 flex-col bg-white/40 p-3 md:p-6 overflow-hidden`}
        >

          {/* Live status strip */}
          {isLiveActive && (
            <div className="mb-3 flex items-center gap-3 px-4 py-2 rounded-xl bg-editorial-stone/80 border border-editorial-sage/30">
              <span className="w-1.5 h-1.5 rounded-full bg-editorial-sage motion-safe:animate-pulse shrink-0" />
              <span className="text-xs text-editorial-charcoal/70 flex-1 truncate">{liveStatus}</span>
              <div className="flex items-center gap-0.5">
                {[3, 6, 9, 6, 3].map((val, idx) => (
                  <motion.div
                    key={idx}
                    animate={{ height: [4, val * 2, 4] }}
                    transition={{ duration: 0.9 + idx * 0.1, repeat: Infinity, ease: "easeInOut" }}
                    className="w-0.5 bg-editorial-sage rounded-full"
                  />
                ))}
              </div>
            </div>
          )}

          {/* Messages */}
          <div ref={messagesRef} className="flex-1 bg-editorial-ivory border border-editorial-line-light rounded-2xl p-3 md:p-5 overflow-y-auto flex flex-col gap-5 min-h-[280px]">
            {chatHistory.length === 0 && !isGenerating && (
              <div className="m-auto w-full max-w-lg rounded-3xl border border-editorial-line bg-editorial-stone/30 px-6 py-8 md:px-9 md:py-10 text-center flex flex-col items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-full bg-editorial-sage shrink-0">
                  <span className="font-serif text-2xl italic leading-none text-editorial-ivory">F</span>
                </div>
                <div>
                  <h2 className="font-serif italic text-2xl md:text-[26px] leading-snug text-editorial-charcoal">
                    What are we working through today{profile.name ? `, ${profile.name.split(" ")[0]}` : ""}?
                  </h2>
                  <p className="mt-2.5 text-sm leading-relaxed text-editorial-sage">
                    Ask it once, ask it ten times. I will explain it a fresh way each time, until it lands.
                  </p>
                </div>
                <div className="w-full mt-2">
                  <p className="mb-2 text-start font-serif italic text-sm text-editorial-charcoal/70">Not sure where to start?</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    {SUGGESTED_QUERIES.map((q, idx) => (
                      <button
                        key={idx}
                        onClick={() => selectSuggestedPrompt(q.prompt)}
                        className="group flex items-start gap-3 text-start px-4 py-3 rounded-2xl border border-editorial-line bg-white hover:border-editorial-sage/50 hover:bg-editorial-sage/[0.06] motion-safe:hover:-translate-y-0.5 transition-all duration-200 cursor-pointer"
                      >
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-editorial-sage/10 text-editorial-sage">
                          <BookOpen size={15} />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-sm font-medium text-editorial-charcoal">{q.label}</span>
                          <span className="mt-0.5 block text-[11px] leading-relaxed text-editorial-charcoal/60">{q.hint}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {chatHistory.map((message, msgIdx) => (
              <motion.div
                key={message.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: [0.22, 0.61, 0.36, 1] }}
                className={`flex flex-col max-w-[92%] md:max-w-[85%] ${message.role === "user" ? "self-end items-end" : "self-start items-start"}`}
              >
                <div className="flex items-center gap-2 mb-1 text-[10px] text-editorial-charcoal/70">
                  <span>{message.role === "user" ? "You" : "فهيم"}</span>
                  <span>·</span>
                  <span>{message.timestamp}</span>
                </div>

                <div
                  className={`p-4 md:p-5 relative border ${
                    message.role === "user"
                      ? "bg-editorial-stone/70 border-editorial-line-light rounded-2xl rounded-se-sm text-editorial-charcoal text-sm md:text-base"
                      : message.isError
                      ? "bg-editorial-stone/60 border-editorial-line-light rounded-2xl rounded-ss-sm text-editorial-charcoal/85 text-sm md:text-base leading-relaxed"
                      : "bg-editorial-ivory border-editorial-line border-s-[3px] border-s-editorial-sage/40 rounded-2xl rounded-ss-sm text-editorial-charcoal text-sm md:text-base leading-relaxed shadow-[0_1px_2px_rgba(26,26,26,0.05)]"
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
                            className="flex items-center gap-2 px-3 py-2 rounded-xl bg-white border border-editorial-line-light text-xs text-editorial-charcoal hover:bg-editorial-stone"
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
                          ? "text-amber-800"
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

                  {/* Curriculum source (Faheem): which MoE/curriculum unit grounded this answer. */}
                  {message.role === "model" && message.grounding && (
                    <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-editorial-sage/10 px-2.5 py-1 text-[11px] font-medium text-editorial-sage">
                      <BookOpen size={12} className="shrink-0" />
                      <span dir="ltr" style={{ unicodeBidi: "isolate" }}>
                        {message.grounding.unitTitle}
                        {message.grounding.section ? ` · ${message.grounding.section}` : ""}
                      </span>
                    </div>
                  )}
                  {/* Honest flag: the question fell outside the grade's textbooks. */}
                  {message.role === "model" && message.outOfSyllabus && !message.grounding && (
                    <div className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-800">
                      <AlertTriangle size={12} className="shrink-0" />
                      <span>خارج نطاق مقرّرك — هذه الإجابة من معرفة عامة وليست من منهجك.</span>
                    </div>
                  )}

                  {/* Sources */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-editorial-line-light flex flex-wrap gap-2 items-center">
                      <span className="text-[10px] text-editorial-charcoal/70 flex items-center gap-1">
                        <Search size={10} className="text-editorial-sage" /> Sources:
                      </span>
                      {message.sources.map((src, sIdx) => (
                        <a key={sIdx} href={src.uri} target="_blank" rel="noreferrer" className="text-[10px] bg-[#FAF9F6] text-editorial-sage px-2.5 py-1 rounded-full border border-editorial-line-light flex items-center gap-1 hover:bg-editorial-sage/10">
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
                          <Sparkles size={12} className="shrink-0" /> Still fuzzy?
                        </button>
                      )}
                      {canGoDeep(message) && (
                        <button
                          onClick={() => handleSendMessage(questionBefore(msgIdx), { deep: true, silent: true })}
                          disabled={isGenerating}
                          className={ACTION_PILL}
                          id={`btn-deepdive-${message.id}`}
                          title="Open the full study view: the exam-ready answer plus the nine-part notebook"
                        >
                          <BookOpen size={12} className="shrink-0" /> Go deeper
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
                      <button
                        onClick={() => handleSpeak(message.id, message.text)}
                        className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs transition-all shrink-0 cursor-pointer sm:ms-auto ${
                          playingMessageId === message.id ? "bg-editorial-sage text-white" : "bg-editorial-stone hover:bg-editorial-sage/10 text-editorial-sage border border-editorial-line-light"
                        }`}
                        id={`btn-tts-${message.id}`}
                      >
                        {playingMessageId === message.id ? <><VolumeX size={12} className="shrink-0" /> Mute</> : <><Volume2 size={12} className="shrink-0" /> Listen</>}
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
                    <div className="h-16 w-16 flex flex-col items-center justify-center gap-1 rounded-lg border border-editorial-line bg-white text-editorial-sage px-1">
                      <FileText size={18} />
                      <span className="text-[8px] text-editorial-charcoal/60 truncate w-full text-center">{att.name}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-1.5 -end-1.5 w-5 h-5 rounded-full bg-editorial-charcoal text-white flex items-center justify-center hover:bg-red-700 transition-colors"
                    title="Remove"
                  >
                    <X size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}

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
                  className="flex shrink-0 items-center gap-1.5 rounded-full bg-editorial-sage px-4 py-2 text-xs font-semibold text-white transition-all hover:opacity-90 disabled:opacity-60 cursor-pointer motion-safe:active:scale-[0.97]"
                  id="btn-save-selection"
                >
                  <BookMarked size={13} /> {savingSelection ? "Saving…" : "Save lines"}
                </button>
              </div>
            )}

          {/* Input */}
          <div className="mt-3 bg-white border border-editorial-line rounded-2xl p-2 flex items-center gap-1.5 shadow-sm focus-within:border-editorial-sage focus-within:ring-1 focus-within:ring-editorial-sage/30 transition-all">
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
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSendMessage()}
              onPaste={handlePaste}
              placeholder="Ask anything, or paste / upload a photo of a question…"
              className="flex-1 px-2 py-2 bg-transparent text-editorial-charcoal focus:outline-none text-sm md:text-base placeholder-editorial-charcoal/30"
              disabled={isGenerating}
              id="input-chat"
            />
            <button
              onClick={isLiveActive ? stopLiveSession : startLiveSession}
              title={isLiveActive ? "Stop the voice session" : "Talk to Faheem with your voice"}
              aria-label={isLiveActive ? "Stop the voice session" : "Talk to Faheem with your voice"}
              className={`w-11 h-11 flex items-center justify-center rounded-full transition-colors shrink-0 cursor-pointer motion-safe:active:scale-[0.96] ${
                isLiveActive
                  ? "bg-editorial-sage text-white hover:bg-editorial-sage/90"
                  : "text-editorial-charcoal/50 hover:bg-editorial-stone hover:text-editorial-sage"
              }`}
              id="btn-voice"
            >
              {isLiveActive ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
            <button
              onClick={() => handleSendMessage()}
              className={`w-11 h-11 rounded-full flex items-center justify-center shrink-0 cursor-pointer motion-safe:transition-all motion-safe:active:scale-[0.96] ${
                isGenerating
                  ? "bg-editorial-sage/70 text-white"
                  : "bg-editorial-sage hover:bg-editorial-sage/90 text-white disabled:bg-transparent disabled:text-editorial-sage/40 disabled:border disabled:border-editorial-sage/25"
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
          <div className="fixed inset-0 bg-[#1e1e1a]/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <motion.div
              initial={{ scale: 0.98, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.98, opacity: 0 }}
              className="bg-editorial-ivory border border-editorial-line w-full max-w-lg rounded-3xl p-6 md:p-8 shadow-xl max-h-[90vh] overflow-y-auto"
            >
              <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                  <Settings size={18} className="text-editorial-sage" />
                  <h3 className="text-base font-serif font-medium text-editorial-charcoal">Study Preferences</h3>
                </div>
                <button onClick={() => setIsEditingProfile(false)} className="text-editorial-charcoal/40 hover:text-editorial-charcoal text-2xl cursor-pointer leading-none">&times;</button>
              </div>

              <form onSubmit={handleSaveProfile} className="flex flex-col gap-5">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-editorial-charcoal/70">My name</label>
                  <input
                    type="text"
                    required
                    value={editProfileForm.name}
                    onChange={(e) => setEditProfileForm({ ...editProfileForm, name: e.target.value })}
                    className="px-4 py-2.5 border border-editorial-line rounded-xl text-sm bg-white focus:outline-none focus:ring-1 focus:ring-editorial-sage text-editorial-charcoal"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-editorial-charcoal/70">Board / Exam</label>
                    <select value={editProfileForm.board} onChange={(e) => setEditProfileForm({ ...editProfileForm, board: e.target.value })} className="px-4 py-2.5 border border-editorial-line rounded-xl text-sm bg-white focus:outline-none text-editorial-charcoal">
                      <option value="Bahrain MoE">Bahrain MoE</option>
                      <option value="CBSE">CBSE</option>
                      <option value="Cambridge">Cambridge</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-editorial-charcoal/70">Grade / Level</label>
                    <select value={editProfileForm.grade} onChange={(e) => setEditProfileForm({ ...editProfileForm, grade: e.target.value })} className="px-4 py-2.5 border border-editorial-line rounded-xl text-sm bg-white focus:outline-none text-editorial-charcoal">
                      <option value="Grade 9">Grade 9</option>
                      <option value="Grade 10">Grade 10</option>
                      <option value="Grade 11">Grade 11</option>
                      <option value="Grade 12">Grade 12</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-editorial-charcoal/70">Language</label>
                    <select value={editProfileForm.language} onChange={(e) => setEditProfileForm({ ...editProfileForm, language: e.target.value })} className="px-4 py-2.5 border border-editorial-line rounded-xl text-sm bg-white focus:outline-none text-editorial-charcoal">
                      <option value="Arabic">Arabic</option>
                      <option value="English">English</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[11px] font-semibold text-editorial-charcoal/70">Preferred analogy</label>
                    <select value={editProfileForm.preferredAnalogy} onChange={(e) => setEditProfileForm({ ...editProfileForm, preferredAnalogy: e.target.value })} className="px-4 py-2.5 border border-editorial-line rounded-xl text-sm bg-white focus:outline-none text-editorial-charcoal">
                      <option value="Daily Life">Daily Life / Everyday objects</option>
                      <option value="Sports">Sports / Cricket / Football</option>
                      <option value="Cooking">Cooking & Kitchen recipes</option>
                      <option value="Bicycles & Trains">Bicycles, Trains & Transportation</option>
                      <option value="Mobile Phones & Tech">Mobile Phones, Games & Apps</option>
                    </select>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-editorial-charcoal/70">Voice (for spoken answers)</label>
                  <div className="grid grid-cols-5 gap-1.5">
                    {(["Kore", "Zephyr", "Puck", "Charon", "Fenrir"] as const).map((vc) => (
                      <button key={vc} type="button" onClick={() => setSelectedVoice(vc)} className={`py-2 px-1 rounded-full text-[11px] font-medium text-center border transition-colors cursor-pointer ${selectedVoice === vc ? "bg-editorial-sage border-editorial-sage text-white" : "bg-white border-editorial-line-light hover:bg-editorial-stone text-editorial-charcoal"}`}>
                        {vc}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-editorial-charcoal/70">Exam goals</label>
                  <textarea rows={2} value={editProfileForm.examGoals} onChange={(e) => setEditProfileForm({ ...editProfileForm, examGoals: e.target.value })} className="px-4 py-3 border border-editorial-line rounded-xl text-sm bg-white focus:outline-none focus:ring-1 focus:ring-editorial-sage resize-none text-editorial-charcoal" />
                </div>

                <div className="flex justify-end gap-2 mt-2">
                  <button type="button" onClick={() => setIsEditingProfile(false)} className="px-5 py-2.5 border border-editorial-line text-editorial-charcoal hover:bg-editorial-stone rounded-full text-sm transition-colors cursor-pointer">Cancel</button>
                  <button type="submit" className="px-5 py-2.5 bg-editorial-charcoal hover:bg-editorial-charcoal/90 text-white rounded-full text-sm transition-colors cursor-pointer">Save changes</button>
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
      label = remaining == null ? `${planName} · Unlimited` : `${planName} · ${remaining} left`;
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
          ? "border-amber-200 bg-amber-50 text-amber-800 hover:bg-amber-100"
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
      <div className="p-4 rounded-2xl bg-editorial-stone/40 border border-editorial-line-light rounded-ss-sm max-w-md">
        <div className="flex items-center gap-1.5 mb-2 text-editorial-sage">
          <Sparkles size={12} />
          <span className="font-serif italic text-xs">Did you know?</span>
        </div>
        <AnimatePresence mode="wait">
          <motion.p
            key={idx}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.4 }}
            className="text-sm text-editorial-charcoal/80 font-serif italic leading-relaxed"
          >
            {fact.text}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

