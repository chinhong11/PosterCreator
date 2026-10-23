import { createAnthropicProvider } from "./anthropic.js";
import { createGeminiProvider } from "./gemini.js";
import type { LlmProvider } from "./types.js";

export type { LlmProvider } from "./types.js";

let provider: LlmProvider | null = null;

/**
 * The configured model provider, chosen by LLM_PROVIDER ("anthropic" by
 * default, or "gemini"). Created once; throws a readable error if the chosen
 * provider is missing its settings.
 */
export function getProvider(): LlmProvider {
  if (provider) return provider;
  const choice = (process.env.LLM_PROVIDER || "anthropic").trim().toLowerCase();
  if (choice === "gemini" || choice === "google") provider = createGeminiProvider();
  else if (choice === "anthropic" || choice === "claude") provider = createAnthropicProvider();
  else throw new Error(`Unknown LLM_PROVIDER "${choice}". Use "anthropic" or "gemini".`);
  return provider;
}
