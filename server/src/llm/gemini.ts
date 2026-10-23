import { GoogleGenAI, type Content } from "@google/genai";
import type { CompletionRequest, CompletionResult, LlmProvider, StopReason } from "./types.js";

// Finish reasons where the model stopped because of a content policy.
const POLICY_STOPS = new Set([
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
  "IMAGE_SAFETY",
]);

export function createGeminiProvider(): LlmProvider {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey) throw new Error("LLM_PROVIDER=gemini needs GEMINI_API_KEY in server/.env.");
  if (!model) {
    throw new Error(
      "LLM_PROVIDER=gemini needs GEMINI_MODEL in server/.env — set it to a Gemini model ID your key can use.",
    );
  }
  // Optional cap. Unset means the model's own default, which avoids a 400 if
  // our ceiling exceeds what a particular model allows.
  const cap = process.env.GEMINI_MAX_OUTPUT_TOKENS
    ? Number(process.env.GEMINI_MAX_OUTPUT_TOKENS)
    : undefined;
  const ai = new GoogleGenAI({ apiKey });

  return {
    name: "Gemini",
    model,
    async complete(req: CompletionRequest): Promise<CompletionResult> {
      const contents: Content[] = req.turns.map((t) => ({
        role: t.role === "assistant" ? "model" : "user",
        parts: [
          ...(t.images ?? []).map((img) => ({
            inlineData: { mimeType: img.mediaType, data: img.base64 },
          })),
          { text: t.text },
        ],
      }));

      const stream = await ai.models.generateContentStream({
        model,
        contents,
        config: {
          systemInstruction: req.system,
          abortSignal: req.signal,
          ...(cap ? { maxOutputTokens: Math.min(req.maxTokens, cap) } : {}),
        },
      });

      let text = "";
      let finish: string | undefined;
      let blocked = false;
      for await (const chunk of stream) {
        if (chunk.promptFeedback?.blockReason) blocked = true;
        const reason = chunk.candidates?.[0]?.finishReason;
        if (reason) finish = reason;
        const piece = chunk.text; // excludes thought parts
        if (piece) {
          text += piece;
          req.onText?.(text);
        }
      }

      const stopReason: StopReason = blocked
        ? "refusal"
        : finish === "STOP"
          ? "end"
          : finish === "MAX_TOKENS"
            ? "max_tokens"
            : finish && POLICY_STOPS.has(finish)
              ? "refusal"
              : "other";
      return { text, stopReason };
    },
  };
}
