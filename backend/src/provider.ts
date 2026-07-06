/**
 * Provider adapter: one provider-agnostic interface for generate() + embed().
 *
 * WHY: the Arabic explanation-quality bake-off (PRD S10) decides the production
 * model, and it must not have decided yet when we write the pipeline. So all
 * generation/embedding goes through this interface. The default impl is Gemini
 * (what the Clarify fork already ships, simplest data-residency); swapping in
 * the bake-off winner (e.g. Claude on Bedrock) means adding one Provider impl
 * and flipping FAHIM_PROVIDER, not rewriting the pipeline.
 *
 * Every call is routed through resilience.callExternal (timeout + retry + circuit
 * breaker). This is now the canonical embed path; it supersedes the legacy
 * embed() in knowledge.ts, which the accuracy engine will be migrated onto.
 */
import { ai, apiKey } from "./gemini.js";
import { callExternal } from "./resilience.js";

/** Embedding task types. Retrieval is ASYMMETRIC (query vs document), so those
 *  two are correct for RAG; SEMANTIC_SIMILARITY is only right for the paraphrase
 *  semantic cache. Clarify mis-used SEMANTIC_SIMILARITY for retrieval, which
 *  silently costs recall. */
export type EmbedTaskType = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY" | "SEMANTIC_SIMILARITY";

export interface GenerateRequest {
  /** System instruction / role setup. */
  system?: string;
  /** The user turn (text). Multimodal parts are added in a later phase. */
  prompt: string;
  temperature?: number;
  /** 'high' forces deep reasoning (Type A worked solutions); omit for default. */
  thinking?: "high" | "default";
  /**
   * JSON schema for structured output. Used by Type A to separate the taught
   * explanation from a machine-checkable answer_claim in ONE generation (no
   * redundant second pass).
   */
  responseSchema?: unknown;
  /** Per-call model override; defaults to FAHIM_GENERATION_MODEL. */
  model?: string;
  /** Timeout override (ms); defaults to MODEL_TIMEOUT_MS. */
  timeoutMs?: number;
}

export interface GenerateResult {
  text: string;
  /** Raw provider response, for callers that need structured/JSON parts. */
  raw?: unknown;
}

export interface Provider {
  readonly name: string;
  generate(req: GenerateRequest): Promise<GenerateResult>;
  embed(text: string, taskType: EmbedTaskType, timeoutMs?: number): Promise<number[] | null>;
}

const GEN_TIMEOUT = () => Math.max(1_000, Number(process.env.MODEL_TIMEOUT_MS) || 20_000);
const EMBED_TIMEOUT = () => Math.max(1_000, Number(process.env.EMBED_TIMEOUT_MS) || 8_000);
const GEN_MODEL = () => process.env.FAHIM_GENERATION_MODEL || "gemini-3.5-flash";
const EMBED_MODEL = () => process.env.FAHIM_EMBED_MODEL || "gemini-embedding-001";

// The embedding model, once a working (model, taskType-support) combo is found,
// is cached so we stop paying the fallback probing cost on every call.
let embedModelOk: string | null = null;

const secs = (t0: number) => ((Date.now() - t0) / 1000).toFixed(1) + "s";

class GeminiProvider implements Provider {
  readonly name = "gemini";

  async generate(req: GenerateRequest): Promise<GenerateResult> {
    if (!apiKey) throw new Error("GEMINI_API_KEY missing: cannot generate");
    const model = req.model || GEN_MODEL();
    const config: Record<string, unknown> = {};
    if (req.system) config.systemInstruction = req.system;
    if (typeof req.temperature === "number") config.temperature = req.temperature;
    if (req.thinking === "high") config.thinkingConfig = { thinkingLevel: "HIGH" };
    if (req.responseSchema) {
      config.responseMimeType = "application/json";
      config.responseSchema = req.responseSchema;
    }

    const t0 = Date.now();
    const r: any = await callExternal(
      () =>
        ai.models.generateContent({
          model,
          contents: [{ role: "user", parts: [{ text: req.prompt }]}],
          config,
        }),
      { label: `gemini.generate(${model})`, dependency: "gemini:generate", timeoutMs: req.timeoutMs ?? GEN_TIMEOUT() }
    );
    const text: string = r?.text ?? "";
    console.log(`[PROVIDER] gemini.generate end - ${secs(t0)} (chars=${text.length})`);
    return { text, raw: r };
  }

  async embed(text: string, taskType: EmbedTaskType, timeoutMs?: number): Promise<number[] | null> {
    if (!apiKey || !text?.trim()) return null;
    const model = embedModelOk || EMBED_MODEL();
    // Try WITH the taskType first, then fall back to a plain call if the model
    // rejects the config (older deployments), so a config quirk never disables
    // embeddings outright.
    for (const cfg of [{ taskType }, undefined] as const) {
      try {
        const r: any = await callExternal(
          () => ai.models.embedContent({ model, contents: text, ...(cfg ? { config: cfg } : {}) }),
          { label: `gemini.embed(${model},${cfg ? taskType : "plain"})`, dependency: "gemini:embed", timeoutMs: timeoutMs ?? EMBED_TIMEOUT() }
        );
        const values: number[] | undefined = r?.embeddings?.[0]?.values || r?.embedding?.values;
        if (Array.isArray(values) && values.length) {
          embedModelOk = model;
          return values;
        }
      } catch (e: any) {
        console.warn(`[PROVIDER] gemini.embed failed (${cfg ? taskType : "plain"}): ${e?.message || e}`);
      }
    }
    return null;
  }
}

let provider: Provider | null = null;

/** The configured provider (singleton). Selected by FAHIM_PROVIDER; unknown
 *  values fall back to Gemini with a warning. This is the single seam the
 *  bake-off winner slots into. */
export function getProvider(): Provider {
  if (provider) return provider;
  const kind = (process.env.FAHIM_PROVIDER || "gemini").toLowerCase();
  switch (kind) {
    case "gemini":
      provider = new GeminiProvider();
      break;
    // case "bedrock-claude": provider = new BedrockClaudeProvider(); break;  // added post-bake-off
    default:
      console.warn(`[PROVIDER] Unknown FAHIM_PROVIDER="${kind}", falling back to gemini.`);
      provider = new GeminiProvider();
  }
  console.log(`[PROVIDER] Using provider: ${provider.name}`);
  return provider;
}

/** Convenience wrappers so callers don't repeat getProvider(). */
export function generate(req: GenerateRequest): Promise<GenerateResult> {
  return getProvider().generate(req);
}
export function embed(text: string, taskType: EmbedTaskType, timeoutMs?: number): Promise<number[] | null> {
  return getProvider().embed(text, taskType, timeoutMs);
}
