import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { toGeminiSchema } from "./gemini-schema";

/**
 * One entry point for structured AI calls. Two providers are supported:
 *
 * - Google Gemini (GEMINI_API_KEY) — has a free tier from Google AI Studio.
 * - Anthropic Claude (ANTHROPIC_API_KEY) — paid, pay-as-you-go credits.
 *
 * Every call returns JSON validated against a zod schema. With no key set,
 * callers fall back to the deterministic demo logic in ./fallback.ts.
 */

export type Provider = "gemini" | "anthropic";
export type Kind = "vision" | "reasoning" | "fast";
export type Attachment = { mediaType: string; base64: string };

export function aiProvider(): Provider | null {
  const forced = process.env.AI_PROVIDER?.toLowerCase();
  if (forced === "gemini" && process.env.GEMINI_API_KEY) return "gemini";
  if (forced === "anthropic" && process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return null;
}

export function aiEnabled() {
  return aiProvider() !== null;
}

export function aiLabel() {
  const p = aiProvider();
  return p === "gemini" ? "Google Gemini" : p === "anthropic" ? "Claude" : null;
}

export function aiModel(kind: Kind = "reasoning") {
  if (aiProvider() === "gemini") {
    if (kind === "fast") return process.env.GEMINI_MODEL_FAST ?? process.env.GEMINI_MODEL ?? "gemini-flash-lite-latest";
    return process.env.GEMINI_MODEL ?? "gemini-flash-latest";
  }
  if (kind === "fast") return process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-5-5";
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
}

type StructuredOpts<T extends z.ZodType> = {
  name: string;
  description: string;
  schema: T;
  jsonSchema: Record<string, unknown>;
  system: string;
  prompt: string;
  attachments?: Attachment[];
  kind?: Kind;
  maxTokens?: number;
};

export async function structured<T extends z.ZodType>(opts: StructuredOpts<T>): Promise<{ data: z.infer<T>; model: string }> {
  const provider = aiProvider();
  if (!provider) throw new Error("AI_DISABLED");
  let lastError: unknown;
  let current = opts;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const { raw, model } = provider === "gemini" ? await callGemini(current) : await callAnthropic(current);
      const parsed = opts.schema.safeParse(raw);
      if (!parsed.success) throw new Error("Schema validation failed: " + parsed.error.message);
      return { data: parsed.data, model };
    } catch (err) {
      lastError = err;
      // Free tiers rate-limit by the minute and the busiest models get overloaded: back off and try again.
      if (err instanceof RateLimitError || err instanceof OverloadedError) await new Promise((r) => setTimeout(r, 2000 * (attempt + 1) ** 2));
      // Still overloaded after a retry: move to the lighter model, which is usually free.
      if (err instanceof OverloadedError && attempt >= 1 && current.kind !== "fast") {
        console.warn(`[ai] ${opts.name}: model overloaded, retrying on the fast model`);
        current = { ...opts, kind: "fast" };
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

class RateLimitError extends Error {}
class OverloadedError extends Error {}

/* ───────── Anthropic ───────── */

let anthropic: Anthropic | undefined;

async function callAnthropic<T extends z.ZodType>(opts: StructuredOpts<T>) {
  anthropic ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const model = aiModel(opts.kind);
  const content: Anthropic.Messages.ContentBlockParam[] = [
    ...(opts.attachments ?? []).map((a): Anthropic.Messages.ContentBlockParam =>
      a.mediaType === "application/pdf"
        ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } }
        : {
            type: "image",
            source: { type: "base64", media_type: a.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif", data: a.base64 },
          },
    ),
    { type: "text", text: opts.prompt },
  ];
  try {
    const res = await anthropic.messages.create({
      model,
      max_tokens: opts.maxTokens ?? 2000,
      system: opts.system,
      tools: [{ name: opts.name, description: opts.description, input_schema: opts.jsonSchema as Anthropic.Messages.Tool.InputSchema }],
      tool_choice: { type: "tool", name: opts.name },
      messages: [{ role: "user", content }],
    });
    const block = res.content.find((b) => b.type === "tool_use");
    if (!block || block.type !== "tool_use") throw new Error("No structured output returned");
    return { raw: block.input, model };
  } catch (e) {
    if (e instanceof Anthropic.RateLimitError) throw new RateLimitError(e.message);
    if (e instanceof Anthropic.InternalServerError) throw new OverloadedError(e.message);
    throw e;
  }
}

/* ───────── Google Gemini (REST, no SDK) ───────── */

const GEMINI_BASE = process.env.GEMINI_BASE_URL ?? "https://generativelanguage.googleapis.com/v1beta";
const resolvedModels = new Map<string, string>();

async function callGemini<T extends z.ZodType>(opts: StructuredOpts<T>) {
  const wanted = aiModel(opts.kind);
  const model = resolvedModels.get(wanted) ?? wanted;
  const body = {
    systemInstruction: { parts: [{ text: `${opts.system}\n\nTask: ${opts.description}` }] },
    contents: [
      {
        role: "user",
        parts: [
          ...(opts.attachments ?? []).map((a) => ({ inlineData: { mimeType: a.mediaType, data: a.base64 } })),
          { text: opts.prompt },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: toGeminiSchema(opts.jsonSchema),
      maxOutputTokens: Math.max(opts.maxTokens ?? 2000, 2048),
      temperature: 0.2,
    },
  };
  const res = await fetch(`${GEMINI_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": process.env.GEMINI_API_KEY! },
    body: JSON.stringify(body),
  });
  if (res.status === 429) throw new RateLimitError("Gemini rate limit reached");
  if (res.status >= 500) throw new OverloadedError(`Gemini error ${res.status}: model busy`);
  if (res.status === 404 && !resolvedModels.has(wanted)) {
    // The configured model name was retired or renamed: pick a current Flash model and retry.
    const fallback = await pickGeminiModel(opts.kind === "fast");
    if (fallback && fallback !== model) {
      resolvedModels.set(wanted, fallback);
      console.warn(`[ai] Gemini model "${wanted}" not found; using "${fallback}". Set GEMINI_MODEL to choose one.`);
      return callGemini(opts);
    }
  }
  const json = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(`Gemini error ${res.status}: ${json.error?.message ?? "unknown"}`);
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  if (!text) throw new Error(`Gemini returned no content (${json.candidates?.[0]?.finishReason ?? "no candidates"})`);
  return { raw: JSON.parse(text) as unknown, model };
}

async function pickGeminiModel(lite: boolean) {
  const res = await fetch(`${GEMINI_BASE}/models?pageSize=200`, { headers: { "x-goog-api-key": process.env.GEMINI_API_KEY! } });
  if (!res.ok) return null;
  const { models = [] } = (await res.json()) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const names = models
    .filter((m) => m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => m.name.replace(/^models\//, ""))
    .filter((n) => n.startsWith("gemini") && n.includes("flash") && !/(image|tts|audio|live|embedding|exp)/.test(n));
  const stable = names.filter((n) => !n.includes("preview"));
  const pool = (stable.length ? stable : names).filter((n) => (lite ? true : !n.includes("lite")));
  const version = (n: string) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  return pool.sort((a, b) => version(b) - version(a))[0] ?? names[0] ?? null;
}
