import { useEffect, useMemo, useRef, useState } from "react";
import {
  POSTER_SIZES,
  type ChatMessage,
  type PosterSizeId,
  type PosterVersion,
} from "@poster/shared";
import { ImageDropzone } from "./components/ImageDropzone.js";
import { PosterPreview } from "./components/PosterPreview.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { VersionTimeline } from "./components/VersionTimeline.js";
import { createSession, uploadImage, generate, rollback } from "./api.js";
import { exportPng } from "./lib/exportPoster.js";

export default function App() {
  const [sizeId, setSizeId] = useState<PosterSizeId>("a3-portrait");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | undefined>();
  const [hasImage, setHasImage] = useState(false);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  const [versions, setVersions] = useState<PosterVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const size = POSTER_SIZES[sizeId];
  const started = versions.length > 0;

  // Ensure a session exists before the first action.
  const ensureSession = async (): Promise<string> => {
    if (sessionId) return sessionId;
    const id = await createSession(sizeId);
    setSessionId(id);
    return id;
  };

  const handleFile = async (file: File) => {
    setError(null);
    setImagePreview(URL.createObjectURL(file));
    try {
      const id = await ensureSession();
      await uploadImage(id, file);
      setHasImage(true);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleSend = async (prompt: string) => {
    setError(null);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    try {
      const id = await ensureSession();
      const res = await generate(id, prompt);
      setRenderedHtml(res.renderedHtml);
      setVersions((v) => [...v, res.version]);
      setCurrentVersionId(res.version.id);
      setMessages((m) => [...m, { role: "assistant", text: res.version.reply }]);
    } catch (e) {
      setError((e as Error).message);
      setMessages((m) => [...m, { role: "assistant", text: `⚠️ ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await rollback(sessionId, versionId);
      const idx = versions.findIndex((v) => v.id === versionId);
      setVersions((v) => v.slice(0, idx + 1));
      setMessages((m) => m.slice(0, (idx + 1) * 2));
      setRenderedHtml(res.renderedHtml);
      setCurrentVersionId(versionId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const previewRef = useRef<HTMLDivElement>(null);
  const handleExport = async (scale: number) => {
    const iframe = previewRef.current?.querySelector("iframe");
    if (!iframe) return;
    try {
      await exportPng(iframe as HTMLIFrameElement, size, scale);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const promptPlaceholder = useMemo(
    () =>
      started
        ? "Describe a tweak…  (⌘/Ctrl + Enter to send)"
        : "Describe the poster you want…  (⌘/Ctrl + Enter to send)",
    [started],
  );

  return (
    <div className="app">
      <header className="app__header">
        <h1>Poster Creator</h1>
        <div className="app__controls">
          <label>
            Size
            <select
              value={sizeId}
              disabled={started}
              onChange={(e) => setSizeId(e.target.value as PosterSizeId)}
            >
              {Object.values(POSTER_SIZES).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <div className="app__export">
            <button disabled={!renderedHtml || busy} onClick={() => handleExport(2)}>
              PNG 2×
            </button>
            <button disabled={!renderedHtml || busy} onClick={() => handleExport(4)}>
              PNG 4×
            </button>
          </div>
        </div>
      </header>

      {error && <div className="app__error">{error}</div>}

      <main className="app__main">
        <section className="app__preview" ref={previewRef}>
          <PosterPreview html={renderedHtml} size={size} loading={busy} />
          <VersionTimeline
            versions={versions}
            currentId={currentVersionId}
            onSelect={handleRollback}
            disabled={busy}
          />
        </section>

        <aside className="app__side">
          <ImageDropzone onFile={handleFile} previewUrl={imagePreview} disabled={busy} />
          {hasImage && <p className="app__note">Image added — it'll be designed into your poster.</p>}
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            disabled={busy}
            placeholder={promptPlaceholder}
          />
        </aside>
      </main>
    </div>
  );
}
