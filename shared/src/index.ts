// Shared types used by both the client and the server.

/** Supported poster sizes. Dimensions are in CSS pixels at 96dpi (working resolution). */
export type PosterSizeId =
  | "a4-portrait"
  | "a4-landscape"
  | "a3-portrait"
  | "a3-landscape"
  | "letter-portrait"
  | "instagram-post"
  | "instagram-story";

export interface PosterSize {
  id: PosterSizeId;
  label: string;
  width: number;
  height: number;
}

/** Working resolution is 96dpi; export upscales via a scale factor. */
export const POSTER_SIZES: Record<PosterSizeId, PosterSize> = {
  "a4-portrait": { id: "a4-portrait", label: "A4 Portrait", width: 794, height: 1123 },
  "a4-landscape": { id: "a4-landscape", label: "A4 Landscape", width: 1123, height: 794 },
  "a3-portrait": { id: "a3-portrait", label: "A3 Portrait", width: 1123, height: 1587 },
  "a3-landscape": { id: "a3-landscape", label: "A3 Landscape", width: 1587, height: 1123 },
  "letter-portrait": { id: "letter-portrait", label: "US Letter Portrait", width: 816, height: 1056 },
  "instagram-post": { id: "instagram-post", label: "Instagram Post (1:1)", width: 1080, height: 1080 },
  "instagram-story": { id: "instagram-story", label: "Instagram Story (9:16)", width: 1080, height: 1920 },
};

/** A single uploaded image belonging to a session. */
export interface SessionImage {
  /** Placeholder token the model uses in the design, e.g. "{{IMAGE_1}}". */
  placeholder: string;
  /** URL the app substitutes for the placeholder when rendering. */
  url: string;
  filename: string;
  mediaType: string;
}

/** One turn in the design conversation, shown in the chat panel. */
export interface ChatMessage {
  role: "user" | "assistant";
  /** Human-readable text (the conversational reply, not the HTML). */
  text: string;
}

/** A snapshot of the poster at a point in time. */
export interface PosterVersion {
  id: string;
  /** The design HTML with placeholders still in it (not yet substituted). */
  html: string;
  /** The prompt that produced this version. */
  prompt: string;
  /** Claude's conversational reply for this version. */
  reply: string;
  createdAt: number;
}

export interface SessionState {
  id: string;
  sizeId: PosterSizeId;
  images: SessionImage[];
  versions: PosterVersion[];
  messages: ChatMessage[];
}

// ---- API request/response shapes ----

export interface GenerateRequest {
  sessionId: string;
  prompt: string;
  sizeId: PosterSizeId;
}

export interface GenerateResponse {
  version: PosterVersion;
  /** Design HTML with placeholders already substituted for real image URLs. */
  renderedHtml: string;
}

export interface UploadResponse {
  image: SessionImage;
}

export interface CreateSessionResponse {
  sessionId: string;
}

/** Substitute image placeholders in a design with their real URLs. */
export function substitutePlaceholders(html: string, images: SessionImage[]): string {
  let out = html;
  for (const img of images) {
    out = out.split(img.placeholder).join(img.url);
  }
  return out;
}
