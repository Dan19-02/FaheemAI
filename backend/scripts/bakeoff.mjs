/**
 * Bake-off regression harness: sends the same student questions through the
 * REAL local backend (auth → /api/chat → grounding → auto-routing → Gemini),
 * and optionally through raw Gemini with no teaching prompt, so any prompt
 * change can be judged against "every other AI" before it ships.
 *
 * Usage:
 *   node scripts/bakeoff.mjs            # answers via the local server
 *   node scripts/bakeoff.mjs --raw      # also the raw Gemini baseline
 *   node scripts/bakeoff.mjs --tag v2   # label the output files
 *
 * Requires the backend running locally (npm run dev) and backend/.env keys.
 * Output: scripts/bakeoff-out/<tag>--<label>.md (one file per answer).
 * The archived evidence from past runs lives in docs/eval/bakeoff-out/.
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(HERE, "bakeoff-out");
fs.mkdirSync(OUT_DIR, { recursive: true });

// ---- .env (manual parse: no dependency on the backend's install) ----
const env = {};
for (const line of fs.readFileSync(path.join(HERE, "..", ".env"), "utf8").split("\n")) {
  const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2];
}
const PORT = Number(process.env.BAKEOFF_PORT) || Number(env.PORT) || 4000;
const BASE = `http://localhost:${PORT}/api`;

const args = process.argv.slice(2);
const RAW = args.includes("--raw");
const TAG = args.includes("--tag") ? args[args.indexOf("--tag") + 1] : "run";
const TIMEOUT_MS = 300_000;

// ---- The fixed question set. Add questions here as the suite grows. ----
// The test student mirrors the app's default profile (CBSE, 11th, Hinglish)
// with a realistic Class 11 study log; the English variant is the control
// that shows how much differentiation survives without the Hinglish wrapper.
const PROFILE = {
  board: "CBSE",
  grade: "11th Grade",
  language: "Hinglish",
  preferredAnalogy: "Daily Life",
};
const RECENT_TOPICS = ["Motion in a Straight Line (finding it hard)", "Laws of Motion", "Units and Measurements"];
const Q1 =
  "Sir I didn't understand refraction in class today. Why does a pencil look bent when I put it in a glass of water? Please explain simply.";
const Q2 =
  "A ball is dropped from the top of a tower 80 m high. Calculate the time it takes to reach the ground and its velocity just before hitting the ground. (g = 10 m/s²)";

const CASES = [
  { label: "q1-refraction--clarify", message: Q1, body: { ...PROFILE, recentTopics: RECENT_TOPICS } },
  { label: "q2-tower-numerical--clarify", message: Q2, body: { ...PROFILE, recentTopics: RECENT_TOPICS } },
  { label: "q1-refraction--clarify-english", message: Q1, body: { ...PROFILE, language: "English", recentTopics: RECENT_TOPICS } },
];

// ---- Helpers ----
async function timed(label, fn) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const t0 = Date.now();
  try {
    const text = await fn(controller.signal);
    return { label, ok: true, secs: ((Date.now() - t0) / 1000).toFixed(1), text };
  } catch (e) {
    const reason = controller.signal.aborted ? `TIMED OUT at ${TIMEOUT_MS / 1000}s` : e?.message || String(e);
    return { label, ok: false, secs: ((Date.now() - t0) / 1000).toFixed(1), text: `ERROR: ${reason}` };
  } finally {
    clearTimeout(timer);
  }
}

async function api(pathname, body, token, signal) {
  const resp = await fetch(`${BASE}${pathname}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
    signal,
  });
  const data = await resp.json().catch(() => ({}));
  if (!resp.ok) throw new Error(`${pathname} HTTP ${resp.status}: ${data.error || "unknown"}`);
  return data;
}

/** The bake-off account: created on first run, reused after. */
async function login() {
  const creds = { email: "bakeoff@clarify.local", password: "bakeoff-local-only" };
  try {
    const r = await api("/auth/login", creds);
    return r.token;
  } catch {
    const r = await api("/auth/signup", {
      ...creds,
      name: "Bakeoff Student",
      ...PROFILE,
      examGoals: "Bake-off regression account",
      confidenceLevel: 3,
    });
    return r.token;
  }
}

async function callRawGemini(question, signal) {
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent?key=${env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts: [{ text: question }] }] }),
      signal,
    }
  );
  if (!resp.ok) throw new Error(`HTTP ${resp.status}: ${(await resp.text()).slice(0, 300)}`);
  const data = await resp.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  if (!text) throw new Error("empty response");
  return text;
}

// ---- Run ----
const token = await login();
console.log(`Bake-off "${TAG}" against ${BASE} (${CASES.length} Clarify cases${RAW ? " + raw baselines" : ""})`);

const jobs = CASES.map((c) =>
  timed(c.label, async (signal) => {
    const r = await api("/chat", { message: c.message, history: [], deep: false, images: [], ...c.body }, token, signal);
    return `${r.cached ? "[SERVED FROM CACHE]\n\n" : ""}${r.text}`;
  })
);
if (RAW) {
  // MiniMax/NIM raw baselines were removed with the open-source backend; only
  // the raw Gemini baseline remains, and it needs the key to be configured.
  if (!env.GEMINI_API_KEY) {
    console.warn("--raw skipped: GEMINI_API_KEY missing from backend/.env");
  } else {
    for (const [qKey, q] of [
      ["q1-refraction", Q1],
      ["q2-tower-numerical", Q2],
    ]) {
      jobs.push(timed(`${qKey}--raw-gemini-3.5-flash`, (s) => callRawGemini(q, s)));
    }
  }
}

const results = await Promise.all(jobs);
let failures = 0;
for (const r of results) {
  if (!r.ok) failures++;
  const file = path.join(OUT_DIR, `${TAG}--${r.label}.md`);
  fs.writeFileSync(file, `# ${r.label} (${TAG})\nstatus: ${r.ok ? "ok" : "FAILED"} | latency: ${r.secs}s\n\n---\n\n${r.text}\n`);
  console.log(`${r.ok ? "OK " : "ERR"} ${r.label} (${r.secs}s, ${r.text.length} chars)`);
}
console.log(failures ? `DONE with ${failures} failure(s)` : "ALL DONE");
console.log(`Outputs: ${OUT_DIR}`);
