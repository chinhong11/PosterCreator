import { nanoid } from "nanoid";
import type { DesignDirection, PosterVersion, SessionState } from "@poster/shared";
import { buildSystemPrompt } from "./systemPrompt.js";
import { getProvider } from "../llm/index.js";
import type { ImageInput, Turn } from "../llm/types.js";

/** Read the raw bytes of a locally-stored uploaded image for vision input. */
export interface ImageBytes {
  placeholder: string;
  mediaType: string;
  base64: string;
}

export class DesignError extends Error {}

/**
 * Splits a model response into the conversational reply and the poster HTML.
 * The contract asks for prose followed by a single ```html fenced block.
 */
export function parseResponse(text: string): { reply: string; html: string | null } {
  const fence = /```html\s*([\s\S]*?)```/i.exec(text);
  if (!fence) return { reply: text.trim(), html: null };
  const html = fence[1].trim();
  const reply = text.slice(0, fence.index).trim();
  return { reply: reply || "Here's your poster.", html };
}

/**
 * Extract the poster HTML from a partial (still-streaming) response: everything
 * after the opening ```html fence, up to a closing fence if present. Returns
 * null before the fence opens. The fragment may be incomplete HTML — the
 * browser renders it leniently, which produces the "draws in" effect.
 */
export function partialPosterHtml(text: string): string | null {
  const open = text.indexOf("```html");
  if (open === -1) return null;
  let rest = text.slice(open + "```html".length);
  const close = rest.indexOf("```");
  if (close !== -1) rest = rest.slice(0, close);
  const trimmed = rest.replace(/^\s+/, "");
  return trimmed || null;
}

function toImages(bytes: ImageBytes[]): ImageInput[] {
  return bytes.map((b) => ({ mediaType: b.mediaType, base64: b.base64 }));
}

/**
 * Runs one design turn. Rebuilds the conversation from prior versions so the
 * model edits the current poster in place, passes the uploaded image(s) as
 * vision input on the first turn, and streams to avoid HTTP timeouts.
 */
export async function runDesignTurn(
  session: SessionState,
  prompt: string,
  imageBytes: ImageBytes[],
  onPartial?: (partialHtml: string) => void,
  signal?: AbortSignal,
): Promise<PosterVersion> {
  const provider = getProvider();
  const images = toImages(imageBytes);

  // Each prior turn is the user's prompt plus the assistant's reply and design
  // HTML, so the model has the current poster in context.
  const turns: Turn[] = [];
  session.versions.forEach((v, i) => {
    turns.push({ role: "user", text: v.prompt, images: i === 0 ? images : undefined });
    turns.push({ role: "assistant", text: `${v.reply}\n\n\`\`\`html\n${v.html}\n\`\`\`` });
  });
  turns.push({
    role: "user",
    text: prompt,
    images: session.versions.length === 0 ? images : undefined,
  });

  // Emit the poster HTML as it streams in, throttled by growth.
  let lastLen = 0;
  const onText = onPartial
    ? (snapshot: string) => {
        const html = partialPosterHtml(snapshot);
        if (html && html.length - lastLen >= 120) {
          lastLen = html.length;
          onPartial(html);
        }
      }
    : undefined;

  const result = await provider.complete({
    system: buildSystemPrompt(session.size, session.images),
    turns,
    // High ceiling: thinking can count toward it, and a truncated poster is
    // unusable. Streaming means a large ceiling has no timeout cost.
    maxTokens: 64000,
    cacheSystem: true,
    signal,
    onText,
  });

  if (result.stopReason === "refusal") {
    throw new DesignError(`${provider.name} declined this request. Try rephrasing your brief.`);
  }
  const { reply, html } = parseResponse(result.text);
  if (!html && result.stopReason === "max_tokens") {
    throw new DesignError("The design was too large to finish. Try a simpler brief or a smaller poster.");
  }
  if (!html) {
    throw new DesignError(`${provider.name} didn't return a valid poster this time. Try again or rephrase.`);
  }

  return { id: nanoid(), html, prompt, reply, createdAt: Date.now() };
}

/**
 * "Suggest 4 directions" mode: before designing, ask for four distinct visual
 * directions (palette / typeface / mood) so the user can pick one. This
 * reliably produces variety instead of the model's default first instinct.
 */
export async function runDirections(
  brief: string,
  imageBytes: ImageBytes[],
): Promise<DesignDirection[]> {
  const provider = getProvider();
  const system =
    `You are an art director. Given a poster brief${imageBytes.length ? " and an image" : ""}, propose exactly FOUR distinct visual directions. ` +
    `Each must differ meaningfully in palette, typography, and mood — not four variations of one idea. ` +
    `Respond with ONLY a fenced \`\`\`json block containing an array of four objects, each: ` +
    `{"title": string (2-4 words), "description": string (one sentence naming palette, type feel, and mood)}. No prose outside the block.`;

  const result = await provider.complete({
    system,
    turns: [{ role: "user", text: `Brief: ${brief}`, images: toImages(imageBytes) }],
    // Headroom for thinking plus the JSON payload, so it isn't cut off mid-array.
    maxTokens: 8000,
  });

  if (result.stopReason === "refusal") {
    throw new DesignError(`${provider.name} declined this request. Try rephrasing your brief.`);
  }
  const fence = /```json\s*([\s\S]*?)```/i.exec(result.text);
  const raw = fence ? fence[1] : result.text;
  try {
    const parsed = JSON.parse(raw) as { title: string; description: string }[];
    return parsed.slice(0, 4).map((d) => ({
      id: nanoid(),
      title: String(d.title ?? "").trim() || "Untitled direction",
      description: String(d.description ?? "").trim(),
    }));
  } catch {
    throw new DesignError("Couldn't parse the suggested directions. Try again.");
  }
}
