import type { Attachment } from "./types";

/**
 * Converts Float32 browser microphone data to raw 16-bit PCM little-endian.
 */
export function float32ToInt16PCM(float32Array: Float32Array): ArrayBuffer {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
  }
  return buffer;
}

/**
 * Encodes an ArrayBuffer to standard base64 format. Converted in 32K chunks:
 * one String.fromCharCode call per byte froze the main thread on the long
 * audio buffers the live-voice session produces.
 */
export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const CHUNK = 0x8000;
  const parts: string[] = [];
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const slice = bytes.subarray(i, i + CHUNK);
    parts.push(String.fromCharCode.apply(null, slice as unknown as number[]));
  }
  return window.btoa(parts.join(""));
}

/**
 * Converts 16-bit PCM little-endian base64 back to Float32.
 * This is used for playing back model audio responses.
 */
export function base64ToFloat32PCM(base64: string): Float32Array {
  const binary = window.atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16Array = new Int16Array(bytes.buffer);
  const float32Array = new Float32Array(int16Array.length);
  for (let i = 0; i < int16Array.length; i++) {
    float32Array[i] = int16Array[i] / 32768.0;
  }
  return float32Array;
}

/** Read a File as a data URL (base64). */
function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/**
 * Downscale an image data URL so large phone photos don't bloat uploads or
 * storage. Caps the longest edge at `maxEdge` and re-encodes as JPEG.
 */
function downscaleImage(dataUrl: string, maxEdge = 1280, quality = 0.82): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
      if (scale === 1) return resolve(dataUrl); // already small enough
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) return resolve(dataUrl);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Turn picked files into attachments ready to display + send. Images are
 * downscaled; other files (e.g. PDFs) are passed through as-is.
 */
export async function filesToAttachments(files: File[]): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const file of files) {
    const isImage = file.type.startsWith("image/");
    let dataUrl = await readFileAsDataUrl(file);
    if (isImage) dataUrl = await downscaleImage(dataUrl);
    out.push({ dataUrl, mimeType: isImage ? "image/jpeg" : file.type || "application/octet-stream", name: file.name, isImage });
  }
  return out;
}

/** Split a data URL into the bare base64 payload the backend/Gemini expects. */
export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

/**
 * Text parsing utility that parses Clarify.AI structured responses
 * into logical blocks for visual notebooks if sections are detected.
 */
export interface NotebookSection {
  title: string;
  emoji: string;
  content: string;
}

export interface ParsedTeaching {
  /** Any content before the first notebook section (e.g. the Exam-Ready Answer). */
  preamble: string;
  sections: NotebookSection[];
}

export function parseTeachingSections(text: string): ParsedTeaching {
  // The 9 notebook sections are identified by their EMOJI alone, which is
  // language-agnostic: the model teaches in Arabic (or English) and titles the
  // sections in that language, but the emoji is the stable key. Each carries a
  // fallback label for when the header is just the bare emoji.
  const defs = [
    { emoji: "🌟", label: "الفكرة الكبرى" },
    { emoji: "🤔", label: "مثال من حياتك" },
    { emoji: "📖", label: "شرح مبسّط" },
    { emoji: "🖼", label: "تمثيل بصري" },
    { emoji: "🧠", label: "التعريف الرسمي" },
    { emoji: "✏", label: "مثال محلول" },
    { emoji: "⚠", label: "أخطاء شائعة" },
    { emoji: "🎯", label: "سؤال تحقّق" },
    { emoji: "📌", label: "ملخّص" },
  ];

  // Locate each header by its emoji, tolerantly: allow optional markdown prefix
  // (#, *, >, -), optional numbering ("1.", "1)"), bold markers, bidi marks,
  // and an optional emoji variation selector. Anchored to the START of a line
  // ("^" with the m flag) so the same emoji used mid-sentence is never mistaken
  // for a header. Capture the rest of that header line as the section title
  // (whatever language the model wrote it in), so the tab shows the Arabic
  // title, not a hardcoded English one.
  const found: { idx: number; headerEnd: number; emoji: string; title: string }[] = [];
  for (const def of defs) {
    const re = new RegExp(`^[-#*>\\u200E\\u200F\\t ]*\\d*[.)]?[*\\u200E\\u200F\\t ]*${def.emoji}\\uFE0F?[ \\t]*([^\\n]*)`, "m");
    const m = re.exec(text);
    if (m) {
      const rawTitle = (m[1] || "").replace(/[*#:>\-=\s]+$/, "").replace(/\*\*/g, "").trim();
      found.push({ idx: m.index, headerEnd: m.index + m[0].length, emoji: def.emoji, title: rawTitle || def.label });
    }
  }

  // Need a real notebook (most sections present), not a stray emoji match.
  if (found.length < 3) return { preamble: "", sections: [] };

  found.sort((a, b) => a.idx - b.idx);
  // Everything before the first section (e.g. the Exam-Ready Answer) is preamble.
  const preamble = text.slice(0, found[0].idx).trim();

  const sections: NotebookSection[] = [];
  for (let i = 0; i < found.length; i++) {
    const cur = found[i];
    const next = found[i + 1];
    const contentEnd = next ? next.idx : text.length;
    const content = text
      .substring(cur.headerEnd, contentEnd)
      .replace(/^[:\s\-=*]+/, "") // strip leading punctuation/symbols
      .trim();
    sections.push({ title: cur.title, emoji: cur.emoji, content });
  }

  return { preamble, sections };
}
