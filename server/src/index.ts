import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import {
  isValidPosterSize,
  substitutePlaceholders,
  type CreateSessionResponse,
  type DirectionsResponse,
  type GenerateResponse,
  type PosterSize,
  type ResizeResponse,
  type SessionLoadResponse,
  type SessionState,
  type UploadResponse,
} from "@poster/shared";
import { createSession, getSession, addImage, persist } from "./sessions.js";
import { runDesignTurn, runDirections, DesignError, type ImageBytes } from "./claude/generate.js";
import { renderPosterPdf } from "./export/pdf.js";
import { listSummaries } from "./db.js";
import { fontFaceCss } from "./fonts.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Serve uploaded images so the rendered poster can reference them by URL.
app.use("/assets", express.static(UPLOAD_DIR));

// Serve the embedded @font-face stylesheet (used by the live preview iframe).
// Same fonts are inlined into PDF exports, so preview and print match.
app.get("/api/fonts.css", (_req, res) => {
  res.setHeader("Content-Type", "text/css");
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.send(fontFaceCss());
});

const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname) || ".png";
      cb(null, `${nanoid()}${ext}`);
    },
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

// ---- Simple per-IP rate limiter for the model-calling endpoints ----
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 30;
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimit(req: express.Request, res: express.Response, next: express.NextFunction) {
  const key = req.ip ?? "unknown";
  const now = Date.now();
  const entry = hits.get(key);
  if (!entry || now > entry.resetAt) {
    hits.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return next();
  }
  if (entry.count >= RATE_MAX) {
    const retry = Math.ceil((entry.resetAt - now) / 1000);
    res.setHeader("Retry-After", String(retry));
    return res.status(429).json({ error: `Too many requests. Try again in ${retry}s.` });
  }
  entry.count++;
  next();
}

// ---- Helpers ----

/** Resolve an image's on-disk path from its /assets URL (host-independent). */
function diskPathForImage(url: string): string {
  return path.join(UPLOAD_DIR, path.basename(url));
}

/** Read uploaded image bytes for vision input. */
function collectImageBytes(session: SessionState): ImageBytes[] {
  const out: ImageBytes[] = [];
  for (const img of session.images) {
    const diskPath = diskPathForImage(img.url);
    if (fs.existsSync(diskPath)) {
      out.push({
        placeholder: img.placeholder,
        mediaType: img.mediaType,
        base64: fs.readFileSync(diskPath).toString("base64"),
      });
    }
  }
  return out;
}

/** Substitute image placeholders with inline data URIs (for offline export). */
function renderWithDataUris(session: SessionState, html: string): string {
  let out = html;
  for (const img of session.images) {
    const diskPath = diskPathForImage(img.url);
    if (fs.existsSync(diskPath)) {
      const b64 = fs.readFileSync(diskPath).toString("base64");
      out = out.split(img.placeholder).join(`data:${img.mediaType};base64,${b64}`);
    }
  }
  return out;
}

// ---- Routes ----

/** Create a new poster session for a given size (preset or custom). */
app.post("/api/session", (req, res) => {
  const size = req.body?.size as PosterSize | undefined;
  if (!isValidPosterSize(size)) {
    return res.status(400).json({ error: "Invalid or missing poster size." });
  }
  const session = createSession(size);
  const body: CreateSessionResponse = { sessionId: session.id };
  res.json(body);
});

/** List recent sessions (for resuming past posters). */
app.get("/api/sessions", (_req, res) => {
  res.json({ sessions: listSummaries() });
});

/** Load a session's full state and its latest rendered poster. */
app.get("/api/session/:id", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  const latest = session.versions.at(-1);
  const body: SessionLoadResponse = {
    session,
    renderedHtml: latest ? substitutePlaceholders(latest.html, session.images) : null,
  };
  res.json(body);
});

/** Upload an image to a session. Stored on disk, served from /assets. */
app.post("/api/session/:id/image", upload.single("image"), (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (!req.file) return res.status(400).json({ error: "No image uploaded." });

  // Store a relative URL so it resolves regardless of host/proxy or restarts.
  const image = addImage(session.id, {
    filename: req.file.originalname,
    mediaType: req.file.mimetype,
    url: `/assets/${req.file.filename}`,
  });
  if (!image) return res.status(404).json({ error: "Session not found." });

  const body: UploadResponse = { image };
  res.json(body);
});

/** Suggest four distinct visual directions before the first design. */
app.post("/api/session/:id/directions", rateLimit, async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  const brief = String(req.body?.prompt ?? "").trim();
  if (!brief) return res.status(400).json({ error: "A brief is required." });

  try {
    const directions = await runDirections(brief, collectImageBytes(session));
    const body: DirectionsResponse = { directions };
    res.json(body);
  } catch (err) {
    if (err instanceof DesignError) return res.status(422).json({ error: err.message });
    console.error("Directions failed:", err);
    res.status(500).json({ error: "Couldn't suggest directions right now." });
  }
});

/** Generate or refine the poster for a session. */
app.post("/api/session/:id/generate", rateLimit, async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });

  const prompt = String(req.body?.prompt ?? "").trim();
  if (!prompt) return res.status(400).json({ error: "A prompt is required." });

  // Optional chosen visual direction (from "suggest 4 directions" mode).
  const direction = req.body?.direction as { title?: string; description?: string } | undefined;
  const effectivePrompt =
    direction && session.versions.length === 0
      ? `${prompt}\n\nUse this visual direction: ${direction.title} — ${direction.description}`
      : prompt;

  try {
    // Vision input is attached only to the first turn by runDesignTurn.
    const imageBytes = collectImageBytes(session);
    const version = await runDesignTurn(session, effectivePrompt, imageBytes);
    // Store the user-facing prompt (not the direction-augmented one) in history.
    version.prompt = prompt;

    session.versions.push(version);
    session.messages.push({ role: "user", text: prompt });
    session.messages.push({ role: "assistant", text: version.reply });
    persist(session);

    const body: GenerateResponse = {
      version,
      renderedHtml: substitutePlaceholders(version.html, session.images),
    };
    res.json(body);
  } catch (err) {
    if (err instanceof DesignError) {
      return res.status(422).json({ error: err.message });
    }
    console.error("Generation failed:", err);
    res.status(500).json({ error: "Something went wrong generating the poster." });
  }
});

/** Streaming generate/refine over SSE — emits the poster HTML as it draws in. */
app.post("/api/session/:id/generate/stream", rateLimit, async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });

  const prompt = String(req.body?.prompt ?? "").trim();
  if (!prompt) return res.status(400).json({ error: "A prompt is required." });

  const direction = req.body?.direction as { title?: string; description?: string } | undefined;
  const effectivePrompt =
    direction && session.versions.length === 0
      ? `${prompt}\n\nUse this visual direction: ${direction.title} — ${direction.description}`
      : prompt;

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);

  try {
    const imageBytes = collectImageBytes(session);
    const version = await runDesignTurn(session, effectivePrompt, imageBytes, (partialHtml) => {
      send({ type: "delta", html: substitutePlaceholders(partialHtml, session.images) });
    });
    version.prompt = prompt;

    session.versions.push(version);
    session.messages.push({ role: "user", text: prompt });
    session.messages.push({ role: "assistant", text: version.reply });
    persist(session);

    send({
      type: "done",
      version,
      renderedHtml: substitutePlaceholders(version.html, session.images),
    });
  } catch (err) {
    const message =
      err instanceof DesignError
        ? err.message
        : "Something went wrong generating the poster.";
    if (!(err instanceof DesignError)) console.error("Streaming generation failed:", err);
    send({ type: "error", error: message });
  }
  res.end();
});

/** Roll back to (branch from) an earlier version. */
app.post("/api/session/:id/rollback", (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  const versionId = String(req.body?.versionId ?? "");
  const idx = session.versions.findIndex((v) => v.id === versionId);
  if (idx === -1) return res.status(404).json({ error: "Version not found." });

  // Drop everything after the chosen version; new prompts branch from here.
  session.versions = session.versions.slice(0, idx + 1);
  session.messages = session.messages.slice(0, (idx + 1) * 2);
  persist(session);
  const version = session.versions[idx];
  const body: GenerateResponse = {
    version,
    renderedHtml: substitutePlaceholders(version.html, session.images),
  };
  res.json(body);
});

/** Change the poster size. Re-lays-out the current design at the new size. */
app.post("/api/session/:id/size", rateLimit, async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });

  const size = req.body?.size as PosterSize | undefined;
  if (!isValidPosterSize(size)) {
    return res.status(400).json({ error: "Invalid poster size." });
  }
  session.size = size;
  persist(session);

  // Nothing designed yet — just record the size; the first generate uses it.
  if (session.versions.length === 0) {
    const body: ResizeResponse = { size };
    return res.json(body);
  }

  // Re-lay-out the existing poster at the new dimensions (a re-prompt).
  const prompt =
    `Re-lay-out the poster for a new canvas size: ${size.width}px × ${size.height}px (${size.label}). ` +
    `Keep the same content, colors, typography, and overall style — adapt the composition to fit the new dimensions.`;
  try {
    const version = await runDesignTurn(session, prompt, collectImageBytes(session));
    session.versions.push(version);
    session.messages.push({ role: "user", text: `Resize to ${size.label}` });
    session.messages.push({ role: "assistant", text: version.reply });
    persist(session);
    const body: ResizeResponse = {
      size,
      version,
      renderedHtml: substitutePlaceholders(version.html, session.images),
    };
    res.json(body);
  } catch (err) {
    if (err instanceof DesignError) return res.status(422).json({ error: err.message });
    console.error("Resize failed:", err);
    res.status(500).json({ error: "Something went wrong resizing the poster." });
  }
});

/** Export a version (defaults to the latest) as a print-quality PDF. */
app.post("/api/session/:id/export/pdf", async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });

  const versionId = req.body?.versionId as string | undefined;
  const version = versionId
    ? session.versions.find((v) => v.id === versionId)
    : session.versions.at(-1);
  if (!version) return res.status(404).json({ error: "No poster to export yet." });

  try {
    const html = renderWithDataUris(session, version.html);
    const pdf = await renderPosterPdf(html, session.size.width, session.size.height, fontFaceCss());
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="poster.pdf"');
    res.send(pdf);
  } catch (err) {
    console.error("PDF export failed:", err);
    res.status(500).json({
      error: "PDF export failed. Ensure Playwright's Chromium is available on the server.",
    });
  }
});

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Poster Creator API listening on http://localhost:${PORT}`);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.warn(
      "ANTHROPIC_API_KEY is not set. The SDK will try an `ant auth login` profile; " +
        "if you have neither, generation will fail.",
    );
  }
});
