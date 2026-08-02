# PosterCreator — Development Plan

A web app where you **drop an image, type a prompt, and get a poster designed by Claude** — then keep prompting to tweak specific parts ("make the title bigger", "change the background to navy", "move my photo to the left") until it's exactly what you want.

---

## 1. Core Concept

Claude is a language model, not an image generator — but posters are fundamentally **layout + typography + color + imagery**, and all of those can be expressed as HTML/CSS/SVG. That's the trick this app is built on:

1. You upload an image and describe the poster you want.
2. Claude designs the poster as a **self-contained HTML/CSS document** (the "design"), embedding your image and adding typography, layout, backgrounds, and decorative SVG elements.
3. The browser renders that design live in a preview pane — pixel-perfect, at real poster dimensions.
4. Every follow-up prompt is sent to Claude **with the full conversation history and the current design**, so it edits only what you asked for and leaves the rest untouched.
5. When you're happy, you export the poster as PNG or PDF at print resolution.

This gives you true iterative design (like working with a human designer) rather than the slot-machine behavior of regenerating a whole raster image each time.

---

## 2. User Flow

```
┌────────────────────────────────────────────────────────────┐
│  1. Landing / Editor                                       │
│     ┌──────────────┐   ┌────────────────────────────┐      │
│     │  Drop image  │   │  "A concert poster for      │      │
│     │  here (or    │   │   'Midnight Echoes', dark   │      │
│     │  browse)     │   │   moody, art-deco type"     │      │
│     └──────────────┘   └────────────────────────────┘      │
│                        [ Generate Poster ]                 │
├────────────────────────────────────────────────────────────┤
│  2. Iterate                                                │
│     ┌───────────────────┐  ┌─────────────────────────┐     │
│     │                   │  │ Chat panel               │     │
│     │   Live poster     │  │  You: make the date red  │     │
│     │   preview         │  │  Claude: Done — changed  │     │
│     │   (A3 portrait)   │  │  the date to crimson...  │     │
│     │                   │  │  [prompt box]            │     │
│     └───────────────────┘  └─────────────────────────┘     │
│     [Undo] [Version history] [Export PNG] [Export PDF]     │
└────────────────────────────────────────────────────────────┘
```

Key interactions:
- **Drag & drop image upload** (PNG/JPG/WebP, client-side resize to keep payloads sane). Multiple images supported later; one image for MVP.
- **Prompt box** for the initial brief and every refinement.
- **Live preview** rendered in a sandboxed `<iframe>` at a chosen poster size (A4/A3/Letter/Instagram/custom), scaled to fit the pane.
- **Version history** — every generation is a snapshot; click any version to roll back (and branch from there).
- **Export** — PNG (via html-to-image at 2–4x scale) and PDF (print CSS + browser print pipeline or server-side Playwright render).

---

## 3. Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  React SPA   │────▶│  Node/Express    │────▶│  Claude API     │
│  (Vite + TS) │◀────│  backend (TS)    │◀────│  claude-opus-5  │
└──────────────┘ SSE └──────────────────┘     └─────────────────┘
      │                      │
      │ renders design       │ holds API key, streams responses,
      │ in sandboxed iframe  │ manages conversation state
      ▼
┌──────────────┐
│ Export layer │  html-to-image (PNG) / Playwright (PDF, server)
└──────────────┘
```

**Frontend** — React + TypeScript + Vite. Components: `ImageDropzone`, `PromptBar`, `PosterPreview` (sandboxed iframe), `ChatPanel`, `VersionTimeline`, `ExportMenu`.

**Backend** — small Node/Express (TypeScript) server. Its jobs:
- Keep the Anthropic API key off the client.
- Accept the uploaded image, store it (local disk for MVP), and inline it into the design as a data URI or serve it from `/assets/:id`.
- Own the **conversation state** per poster session (the API is stateless — we resend history each turn).
- Stream Claude's response to the browser via SSE so the poster visibly "draws in".

**Claude integration** — `@anthropic-ai/sdk`, model `claude-opus-5` (adaptive thinking on by default), streaming enabled. The uploaded image is passed to Claude as a **vision input** on the first turn so it can design *around* the actual image (its colors, mood, subject) rather than treating it as an opaque box.

### The generation contract

Claude is instructed (system prompt) to always return the poster as a single fenced HTML block with a fixed skeleton:

```html
<div id="poster" style="width: 794px; height: 1123px; position: relative; overflow: hidden;">
  <!-- all design inside; user image referenced as {{IMAGE_1}} -->
</div>
```

- Fixed pixel dimensions matching the chosen poster size (at 96 dpi working resolution; export upscales).
- `{{IMAGE_1}}` placeholder substituted by the app with the real image URL — keeps huge base64 strings out of the conversation history (critical for token cost and prompt-cache hits).
- No external network resources (fonts via a small curated set of bundled @font-face families Claude is told about; everything else inline).
- Any text outside the fenced block is Claude's conversational reply, shown in the chat panel ("Done — I moved the photo left and enlarged the headline.").

### Iterative editing

Each refinement turn sends: full message history (with prior design HTML in the assistant turns) + the new user prompt. Because the current design is in context, Claude makes **targeted edits** and returns the complete updated HTML. Prompt caching (`cache_control` on the system prompt, incremental breakpoints on the conversation) keeps repeat-turn cost low. If sessions run long, enable server-side compaction.

Safety/robustness details:
- Check `stop_reason` before reading content; handle `refusal` and `max_tokens` explicitly.
- Stream with `.finalMessage()`; parse the HTML block out of the final message; if no valid block is found, ask Claude once to re-emit, then surface an error.
- Render in a sandboxed iframe (`sandbox="allow-same-origin"`, strict CSP, no scripts) since the HTML is model-generated.

---

## 4. Milestones

### M1 — Walking skeleton (core loop works end to end)
- Vite + React frontend scaffold, Express backend scaffold.
- Image drop → upload → stored; prompt → backend → Claude → HTML design back → rendered in iframe.
- Single poster size (A3 portrait), no persistence, no export.
- **Definition of done:** drop a photo, type a brief, see a real designed poster.

### M2 — Iteration & history
- Chat panel with streaming responses; conversation state per session.
- Follow-up prompts modify the current design in place.
- Version snapshots with rollback; undo = rollback one version.
- Prompt caching wired in and verified via `cache_read_input_tokens`.

### M3 — Export & sizes
- PNG export at 2x/3x/4x via html-to-image.
- PDF export (print-quality) via server-side Playwright screenshot/print.
- Poster size picker (A4, A3, Letter, Instagram post/story, custom WxH) — size changes are just a re-prompt with new dimensions.

### M4 — Polish
- Curated font bundle (6–10 licensed/open fonts across serif/sans/display) documented in the system prompt.
- Multiple image uploads (`{{IMAGE_2}}`, ...).
- "Suggest 4 directions" mode: before the first render, Claude proposes 4 distinct visual directions (palette/typeface/mood) and you pick one — a reliable way to get variety.
- Session persistence (SQLite) so you can return to a poster later.
- Basic auth / rate limiting if deployed publicly.

---

## 5. Key Design Decisions & Trade-offs

| Decision | Choice | Why |
|---|---|---|
| Poster medium | HTML/CSS/SVG, not raster generation | Enables surgical edits ("just change the date color"), crisp text at any export size, and full layout control. Raster models regenerate everything and mangle text. |
| Model | `claude-opus-5` | Strong design instincts, vision input for the uploaded photo, structured/literal edit-following, adaptive thinking. |
| Image handling | Placeholder substitution (`{{IMAGE_1}}`) | Keeps base64 out of the token stream; preserves prompt-cache prefix across turns. |
| Edit protocol | Claude returns the **full** updated HTML each turn | Simpler and more robust than diff/patch formats; poster documents are small (a few KB), so the cost is negligible. |
| State | Server-held conversation per session | The Claude API is stateless; the server resends history and owns cache breakpoints. |
| Export | Client PNG (fast) + server PDF (print-true) | Covers social media use and print use with the right fidelity for each. |

## 6. Risks & Mitigations

- **Design quality drift on big changes** — mitigate with the "4 directions" picker and explicit system-prompt style guidance (avoid generic AI aesthetics; bold, context-specific design).
- **Claude occasionally returns malformed/partial HTML** — validate the returned block (parse, check `#poster` root and dimensions); one automatic retry prompt; version history means a bad generation never destroys the previous good one.
- **Token growth over long sessions** — placeholder images, prompt caching, and compaction; also allow "start fresh from this version" which restarts history seeded with only the current design.
- **Font/print fidelity** — bundle fonts locally and render PDF server-side with the same font files, so preview and export match.

## 7. Proposed Repo Layout

```
PosterCreator/
├── PLAN.md                  # this document
├── client/                  # React + Vite + TS
│   └── src/
│       ├── components/      # Dropzone, PromptBar, Preview, ChatPanel, ...
│       ├── lib/             # export (html-to-image), API client
│       └── App.tsx
├── server/                  # Express + TS
│   └── src/
│       ├── routes/          # /api/generate, /api/refine, /api/upload, /api/export
│       ├── claude/          # system prompt, streaming, history & cache mgmt
│       └── index.ts
├── shared/                  # shared types (PosterSpec, Session, Version)
└── fonts/                   # bundled @font-face families
```

---

**Next step:** start M1 — scaffold `client/` and `server/`, write the poster-generation system prompt, and wire the first end-to-end generation.
