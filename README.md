# Poster Creator

Drop an image, describe the poster you want, and Claude designs it as editable
HTML/CSS/SVG. Then keep prompting to refine specific parts — "make the title
bigger", "use a navy background", "move the photo left" — and Claude edits just
that, leaving the rest intact. Export the result as PNG.

See [`PLAN.md`](./PLAN.md) for the full design rationale and roadmap.

## How it works

Claude is a language model, not an image generator — but a poster is layout +
typography + color + imagery, all expressible as HTML/CSS/SVG. So Claude designs
the poster as a self-contained HTML document with your image embedded, the
browser renders it live at real poster dimensions, and every follow-up prompt
edits the current design in place. This gives true iterative design instead of
regenerating a whole raster image each time.

- **Frontend** — React + Vite + TypeScript (`client/`)
- **Backend** — Express + TypeScript, holds the API key and conversation state (`server/`)
- **Model** — `claude-opus-5` with vision input for your uploaded image

## Prerequisites

- Node.js 20+
- An Anthropic API key (or an `ant auth login` profile)

## Setup

```bash
npm install                       # installs all workspaces
cp server/.env.example server/.env   # then set ANTHROPIC_API_KEY
```

## Run (development)

Two processes — API server and Vite dev server:

```bash
npm run dev:server    # http://localhost:8787
npm run dev:client    # http://localhost:5173
```

Open http://localhost:5173. Pick a size, drop an image, describe your poster,
and iterate. The Vite dev server proxies `/api` and `/assets` to the backend.

## Project layout

```
PosterCreator/
├── PLAN.md            # design doc & roadmap
├── shared/            # types shared by client & server
├── server/            # Express API + Claude integration
│   └── src/claude/    # system prompt + generation logic
└── client/            # React SPA
    └── src/components # Dropzone, Preview, ChatPanel, VersionTimeline
```

## Current status (M1–M4)

- ✅ Image upload, prompt, and end-to-end poster generation
- ✅ Iterative refinement with conversation history (edits in place)
- ✅ Version history with rollback / branch
- ✅ Sandboxed iframe live preview, scaled to fit
- ✅ PNG export (2× / 3× / 4×)
- ✅ Print-quality PDF export (server-side Playwright, images inlined)
- ✅ Poster sizes: A4/A3/Letter/Instagram presets **and** custom W×H
- ✅ Resize mid-session — re-lays-out the current poster at the new dimensions
- ✅ **Multiple images** per poster (`{{IMAGE_1}}`, `{{IMAGE_2}}`, …)
- ✅ **"Suggest 4 directions"** mode — pick a visual direction before designing
- ✅ **Curated typography system** documented to the model (8 font families)
- ✅ **Persistence** (SQLite) — sessions survive restarts and auto-resume
- ✅ Per-IP rate limiting on the model-calling endpoints
- ⏳ Streaming "draws-in" preview, embedded web fonts, deploy auth (see `PLAN.md`)

### Notes on M4

- **Typography** is a curated set of cross-platform font-family *stacks* (not
  embedded binaries), documented in the system prompt so the model designs with
  a consistent, high-quality type vocabulary. Exact glyphs depend on the
  viewer's installed fonts; embedding `woff2` for pixel-identical preview/PDF is
  a documented future step.
- **Persistence** uses SQLite (`server/data/posters.db`, created on first run;
  needs a native build of `better-sqlite3`). The client stores the last session
  id in `localStorage` and auto-resumes it; use **New** to start fresh.
- **Directions mode** is a first-turn-only toggle: it proposes four distinct
  palette/type/mood directions, and your pick seeds the initial design.

### PDF export & Playwright

PDF export renders the poster server-side with headless Chromium at exact
dimensions (a single-page, print-true PDF), inlining the uploaded image as a
data URI so the render has no network dependency. Playwright's browser must be
available:

- Normal setup: `npx playwright install chromium` (once).
- If a preinstalled browser cache exists (`PLAYWRIGHT_BROWSERS_PATH`), the
  server auto-discovers it. You can also force a binary with
  `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/path/to/chrome`.

## Notes

- Uploaded images are stored on local disk (`server/uploads/`) for the MVP and
  substituted into the design via `{{IMAGE_N}}` placeholders, keeping large
  base64 strings out of the conversation history.
- The poster HTML is model-generated, so it renders in a sandboxed iframe with
  no script execution.
