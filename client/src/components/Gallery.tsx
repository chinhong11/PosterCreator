import { useEffect, useState } from "react";
import type { SessionSummary } from "@poster/shared";
import { listSessions } from "../api.js";

function timeAgo(ts: number): string {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return "just now";
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

interface Props {
  onOpen: (id: string) => void;
  onNew: () => void;
  onClose: () => void;
  currentId: string | null;
}

/** "My posters" overlay: lists saved sessions; click one to resume it. */
export function Gallery({ onOpen, onNew, onClose, currentId }: Props) {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listSessions()
      .then(setSessions)
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <div className="modal" onClick={onClose}>
      <div className="modal__panel" onClick={(e) => e.stopPropagation()}>
        <div className="modal__head">
          <strong>My posters</strong>
          <div className="modal__actions">
            <button onClick={onNew}>+ New poster</button>
            <button onClick={onClose}>Close</button>
          </div>
        </div>
        {error && <div className="app__error">{error}</div>}
        {!sessions ? (
          <p className="chat__hint">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="chat__hint">No posters yet — describe one to get started.</p>
        ) : (
          <div className="gallery">
            {sessions.map((s) => (
              <button
                key={s.id}
                className={`gallery-card${s.id === currentId ? " gallery-card--current" : ""}`}
                onClick={() => onOpen(s.id)}
              >
                <span className="gallery-card__title">{s.title}</span>
                <span className="gallery-card__meta">
                  {s.size.label} · {s.versionCount} version{s.versionCount === 1 ? "" : "s"} ·{" "}
                  {timeAgo(s.updatedAt)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
