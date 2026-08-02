import { useMemo, useRef, useState } from "react";
import {
  POSTER_SIZES,
  customSize,
  type ChatMessage,
  type PosterSize,
  type PosterSizeId,
  type PosterVersion,
} from "@poster/shared";
import { ImageDropzone } from "./components/ImageDropzone.js";
import { PosterPreview } from "./components/PosterPreview.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { VersionTimeline } from "./components/VersionTimeline.js";
import { createSession, uploadImage, generate, rollback, resize, exportPdf } from "./api.js";
import { exportPng } from "./lib/exportPoster.js";

export default function App() {
  const [sizeId, setSizeId] = useState<PosterSizeId>("a3-portrait");
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1350);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string | undefined>();
  const [hasImage, setHasImage] = useState(false);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  const [versions, setVersions] = useState<PosterVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const size = useMemo<PosterSize>(
    () => (sizeId === "custom" ? customSize(customW, customH) : POSTER_SIZES[sizeId]),
    [sizeId, customW, customH],
  );
  const started = versions.length > 0;

  const ensureSession = async (s: PosterSize): Promise<string> => {
    if (sessionId) return sessionId;
    const id = await createSession(s);
    setSessionId(id);
    return id;
  };

  const handleFile = async (file: File) => {
    setError(null);
    setImagePreview(URL.createObjectURL(file));
    try {
      const id = await ensureSession(size);
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
      const id = await ensureSession(size);
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

  // Change poster size. If a poster already exists, the server re-lays it out
  // at the new dimensions and returns a new version.
  const applySize = async (s: PosterSize) => {
    setSizeId(s.id);
    if (s.id === "custom") {
      setCustomW(s.width);
      setCustomH(s.height);
    }
    if (!sessionId) return; // first generate will use the derived size
    setBusy(true);
    setError(null);
    try {
      const res = await resize(sessionId, s);
      if (res.version && res.renderedHtml) {
        setRenderedHtml(res.renderedHtml);
        setVersions((v) => [...v, res.version!]);
        setCurrentVersionId(res.version.id);
        setMessages((m) => [
          ...m,
          { role: "user", text: `Resize to ${s.label}` },
          { role: "assistant", text: res.version!.reply },
        ]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const onSelectSize = (id: PosterSizeId) => {
    if (id === "custom") {
      setSizeId("custom"); // reveal W/H inputs; user hits "Apply"
      return;
    }
    void applySize(POSTER_SIZES[id]);
  };

  const previewRef = useRef<HTMLDivElement>(null);
  const handleExportPng = async (scale: number) => {
    const iframe = previewRef.current?.querySelector("iframe");
    if (!iframe) return;
    try {
      await exportPng(iframe as HTMLIFrameElement, size, scale);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const handleExportPdf = async () => {
    if (!sessionId) return;
    setExporting(true);
    setError(null);
    try {
      await exportPdf(sessionId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const promptPlaceholder = started
    ? "Describe a tweak…  (⌘/Ctrl + Enter to send)"
    : "Describe the poster you want…  (⌘/Ctrl + Enter to send)";

  const canExport = !!renderedHtml && !busy;

  return (
    <div className="app">
      <header className="app__header">
        <h1>Poster Creator</h1>
        <div className="app__controls">
          <label>
            Size
            <select
              value={sizeId}
              disabled={busy}
              onChange={(e) => onSelectSize(e.target.value as PosterSizeId)}
            >
              {Object.values(POSTER_SIZES).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
              <option value="custom">Custom…</option>
            </select>
          </label>

          {sizeId === "custom" && (
            <div className="app__custom">
              <input
                type="number"
                value={customW}
                min={200}
                max={4000}
                disabled={busy}
                onChange={(e) => setCustomW(Number(e.target.value))}
              />
              <span>×</span>
              <input
                type="number"
                value={customH}
                min={200}
                max={4000}
                disabled={busy}
                onChange={(e) => setCustomH(Number(e.target.value))}
              />
              <button disabled={busy} onClick={() => applySize(customSize(customW, customH))}>
                Apply
              </button>
            </div>
          )}

          <div className="app__export">
            <button disabled={!canExport} onClick={() => handleExportPng(2)}>
              PNG 2×
            </button>
            <button disabled={!canExport} onClick={() => handleExportPng(3)}>
              PNG 3×
            </button>
            <button disabled={!canExport} onClick={() => handleExportPng(4)}>
              PNG 4×
            </button>
            <button disabled={!canExport || exporting} onClick={handleExportPdf}>
              {exporting ? "PDF…" : "PDF"}
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
