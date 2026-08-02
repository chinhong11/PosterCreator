import Anthropic from "@anthropic-ai/sdk";
import { nanoid } from "nanoid";
import type { PosterVersion, SessionState } from "@poster/shared";
import { buildSystemPrompt } from "./systemPrompt.js";

const MODEL = "claude-opus-5";

const client = new Anthropic();

/** Read the raw bytes of a locally-stored uploaded image for vision input. */
export interface ImageBytes {
  placeholder: string;
  mediaType: string;
  base64: string;
}

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
 * Runs one design turn. Builds the message history from prior versions so the
 * model edits the current poster in place, passes the uploaded image(s) as
 * vision input on the first turn, and streams to avoid HTTP timeouts.
 */
export async function runDesignTurn(
  session: SessionState,
  prompt: string,
  imageBytes: ImageBytes[],
): Promise<PosterVersion> {
  const system = buildSystemPrompt(session.size, session.images);

  // Rebuild the conversation from version history. Each prior turn is a
  // user prompt + the assistant's reply and design HTML, so the model has the
  // current poster in context and edits it rather than starting over.
  const messages: Anthropic.MessageParam[] = [];
  const firstTurn = session.versions.length === 0;

  for (let i = 0; i < session.versions.length; i++) {
    const v = session.versions[i];
    // Attach the images to the very first user turn as vision input.
    if (i === 0 && imageBytes.length > 0) {
      messages.push({
        role: "user",
        content: [
          ...imageBytes.map(
            (img) =>
              ({
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: img.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
                  data: img.base64,
                },
              }),
          ),
          { type: "text", text: v.prompt },
        ],
      });
    } else {
      messages.push({ role: "user", content: v.prompt });
    }
    messages.push({
      role: "assistant",
      content: `${v.reply}\n\n\`\`\`html\n${v.html}\n\`\`\``,
    });
  }

  // The new prompt for this turn.
  if (firstTurn && imageBytes.length > 0) {
    messages.push({
      role: "user",
      content: [
        ...imageBytes.map(
          (img) =>
            ({
              type: "image" as const,
              source: {
                type: "base64" as const,
                media_type: img.mediaType as "image/png" | "image/jpeg" | "image/webp" | "image/gif",
                data: img.base64,
              },
            }),
        ),
        { type: "text", text: prompt },
      ],
    });
  } else {
    messages.push({ role: "user", content: prompt });
  }

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 32000,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages,
  });

  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") {
    throw new DesignError("Claude declined this request. Try rephrasing your brief.");
  }

  const textBlock = message.content.find((b) => b.type === "text");
  const fullText = textBlock && textBlock.type === "text" ? textBlock.text : "";
  let { reply, html } = parseResponse(fullText);

  if (!html && message.stop_reason === "max_tokens") {
    throw new DesignError("The design was too large to finish. Try a simpler brief or a smaller poster.");
  }

  if (!html) {
    throw new DesignError("Claude didn't return a valid poster this time. Try again or rephrase.");
  }

  return {
    id: nanoid(),
    html,
    prompt,
    reply,
    createdAt: Date.now(),
  };
}

export class DesignError extends Error {}
