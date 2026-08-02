import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import {
  POSTER_SIZES,
  substitutePlaceholders,
  type CreateSessionResponse,
  type GenerateResponse,
  type PosterSizeId,
  type UploadResponse,
} from "@poster/shared";
import { createSession, getSession, addImage } from "./sessions.js";
import { runDesignTurn, DesignError, type ImageBytes } from "./claude/generate.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.join(__dirname, "..", "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const PORT = Number(process.env.PORT ?? 8787);
const app = express();
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// Serve uploaded images so the rendered poster can reference them by URL.
app.use("/assets", express.static(UPLOAD_DIR));

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

function baseUrl(req: express.Request): string {
  return `${req.protocol}://${req.get("host")}`;
}

/** Create a new poster session for a given size. */
app.post("/api/session", (req, res) => {
  const sizeId = (req.body?.sizeId as PosterSizeId) ?? "a3-portrait";
  if (!POSTER_SIZES[sizeId]) {
    return res.status(400).json({ error: "Unknown poster size." });
  }
  const session = createSession(sizeId);
  const body: CreateSessionResponse = { sessionId: session.id };
  res.json(body);
});

/** Upload an image to a session. Stored on disk, served from /assets. */
app.post("/api/session/:id/image", upload.single("image"), (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });
  if (!req.file) return res.status(400).json({ error: "No image uploaded." });

  const image = addImage(session.id, {
    filename: req.file.originalname,
    mediaType: req.file.mimetype,
    url: `${baseUrl(req)}/assets/${req.file.filename}`,
  });
  if (!image) return res.status(404).json({ error: "Session not found." });

  // Track the on-disk path so we can read bytes for vision input later.
  diskPaths.set(image.url, path.join(UPLOAD_DIR, req.file.filename));

  const body: UploadResponse = { image };
  res.json(body);
});

// Maps a served image URL back to its file on disk (for vision input).
const diskPaths = new Map<string, string>();

/** Generate or refine the poster for a session. */
app.post("/api/session/:id/generate", async (req, res) => {
  const session = getSession(req.params.id);
  if (!session) return res.status(404).json({ error: "Session not found." });

  const prompt = String(req.body?.prompt ?? "").trim();
  if (!prompt) return res.status(400).json({ error: "A prompt is required." });

  try {
    // Read image bytes for vision input (only needed on the first turn, but
    // cheap to prepare; runDesignTurn attaches them only to turn one).
    const imageBytes: ImageBytes[] = [];
    for (const img of session.images) {
      const diskPath = diskPaths.get(img.url);
      if (diskPath && fs.existsSync(diskPath)) {
        imageBytes.push({
          placeholder: img.placeholder,
          mediaType: img.mediaType,
          base64: fs.readFileSync(diskPath).toString("base64"),
        });
      }
    }

    const version = await runDesignTurn(session, prompt, imageBytes);

    session.versions.push(version);
    session.messages.push({ role: "user", text: prompt });
    session.messages.push({ role: "assistant", text: version.reply });

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
  const version = session.versions[idx];
  const body: GenerateResponse = {
    version,
    renderedHtml: substitutePlaceholders(version.html, session.images),
  };
  res.json(body);
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
