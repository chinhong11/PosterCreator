// Provider-neutral shapes for talking to a language model. The design logic
// builds a conversation in these terms; each adapter translates it into its
// own SDK's format and maps the result back.

export interface ImageInput {
  mediaType: string;
  base64: string;
}

export interface Turn {
  role: "user" | "assistant";
  text: string;
  images?: ImageInput[];
}

/** Why generation stopped, normalized across providers. */
export type StopReason = "end" | "max_tokens" | "refusal" | "other";

export interface CompletionRequest {
  system: string;
  turns: Turn[];
  /** Output ceiling. Adapters may ignore it where the model's default is safer. */
  maxTokens: number;
  /** Hint that the system prompt is stable across turns and worth caching. */
  cacheSystem?: boolean;
  signal?: AbortSignal;
  /** Called with the full text generated so far, as it streams. */
  onText?: (snapshot: string) => void;
}

export interface CompletionResult {
  text: string;
  stopReason: StopReason;
}

export interface LlmProvider {
  /** Human-readable name used in user-facing messages, e.g. "Claude". */
  name: string;
  /** Model identifier, for the startup log. */
  model: string;
  complete(req: CompletionRequest): Promise<CompletionResult>;
}
