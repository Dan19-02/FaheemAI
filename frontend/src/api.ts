/**
 * Tiny API client for the Express backend.
 * Stores the JWT in localStorage and attaches it as a Bearer token.
 * All requests go to /api/* (proxied to the backend by Vite in dev).
 */
import type {
  StudentProfile,
  ChapterProgress,
  ChatMessage,
  Conversation,
  Subscription,
  NotebookSummary,
  NotebookEntry,
  ClarifyNote,
  GroundingSource,
  Attachment,
} from "./types";
// DEV-ONLY preview harness; the reference below sits inside an
// `import.meta.env.DEV` branch so production builds tree-shake it out.
import { isPreview, installPreviewMocks } from "./previewMock";

const TOKEN_KEY = "clarify_token";
const API_BASE = import.meta.env.VITE_API_URL || "";

/** An error from the API that carries the HTTP status and, for a blocked
 *  question (402), the machine-readable code plus the current subscription so
 *  the UI can open the upgrade flow with an accurate usage snapshot. */
export class ApiError extends Error {
  status: number;
  code?: string;
  subscription?: Subscription;
  constructor(message: string, status: number, code?: string, subscription?: Subscription) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.subscription = subscription;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

// Session-expiry hook: when a request comes back 401 while we HELD a token,
// the token is dead (expired or revoked). Clearing localStorage alone is not
// enough, the signed-in UI would keep rendering against a dead session, so
// AuthContext registers a callback here to drop the account immediately.
let onUnauthorized: (() => void) | null = null;
export function setOnUnauthorized(cb: (() => void) | null) {
  onUnauthorized = cb;
}
function handleUnauthorized(hadToken: boolean) {
  setToken(null);
  if (hadToken) onUnauthorized?.();
}

export interface Account {
  id: number;
  email: string;
  profile: StudentProfile;
  chapters: ChapterProgress[];
  subscription?: Subscription;
}

export interface PlanInfo {
  id: "starter" | "regular" | "unlimited";
  name: string;
  /** BHD for display; the backend charges amountFils (1 BHD = 1000 fils). */
  price: number;
  amountFils: number;
  monthlyQueries: number | null;
  blurb: string;
}

export interface PlansResponse {
  plans: PlanInfo[];
  trial: { days: number; dailyQueries: number };
  passDays: number;
  configured: boolean;
  currency: string;
}

/** What the backend returns to open Razorpay Checkout for a plan. */
export interface OrderResponse {
  orderId: string;
  amount: number;
  currency: string;
  keyId: string;
  plan: string;
  planName: string;
  prefill: { email: string; name: string };
}

export interface SignupInput {
  email: string;
  password: string;
  name: string;
  board: string;
  grade: string;
  language: string;
  preferredAnalogy: string;
  examGoals: string;
  confidenceLevel: number;
}

/** The error payload every backend route uses for a non-2xx response. */
interface ErrorBody {
  error?: string;
  code?: string;
  subscription?: Subscription;
}

async function request<T = unknown>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api${path}`, {
  ...options,
  headers,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    // Token rejected: clear it and tell AuthContext, so the app drops back to
    // the login screen instead of a zombie workspace where every call fails.
    if (res.status === 401) handleUnauthorized(Boolean(token));
    const err = (data ?? {}) as ErrorBody;
    throw new ApiError(
      err.error || `Request failed (${res.status})`,
      res.status,
      err.code,
      err.subscription
    );
  }
  return data as T;
}

/** Curriculum grounding chip attached to an answer (same shape the UI stores
 *  on ChatMessage.grounding). */
export type ChatGrounding = NonNullable<ChatMessage["grounding"]>;

/** Everything /chat and /chat/stream accept. All fields beyond the message
 *  are optional; the backend fills sensible defaults. */
export interface ChatRequestBody {
  message: string;
  history?: { role: string; text: string }[];
  mode?: string;
  board?: string;
  grade?: string;
  language?: string;
  preferredAnalogy?: string;
  /** Study-log topics that personalize the answer (kept out of shared caches). */
  recentTopics?: string[];
  deep?: boolean;
  deepVerify?: boolean;
  images?: { data: string; mimeType: string }[];
}

/** The /chat response payload. */
export interface ChatResponse {
  text: string;
  sources: GroundingSource[];
  cached?: boolean;
  verification?: "passed" | "unavailable";
  grounding?: ChatGrounding;
  outOfSyllabus?: boolean;
}

export type ChatStreamResult =
  | { kind: "done"; text: string; sources: GroundingSource[]; verification?: "passed" | "unavailable"; grounding?: ChatGrounding; outOfSyllabus?: boolean }
  | { kind: "fallback"; reason: string }
  | { kind: "paywall"; error: string; subscription?: Subscription };

/** One SSE frame from /chat/stream; the shape is owned by the backend
 *  (ai.ts emits these), so parsing trusts it after the JSON.parse guard. */
interface StreamFrame {
  type: "delta" | "checking" | "done" | "fallback" | "paywall" | "error";
  text?: string;
  sources?: GroundingSource[];
  verification?: "passed" | "unavailable";
  grounding?: ChatGrounding;
  outOfSyllabus?: boolean;
  reason?: string;
  error?: string;
  subscription?: Subscription;
}

/**
 * Streaming chat (SSE over fetch, POST /chat/stream). onDelta receives each
 * incremental chunk; onChecking fires when the Deep-check examiner starts on
 * the completed draft. Resolves with the authoritative final answer ("done",
 * whose text REPLACES the streamed draft) or a "fallback" instruction to use
 * the plain /chat endpoint. Throws on network or server errors.
 */
async function chatStream(
  body: ChatRequestBody,
  onDelta: (chunk: string) => void,
  onChecking: () => void
): Promise<ChatStreamResult> {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}/api/chat/stream`, { method: "POST", headers, body: JSON.stringify(body) });
  if (res.status === 401) handleUnauthorized(Boolean(token));
  if (!res.ok || !res.body) {
    // Read the server's error body so the real reason (quota, validation,
    // maintenance) reaches the UI instead of a bare status code.
    const data = (await res.json().catch(() => ({}))) as ErrorBody;
    throw new ApiError(data.error || `Stream request failed (${res.status})`, res.status, data.code, data.subscription);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const frames = buf.split("\n\n");
    buf = frames.pop() || "";
    for (const frame of frames) {
      const line = frame.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      let msg: StreamFrame;
      try {
        msg = JSON.parse(line.slice(5).trim());
      } catch {
        continue;
      }
      if (msg.type === "delta" && typeof msg.text === "string") onDelta(msg.text);
      else if (msg.type === "checking") onChecking();
      else if (msg.type === "done") return { kind: "done", text: msg.text || "", sources: msg.sources || [], verification: msg.verification, grounding: msg.grounding, outOfSyllabus: msg.outOfSyllabus };
      else if (msg.type === "fallback") return { kind: "fallback", reason: msg.reason || "" };
      else if (msg.type === "paywall") return { kind: "paywall", error: msg.error || "", subscription: msg.subscription };
      else if (msg.type === "error") throw new Error(msg.error || "Stream error");
    }
  }
  throw new Error("The stream ended before the answer was complete.");
}

export const api = {
  signup: (body: SignupInput) =>
    request<{ token: string; user: Account }>("/auth/signup", { method: "POST", body: JSON.stringify(body) }),
  login: (email: string, password: string) =>
    request<{ token: string; user: Account }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  /** Exchange a Google Identity credential (ID token) for an app session. */
  googleAuth: (credential: string) =>
    request<{ token: string; user: Account }>("/auth/google", { method: "POST", body: JSON.stringify({ credential }) }),
  me: () => request<{ user: Account }>("/me"),
  updateMe: (body: StudentProfile & { chapters: ChapterProgress[] }) =>
    request<{ user: Account }>("/me", { method: "PUT", body: JSON.stringify(body) }),

  // Billing (Razorpay one-time monthly pass)
  getPlans: () => request<PlansResponse>("/billing/plans"),
  getSubscription: () => request<{ subscription: Subscription }>("/subscription"),
  createOrder: (plan: string) =>
    request<OrderResponse>("/billing/order", { method: "POST", body: JSON.stringify({ plan }) }),
  verifyPayment: (body: {
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    plan: string;
  }) => request<{ ok: boolean; subscription: Subscription }>("/billing/verify", { method: "POST", body: JSON.stringify(body) }),

  // Conversations (separate chat windows)
  listConversations: () => request<{ conversations: Conversation[] }>("/conversations"),
  createConversation: (title?: string) =>
    request<{ conversation: Conversation }>("/conversations", { method: "POST", body: JSON.stringify({ title }) }),
  renameConversation: (id: string, title: string) =>
    request(`/conversations/${id}`, { method: "PATCH", body: JSON.stringify({ title }) }),
  deleteConversation: (id: string) => request(`/conversations/${id}`, { method: "DELETE" }),
  getMessages: (conversationId: string) =>
    request<{ messages: ChatMessage[] }>(`/conversations/${conversationId}/messages`),
  addMessage: (
    conversationId: string,
    msg: { id: string; role: string; text: string; mode?: string; sources?: GroundingSource[]; attachments?: Attachment[] }
  ) => request(`/conversations/${conversationId}/messages`, { method: "POST", body: JSON.stringify(msg) }),
  /** Unwind an optimistically saved question that the paywall blocked. */
  deleteMessage: (conversationId: string, messageId: string) =>
    request(`/conversations/${conversationId}/messages/${messageId}`, { method: "DELETE" }),

  // Pre-exam notebook
  saveNotebookEntry: (body: { text: string; question?: string; messageId?: string; conversationId?: string }) =>
    request<{ ok: boolean; id: string }>("/notebook/entries", { method: "POST", body: JSON.stringify(body) }),
  getNotebook: () => request<NotebookSummary>("/notebook"),
  getNotebookChapter: (subject: string, chapter: string) =>
    request<{ entries: NotebookEntry[]; note: ClarifyNote | null }>(
      `/notebook/entries?subject=${encodeURIComponent(subject)}&chapter=${encodeURIComponent(chapter)}`
    ),
  deleteNotebookEntry: (id: string) => request(`/notebook/entries/${id}`, { method: "DELETE" }),
  generateClarifyNotes: (subject: string, chapter: string) =>
    request<ClarifyNote>("/notebook/notes", { method: "POST", body: JSON.stringify({ subject, chapter }) }),

  /** Translated VIEW of stored messages, for the language toggle. The server
   *  caches by content hash, so flipping back and forth costs one call each
   *  way per message, ever. Stored text is never rewritten. */
  translate: (body: { target: "ar" | "en"; items: { id: string; text: string }[] }) =>
    request<{ translations: Record<string, string> }>("/chat/translate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  chat: (body: ChatRequestBody) =>
    request<ChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  chatStream,
  /** On-demand Deep-check of an existing answer (examiner pass). */
  deepCheck: (body: { question: string; text: string }) =>
    request<{ text: string; verification: "passed" | "unavailable" }>("/chat/verify", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  tts: (body: { text: string; voice: string }) => request<{ audio: string }>("/tts", { method: "POST", body: JSON.stringify(body) }),
};

// DEV-ONLY: `?preview=1` renders the signed-in workspace with seeded data and
// no backend. Runs synchronously at module load so the mocks are in place
// before AuthContext restores the session. Compiled out of production builds
// (import.meta.env.DEV is statically false, so the branch is tree-shaken).
if (import.meta.env.DEV && isPreview()) installPreviewMocks(api);
