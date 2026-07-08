/**
 * chatStream SSE parsing: frames split across network chunks (including a
 * split INSIDE a multibyte Arabic character), plus the done / paywall /
 * fallback / error control frames and the 401 token-drop path. fetch and
 * localStorage are stubbed; no server is involved.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { api, setToken, getToken, ApiError } from "./api";

// ---- browser global stubs ----
const store = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

let lastFetchArgs: { url: string; init: RequestInit } | null = null;

/** Build a fetch stub that streams the given chunks as the response body. */
function streamingFetch(chunks: (string | Uint8Array)[], status = 200) {
  const encoder = new TextEncoder();
  return vi.fn(async (url: string, init: RequestInit) => {
    lastFetchArgs = { url, init };
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const c of chunks) controller.enqueue(typeof c === "string" ? encoder.encode(c) : c);
        controller.close();
      },
    });
    return { ok: status < 400, status, body, json: async () => ({}) };
  });
}

function jsonFetch(status: number, payload: unknown) {
  return vi.fn(async (url: string, init: RequestInit) => {
    lastFetchArgs = { url, init };
    return { ok: status < 400, status, body: null, json: async () => payload };
  });
}

const frame = (obj: unknown) => `data: ${JSON.stringify(obj)}\n\n`;

beforeEach(() => {
  store.clear();
  lastFetchArgs = null;
});

describe("api.chatStream", () => {
  it("reassembles a delta frame split across chunks and resolves on done", async () => {
    const full = frame({ type: "delta", text: "Hel" }) + frame({ type: "delta", text: "lo" });
    // Split mid-frame (not on a \n\n boundary) to exercise the buffer.
    const cut = full.indexOf('"text":"Hel') + 5;
    vi.stubGlobal(
      "fetch",
      streamingFetch([
        full.slice(0, cut),
        full.slice(cut),
        frame({ type: "done", text: "Hello", sources: [{ title: "T", uri: "u" }], verification: "passed" }),
      ])
    );

    const deltas: string[] = [];
    const result = await api.chatStream({ message: "hi" }, (d) => deltas.push(d), () => {});
    expect(deltas).toEqual(["Hel", "lo"]);
    expect(result).toEqual({
      kind: "done",
      text: "Hello",
      sources: [{ title: "T", uri: "u" }],
      verification: "passed",
      grounding: undefined,
      outOfSyllabus: undefined,
    });
    expect(lastFetchArgs?.url).toBe("/api/chat/stream");
  });

  it("decodes a chunk boundary that lands inside a multibyte Arabic character", async () => {
    const bytes = new TextEncoder().encode(frame({ type: "delta", text: "مرحبا بك" }) + frame({ type: "done", text: "مرحبا بك", sources: [] }));
    // The payload prefix `data: {"type":"delta","text":"` is 30 bytes of
    // ASCII, so byte 31 lands INSIDE the two-byte UTF-8 encoding of "م".
    const cut = 31;
    vi.stubGlobal("fetch", streamingFetch([bytes.slice(0, cut), bytes.slice(cut)]));

    const deltas: string[] = [];
    const result = await api.chatStream({ message: "سلام" }, (d) => deltas.push(d), () => {});
    expect(deltas).toEqual(["مرحبا بك"]);
    expect(result.kind).toBe("done");
  });

  it("fires onChecking for the examiner frame before done", async () => {
    vi.stubGlobal(
      "fetch",
      streamingFetch([
        frame({ type: "delta", text: "draft" }),
        frame({ type: "checking" }),
        frame({ type: "done", text: "corrected", sources: [], verification: "passed" }),
      ])
    );
    let checking = 0;
    const result = await api.chatStream({ message: "q" }, () => {}, () => checking++);
    expect(checking).toBe(1);
    expect(result.kind).toBe("done");
    expect((result as { text?: string }).text).toBe("corrected");
  });

  it("returns the paywall frame with its subscription snapshot", async () => {
    vi.stubGlobal(
      "fetch",
      streamingFetch([frame({ type: "paywall", error: "Trial is over.", subscription: { plan: "trial", state: "trial_expired" } })])
    );
    const result = await api.chatStream({ message: "q" }, () => {}, () => {});
    expect(result).toEqual({
      kind: "paywall",
      error: "Trial is over.",
      subscription: { plan: "trial", state: "trial_expired" },
    });
  });

  it("returns the fallback instruction (client retries on plain /chat)", async () => {
    vi.stubGlobal("fetch", streamingFetch([frame({ type: "fallback", reason: "route" })]));
    const result = await api.chatStream({ message: "q" }, () => {}, () => {});
    expect(result).toEqual({ kind: "fallback", reason: "route" });
  });

  it("throws on an error frame", async () => {
    vi.stubGlobal("fetch", streamingFetch([frame({ type: "error", error: "boom" })]));
    await expect(api.chatStream({ message: "q" }, () => {}, () => {})).rejects.toThrow("boom");
  });

  it("throws when the stream ends without a done frame", async () => {
    vi.stubGlobal("fetch", streamingFetch([frame({ type: "delta", text: "half an ans" })]));
    await expect(api.chatStream({ message: "q" }, () => {}, () => {})).rejects.toThrow(/ended before the answer was complete/);
  });

  it("skips malformed data lines instead of dying", async () => {
    vi.stubGlobal(
      "fetch",
      streamingFetch(["data: {not json}\n\n", ": comment\n\n", frame({ type: "done", text: "ok", sources: [] })])
    );
    const result = await api.chatStream({ message: "q" }, () => {}, () => {});
    expect(result.kind).toBe("done");
  });

  it("attaches the stored token as a Bearer header", async () => {
    setToken("tok-123");
    vi.stubGlobal("fetch", streamingFetch([frame({ type: "done", text: "ok", sources: [] })]));
    await api.chatStream({ message: "q" }, () => {}, () => {});
    const headers = lastFetchArgs?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tok-123");
  });

  it("drops a rejected token on 401 and surfaces an ApiError", async () => {
    setToken("expired-tok");
    vi.stubGlobal("fetch", jsonFetch(401, { error: "Please sign in to continue." }));
    await expect(api.chatStream({ message: "q" }, () => {}, () => {})).rejects.toMatchObject({
      name: "ApiError",
      status: 401,
      message: "Please sign in to continue.",
    });
    expect(getToken()).toBeNull();
  });
});

describe("api.request (via api.me)", () => {
  it("throws a typed ApiError carrying code + subscription on 402", async () => {
    vi.stubGlobal(
      "fetch",
      jsonFetch(402, { error: "Out of questions.", code: "payment_required", subscription: { plan: "trial" } })
    );
    try {
      await api.chat({ message: "q" });
      expect.unreachable("should have thrown");
    } catch (e) {
      const err = e as ApiError;
      expect(err).toBeInstanceOf(ApiError);
      expect(err.status).toBe(402);
      expect(err.code).toBe("payment_required");
      expect(err.subscription).toEqual({ plan: "trial" });
    }
  });
});
