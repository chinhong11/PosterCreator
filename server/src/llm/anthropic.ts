import Anthropic from "@anthropic-ai/sdk";
import type { CompletionRequest, CompletionResult, LlmProvider, StopReason } from "./types.js";

type ImageMediaType = "image/png" | "image/jpeg" | "image/webp" | "image/gif";

export function createAnthropicProvider(): LlmProvider {
  const model = process.env.ANTHROPIC_MODEL || "claude-opus-5";
  const client = new Anthropic();

  return {
    name: "Claude",
    model,
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const messages: Anthropic.MessageParam[] = req.turns.map((t) => ({
        role: t.role,
        content: t.images?.length
          ? [
              ...t.images.map((img) => ({
                type: "image" as const,
                source: {
                  type: "base64" as const,
                  media_type: img.mediaType as ImageMediaType,
                  data: img.base64,
                },
              })),
              { type: "text" as const, text: t.text },
            ]
          : t.text,
      }));

      const stream = client.messages.stream(
        {
          model,
          max_tokens: req.maxTokens,
          system: req.cacheSystem
            ? [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }]
            : req.system,
          messages,
        },
        { signal: req.signal },
      );
      if (req.onText) {
        const onText = req.onText;
        stream.on("text", (_delta, snapshot) => onText(snapshot));
      }

      const message = await stream.finalMessage();
      const text = message.content
        .map((b) => (b.type === "text" ? b.text : ""))
        .join("");
      const stopReason: StopReason =
        message.stop_reason === "end_turn"
          ? "end"
          : message.stop_reason === "max_tokens"
            ? "max_tokens"
            : message.stop_reason === "refusal"
              ? "refusal"
              : "other";
      return { text, stopReason };
    },
  };
}
