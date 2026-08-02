// Shared types used by both the client and the server.

/** Built-in poster presets. Dimensions are in CSS pixels at 96dpi (working resolution). */
export type PresetSizeId =
  | "a4-portrait"
  | "a4-landscape"
  | "a3-portrait"
  | "a3-landscape"
  | "letter-portrait"
  | "instagram-post"
  | "instagram-story";

/** A poster size is either a named preset or a user-defined custom size. */
export type PosterSizeId = PresetSizeId | "custom";

export interface PosterSize {
  id: PosterSizeId;
  label: string;
  width: number;
  height: number;
}

/** Bounds for custom poster dimensions (CSS px at 96dpi working resolution). */
export const MIN_DIMENSION = 200;
export const MAX_DIMENSION = 4000;

/** Working resolution is 96dpi; export upscales via a scale factor. */
export const POSTER_SIZES: Record<PresetSizeId, PosterSize> = {
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
  size: PosterSize;
  images: SessionImage[];
  versions: PosterVersion[];
  messages: ChatMessage[];
}

// ---- API request/response shapes ----

export interface GenerateResponse {
  version: PosterVersion;
  /** Design HTML with placeholders already substituted for real image URLs. */
  renderedHtml: string;
}

/** Response from a resize: carries a new version only if the poster was re-laid-out. */
export interface ResizeResponse {
  size: PosterSize;
  version?: PosterVersion;
  renderedHtml?: string;
}

export interface UploadResponse {
  image: SessionImage;
}

export interface CreateSessionResponse {
  sessionId: string;
}

/** One proposed visual direction from "suggest 4 directions" mode. */
export interface DesignDirection {
  id: string;
  title: string;
  description: string;
}

export interface DirectionsResponse {
  directions: DesignDirection[];
}

/** Lightweight session listing entry (for resuming past posters). */
export interface SessionSummary {
  id: string;
  size: PosterSize;
  versionCount: number;
  title: string;
  updatedAt: number;
}

/** Full session state returned when resuming, with the latest poster rendered. */
export interface SessionLoadResponse {
  session: SessionState;
  renderedHtml: string | null;
}

/**
 * Curated typography system. These are cross-platform font-family *stacks*
 * (not embedded binaries), chosen so each named family resolves to a genuinely
 * different, high-quality typeface on common systems. The model is told to use
 * these stacks inline; preview and PDF both resolve them via the browser.
 */
export interface FontFamily {
  name: string;
  role: string;
  stack: string;
}

export const FONT_LIBRARY: FontFamily[] = [
  {
    name: "Editorial Serif",
    role: "Elegant magazine/headline serif; great for titles and posh brands.",
    stack: `"Iowan Old Style", "Palatino Linotype", Palatino, "Book Antiqua", Georgia, serif`,
  },
  {
    name: "Classic Serif",
    role: "Refined transitional serif; literary, timeless body and display.",
    stack: `Baskerville, "Baskerville Old Face", "Hoefler Text", Garamond, "Times New Roman", serif`,
  },
  {
    name: "Neo-Grotesque Sans",
    role: "Clean modernist sans; Swiss/International Typographic feel.",
    stack: `"Helvetica Neue", Helvetica, Arial, "Segoe UI", Roboto, sans-serif`,
  },
  {
    name: "Humanist Sans",
    role: "Warm, approachable sans; friendly editorial and lifestyle.",
    stack: `Seravek, "Gill Sans Nova", Ubuntu, Calibri, "Segoe UI", system-ui, sans-serif`,
  },
  {
    name: "Poster Display (Heavy)",
    role: "Bold impactful display for big headlines and event posters.",
    stack: `Impact, "Franklin Gothic Bold", "Arial Black", "Helvetica Neue", sans-serif`,
  },
  {
    name: "Condensed Sans",
    role: "Tall narrow sans; fits a lot of type, sporty/newsy energy.",
    stack: `"Arial Narrow", "Helvetica Neue Condensed", "Roboto Condensed", sans-serif`,
  },
  {
    name: "Typewriter Mono",
    role: "Monospace; technical, retro, or zine aesthetics.",
    stack: `"Courier New", Courier, "SFMono-Regular", ui-monospace, monospace`,
  },
  {
    name: "Rounded Sans",
    role: "Soft rounded sans; playful, modern, approachable.",
    stack: `"SF Pro Rounded", "Varela Round", "Trebuchet MS", "Segoe UI", sans-serif`,
  },
];

/** Substitute image placeholders in a design with their real URLs. */
export function substitutePlaceholders(html: string, images: SessionImage[]): string {
  let out = html;
  for (const img of images) {
    out = out.split(img.placeholder).join(img.url);
  }
  return out;
}

/** Clamp a dimension into the allowed custom-size range, rounding to an integer. */
export function clampDimension(n: number): number {
  if (!Number.isFinite(n)) return MIN_DIMENSION;
  return Math.round(Math.min(MAX_DIMENSION, Math.max(MIN_DIMENSION, n)));
}

/** Build a validated custom PosterSize from raw width/height inputs. */
export function customSize(width: number, height: number): PosterSize {
  const w = clampDimension(width);
  const h = clampDimension(height);
  return { id: "custom", label: `Custom ${w}×${h}`, width: w, height: h };
}

/** Validate a PosterSize received over the wire (presets or custom). */
export function isValidPosterSize(size: unknown): size is PosterSize {
  if (!size || typeof size !== "object") return false;
  const s = size as PosterSize;
  return (
    typeof s.width === "number" &&
    typeof s.height === "number" &&
    s.width >= MIN_DIMENSION &&
    s.width <= MAX_DIMENSION &&
    s.height >= MIN_DIMENSION &&
    s.height <= MAX_DIMENSION &&
    typeof s.label === "string"
  );
}
