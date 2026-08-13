import { useEffect, useMemo, useState } from "react";
import {
  POSTER_SIZES,
  customSize,
  type ChatMessage,
  type DesignDirection,
  type PosterSize,
  type PosterSizeId,
  type PosterVersion,
} from "@poster/shared";
import { ImageDropzone } from "./components/ImageDropzone.js";
import { PosterPreview } from "./components/PosterPreview.js";
import { ChatPanel } from "./components/ChatPanel.js";
import { VersionTimeline } from "./components/VersionTimeline.js";
import { DirectionPicker } from "./components/DirectionPicker.js";
import { LoginGate } from "./components/LoginGate.js";
import { Gallery } from "./components/Gallery.js";
import {
  createSession,
  uploadImage,
  streamGenerate,
  rollback,
  resize,
  exportPdf,
  exportPng,
  suggestDirections,
  loadSession,
  getConfig,
  hasToken,
  setUnauthorizedHandler,
} from "./api.js";

const LAST_KEY = "poster:lastSession";

interface UploadedImage {
  url: string;
  preview: string;
}

export default function App() {
  const [sizeId, setSizeId] = useState<PosterSizeId>("a3-portrait");
  const [customW, setCustomW] = useState(1080);
  const [customH, setCustomH] = useState(1350);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [renderedHtml, setRenderedHtml] = useState<string | null>(null);
  const [streamingHtml, setStreamingHtml] = useState<string | null>(null);
  const [versions, setVersions] = useState<PosterVersion[]>([]);
  const [currentVersionId, setCurrentVersionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auth + gallery
  const [authReady, setAuthReady] = useState(false);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [showGallery, setShowGallery] = useState(false);

  // "Suggest 4 directions" mode.
  const [directionsMode, setDirectionsMode] = useState(false);
  const [pendingDirections, setPendingDirections] = useState<DesignDirection[] | null>(null);
  const [pendingBrief, setPendingBrief] = useState<string>("");

  const size = useMemo<PosterSize>(
    () => (sizeId === "custom" ? customSize(customW, customH) : POSTER_SIZES[sizeId]),
    [sizeId, customW, customH],
  );
  const started = versions.length > 0;

  // On load: resolve auth, then resume the last session if any.
  useEffect(() => {
    setUnauthorizedHandler(() => setNeedsAuth(true));
    (async () => {
      try {
        const { authRequired } = await getConfig();
        if (authRequired && !hasToken()) {
          setNeedsAuth(true);
          setAuthReady(true);
          return;
        }
      } catch {
        // config unreachable — fall through and let API calls surface errors
      }
      setAuthReady(true);
      boot();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const boot = () => {
    const last = localStorage.getItem(LAST_KEY);
    if (last) void resume(last);
  };

  const onAuthed = () => {
    setNeedsAuth(false);
    boot();
  };

  const resume = async (id: string) => {
    setBusy(true);
    try {
      const { session, renderedHtml: rendered } = await loadSession(id);
      setSessionId(session.id);
      setSizeId(session.size.id);
      if (session.size.id === "custom") {
        setCustomW(session.size.width);
        setCustomH(session.size.height);
      }
      setImages(session.images.map((img) => ({ url: img.url, preview: img.url })));
      setVersions(session.versions);
      setMessages(session.messages);
      setRenderedHtml(rendered);
      setCurrentVersionId(session.versions.at(-1)?.id ?? null);
    } catch {
      localStorage.removeItem(LAST_KEY); // stale id
    } finally {
      setBusy(false);
    }
  };

  const newPoster = () => {
    localStorage.removeItem(LAST_KEY);
    setSessionId(null);
    setImages([]);
    setRenderedHtml(null);
    setStreamingHtml(null);
    setVersions([]);
    setCurrentVersionId(null);
    setMessages([]);
    setPendingDirections(null);
    setPendingBrief("");
    setError(null);
  };

  const ensureSession = async (s: PosterSize): Promise<string> => {
    if (sessionId) return sessionId;
    const id = await createSession(s);
    setSessionId(id);
    localStorage.setItem(LAST_KEY, id);
    return id;
  };

  const handleFile = async (file: File) => {
    setError(null);
    const preview = URL.createObjectURL(file);
    try {
      const id = await ensureSession(size);
      const { image } = await uploadImage(id, file);
      setImages((imgs) => [...imgs, { url: image.url, preview }]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const doGenerate = (id: string, prompt: string, direction?: DesignDirection) =>
    new Promise<void>((resolve, reject) => {
      streamGenerate(id, prompt, direction, {
        onDelta: (html) => setStreamingHtml(html),
        onDone: (res) => {
          setStreamingHtml(null);
          setRenderedHtml(res.renderedHtml);
          setVersions((v) => [...v, res.version]);
          setCurrentVersionId(res.version.id);
          setMessages((m) => [...m, { role: "assistant", text: res.version.reply }]);
          resolve();
        },
        onError: (msg) => {
          setStreamingHtml(null);
          reject(new Error(msg));
        },
      }).catch(reject);
    });

  const handleSend = async (prompt: string) => {
    setError(null);
    setBusy(true);
    setMessages((m) => [...m, { role: "user", text: prompt }]);
    try {
      const id = await ensureSession(size);
      // First turn with directions mode on → propose directions before designing.
      if (directionsMode && !started) {
        // The picker (in the preview area) conveys the directions; don't add
        // client-only chat bubbles that would desync from server history.
        const dirs = await suggestDirections(id, prompt);
        setPendingDirections(dirs);
        setPendingBrief(prompt);
      } else {
        await doGenerate(id, prompt);
      }
    } catch (e) {
      setError((e as Error).message);
      setMessages((m) => [...m, { role: "assistant", text: `⚠️ ${(e as Error).message}` }]);
    } finally {
      setBusy(false);
    }
  };

  const pickDirection = async (d: DesignDirection) => {
    if (!sessionId) return;
    setPendingDirections(null);
    setBusy(true);
    setError(null);
    try {
      await doGenerate(sessionId, pendingBrief, d);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const skipDirections = async () => {
    if (!sessionId) return;
    setPendingDirections(null);
    setBusy(true);
    try {
      await doGenerate(sessionId, pendingBrief);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRollback = async (versionId: string) => {
    if (!sessionId) return;
    setBusy(true);
    setError(null);
    try {
      await rollback(sessionId, versionId);
      // Resync from the server's authoritative state instead of guessing the
      // message/version alignment (directions mode and failed turns break the
      // "2 messages per version" assumption).
      const { session, renderedHtml: rendered } = await loadSession(sessionId);
      setVersions(session.versions);
      setMessages(session.messages);
      setRenderedHtml(rendered);
      setStreamingHtml(null);
      setCurrentVersionId(session.versions.at(-1)?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

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
      setSizeId("custom");
      return;
    }
    void applySize(POSTER_SIZES[id]);
  };

  // Exports are server-rendered (Playwright) so PNG and PDF match the preview
  // exactly, including the embedded fonts.
  const runExport = async (fn: () => Promise<void>) => {
    if (!sessionId) return;
    setExporting(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setExporting(false);
    }
  };
  const handleExportPng = (scale: number) => runExport(() => exportPng(sessionId!, scale));
  const handleExportPdf = () => runExport(() => exportPdf(sessionId!));

  const openFromGallery = (id: string) => {
    setShowGallery(false);
    if (id === sessionId) return;
    localStorage.setItem(LAST_KEY, id);
    void resume(id);
  };

  const promptPlaceholder = started
    ? "Describe a tweak…  (⌘/Ctrl + Enter to send)"
    : "Describe the poster you want…  (⌘/Ctrl + Enter to send)";
  const canExport = !!renderedHtml && !busy;

  // Render gates: wait for auth resolution, then show login if required.
  if (!authReady) return <div className="app app--center">Loading…</div>;
  if (needsAuth) return <LoginGate onAuthed={onAuthed} />;

  return (
    <div className="app">
      {showGallery && (
        <Gallery
          currentId={sessionId}
          onOpen={openFromGallery}
          onNew={() => {
            setShowGallery(false);
            newPoster();
          }}
          onClose={() => setShowGallery(false)}
        />
      )}
      <header className="app__header">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true" />
          <span className="brand__name">
            Poster<em>Creator</em>
          </span>
        </div>
        <div className="app__controls">
          <button className="btn btn--ghost" onClick={() => setShowGallery(true)} disabled={busy}>
            My posters
          </button>
          <button className="btn btn--ghost" onClick={newPoster} disabled={busy}>
            New
          </button>
          <label className="field">
            <span className="field__label">Size</span>
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
              <button
                className="btn btn--ghost"
                disabled={busy}
                onClick={() => applySize(customSize(customW, customH))}
              >
                Apply
              </button>
            </div>
          )}

          <div className="segmented" role="group" aria-label="Export">
            <button disabled={!canExport || exporting} onClick={() => handleExportPng(2)}>
              PNG 2×
            </button>
            <button disabled={!canExport || exporting} onClick={() => handleExportPng(3)}>
              PNG 3×
            </button>
            <button disabled={!canExport || exporting} onClick={() => handleExportPng(4)}>
              PNG 4×
            </button>
            <button
              className="segmented__primary"
              disabled={!canExport || exporting}
              onClick={handleExportPdf}
            >
              {exporting ? "Exporting…" : "PDF"}
            </button>
          </div>
        </div>
      </header>

      {error && <div className="app__error">{error}</div>}

      <main className="app__main">
        <section className="app__preview">
          {pendingDirections ? (
            <DirectionPicker
              directions={pendingDirections}
              onPick={pickDirection}
              onCancel={skipDirections}
              disabled={busy}
            />
          ) : (
            <PosterPreview html={streamingHtml ?? renderedHtml} size={size} loading={busy} />
          )}
          <VersionTimeline
            versions={versions}
            currentId={currentVersionId}
            onSelect={handleRollback}
            disabled={busy}
          />
        </section>

        <aside className="app__side">
          <ImageDropzone onFile={handleFile} disabled={busy} />
          {images.length > 0 && (
            <div className="thumbs">
              {images.map((img, i) => (
                <img key={i} className="thumbs__item" src={img.preview} alt={`Image ${i + 1}`} />
              ))}
            </div>
          )}
          <label className="app__toggle">
            <input
              type="checkbox"
              checked={directionsMode}
              disabled={busy || started}
              onChange={(e) => setDirectionsMode(e.target.checked)}
            />
            Suggest 4 directions before the first design
          </label>
          <ChatPanel
            messages={messages}
            onSend={handleSend}
            disabled={busy || !!pendingDirections}
            placeholder={promptPlaceholder}
          />
        </aside>
      </main>
    </div>
  );
}
