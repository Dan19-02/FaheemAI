/**
 * Kimi (Moonshot) answer backend. OpenAI-compatible chat completions used as
 * Faheem's primary text brain when ANSWER_BACKEND=kimi. Gemini stays the
 * backend for things Kimi cannot do (image vision, embeddings) and as the
 * automatic fallback.
 *
 * Notes that shaped this module (all verified against the live API):
 * - kimi-k2.7-code-highspeed answers in ~5 to 10s with the full teaching prompt;
 *   the general kimi-k2.6 is as good but 35 to 140s, too slow for the catch-net.
 * - temperature is LOCKED to 1 for these models; any other value is a 400. We
 *   ignore the caller's temperature and always send 1.
 * - internet access is the $web_search builtin tool: the model emits a
 *   tool_call, Moonshot runs the search server-side, and we echo the tool-call
 *   arguments straight back as the tool result to let it continue.
 */

export const KIMI_BASE_URL = (process.env.KIMI_BASE_URL || "https://api.moonshot.ai/v1").replace(/\/$/, "");
export const KIMI_API_KEY = process.env.KIMI_API_KEY || "";
export const KIMI_MODEL = process.env.KIMI_MODEL || "kimi-k2.7-code-highspeed";

/** Which brain answers chat. Default "kimi"; set ANSWER_BACKEND=gemini to revert. */
export const ANSWER_BACKEND = (process.env.ANSWER_BACKEND || "kimi").toLowerCase();
export const kimiConfigured = Boolean(KIMI_API_KEY);
/** True when Kimi should serve text answers (backend chosen AND key present). */
export const kimiIsAnswerBackend = ANSWER_BACKEND === "kimi" && kimiConfigured;

export interface KimiTurn {
  role: "user" | "model" | "assistant";
  text: string;
}
export interface KimiSource {
  title: string;
  uri: string;
}

/** Map Faheem's {system, history, message} into OpenAI-style messages. */
function toMessages(system: string, history: KimiTurn[] | undefined, message: string): any[] {
  const msgs: any[] = [{ role: "system", content: system }];
  if (Array.isArray(history)) {
    for (const h of history) {
      const role = h.role === "user" ? "user" : "assistant";
      if (h.text) msgs.push({ role, content: h.text });
    }
  }
  msgs.push({ role: "user", content: message || "" });
  return msgs;
}

async function post(body: any, signal?: AbortSignal): Promise<Response> {
  return fetch(`${KIMI_BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KIMI_API_KEY}` },
    body: JSON.stringify(body),
    signal,
  });
}

/** Pull markdown-link and bare URLs out of an answer so search replies still
 *  carry clickable sources (Kimi cites inline; it exposes no grounding array). */
function extractSources(text: string): KimiSource[] {
  const out: KimiSource[] = [];
  const seen = new Set<string>();
  const md = /\[([^\]]{1,80})\]\((https?:\/\/[^)\s]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = md.exec(text))) {
    if (!seen.has(m[2])) { seen.add(m[2]); out.push({ title: m[1], uri: m[2] }); }
  }
  const bare = /(?<!\()\bhttps?:\/\/[^\s)\]]+/g;
  while ((m = bare.exec(text))) {
    const uri = m[0].replace(/[.,;]+$/, "");
    if (!seen.has(uri)) { seen.add(uri); out.push({ title: new URL(uri).hostname.replace(/^www\./, ""), uri }); }
  }
  return out;
}

/**
 * Non-streaming answer. When search=true the $web_search tool loop runs so the
 * reply is grounded on live results. Returns the text plus any cited sources.
 */
export async function kimiGenerate(
  opts: { system: string; history?: KimiTurn[]; message: string; search?: boolean },
  signal?: AbortSignal
): Promise<{ text: string; sources: KimiSource[] }> {
  const messages = toMessages(opts.system, opts.history, opts.message);
  const tools = opts.search ? [{ type: "builtin_function", function: { name: "$web_search" } }] : undefined;

  // Up to a few hops so the model can search, read, then answer.
  for (let hop = 0; hop < 6; hop++) {
    const resp = await post({ model: KIMI_MODEL, temperature: 1, messages, ...(tools ? { tools } : {}) }, signal);
    if (!resp.ok) throw new Error(`Kimi HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
    const data: any = await resp.json();
    const choice = data.choices?.[0];
    const msg = choice?.message;
    if (choice?.finish_reason === "tool_calls" && Array.isArray(msg?.tool_calls)) {
      messages.push(msg);
      for (const tc of msg.tool_calls) {
        // $web_search is server-executed: echo the arguments back verbatim.
        messages.push({ role: "tool", tool_call_id: tc.id, name: tc.function?.name, content: tc.function?.arguments || "{}" });
      }
      continue;
    }
    const text = (msg?.content || "").trim();
    if (!text) throw new Error("Kimi returned an empty answer.");
    return { text, sources: opts.search ? extractSources(text) : [] };
  }
  throw new Error("Kimi web-search loop did not converge.");
}

/**
 * Stream answer deltas (no tools; used for standard/thinking, not search).
 * Yields each text delta; throws on API error or an empty stream so the caller
 * can fall back to plain /chat, matching the Gemini streamer's contract.
 */
export async function* kimiStream(
  opts: { system: string; history?: KimiTurn[]; message: string },
  signal?: AbortSignal
): AsyncGenerator<string> {
  const messages = toMessages(opts.system, opts.history, opts.message);
  const resp = await post({ model: KIMI_MODEL, temperature: 1, stream: true, messages }, signal);
  if (!resp.ok || !resp.body) throw new Error(`Kimi stream HTTP ${resp.status}: ${(await resp.text().catch(() => "")).slice(0, 300)}`);

  let buffer = "";
  let chars = 0;
  const decoder = new TextDecoder();
  for await (const chunk of resp.body as any) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl: number;
    // SSE frames are separated by a blank line; each carries one "data:" field.
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") { if (chars === 0) throw new Error("Kimi streamed an empty response."); return; }
      try {
        const delta = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (delta) { chars += delta.length; yield delta; }
      } catch {
        // Ignore keep-alive / partial frames.
      }
    }
  }
  if (chars === 0) throw new Error("Kimi streamed an empty response.");
}
