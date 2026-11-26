import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";

/**
 * Thin wrapper around Claude that always returns schema-validated JSON.
 * Every call is forced through a single tool so the output is structured,
 * then validated with zod. When no API key is configured, callers fall back
 * to the deterministic demo logic in ./fallback.ts.
 */

let client: Anthropic | null | undefined;

export function aiEnabled() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function aiModel(kind: "vision" | "reasoning" | "fast" = "reasoning") {
  if (kind === "fast") return process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-5-5";
  return process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
}

function getClient() {
  if (client !== undefined) return client;
  client = aiEnabled() ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
  return client;
}

export type Attachment = { mediaType: string; base64: string };

type ContentBlock = Anthropic.Messages.ContentBlockParam;

function attachmentBlock(a: Attachment): ContentBlock {
  if (a.mediaType === "application/pdf") {
    return { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.base64 } };
  }
  return {
    type: "image",
    source: {
      type: "base64",
      media_type: a.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
      data: a.base64,
    },
  };
}

export async function structured<T extends z.ZodType>(opts: {
  name: string;
  description: string;
  schema: T;
  jsonSchema: Record<string, unknown>;
  system: string;
  prompt: string;
  attachments?: Attachment[];
  kind?: "vision" | "reasoning" | "fast";
  maxTokens?: number;
}): Promise<{ data: z.infer<T>; model: string }> {
  const c = getClient();
  if (!c) throw new Error("AI_DISABLED");
  const model = aiModel(opts.kind);
  const content: ContentBlock[] = [...(opts.attachments ?? []).map(attachmentBlock), { type: "text", text: opts.prompt }];

  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await c.messages.create({
        model,
        max_tokens: opts.maxTokens ?? 2000,
        system: opts.system,
        tools: [
          {
            name: opts.name,
            description: opts.description,
            input_schema: opts.jsonSchema as Anthropic.Messages.Tool.InputSchema,
          },
        ],
        tool_choice: { type: "tool", name: opts.name },
        messages: [{ role: "user", content }],
      });
      const block = res.content.find((b) => b.type === "tool_use");
      if (!block || block.type !== "tool_use") throw new Error("No structured output returned");
      const parsed = opts.schema.safeParse(block.input);
      if (!parsed.success) throw new Error("Schema validation failed: " + parsed.error.message);
      return { data: parsed.data, model };
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
