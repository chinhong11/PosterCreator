import { useEffect, useRef, useState } from "react";
import type { PosterSize } from "@poster/shared";

interface Props {
  html: string | null;
  size: PosterSize;
  loading: boolean;
}

/**
 * Renders model-generated poster HTML inside a sandboxed iframe, scaled to fit
 * the available pane. The iframe has no script permission (the HTML is
 * untrusted model output) — only same-origin so the poster can load /assets.
 */
export function PosterPreview({ html, size, loading }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const pad = 48;
      const availW = el.clientWidth - pad;
      const availH = el.clientHeight - pad;
      setScale(Math.min(availW / size.width, availH / size.height, 1));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size.width, size.height]);

  // <base> makes relative /assets image URLs resolve to the app origin
  // (srcdoc documents otherwise have no usable base URL). The fonts stylesheet
  // provides the same embedded fonts used in PDF export, so preview matches print.
  const doc = html
    ? `<!doctype html><html><head><meta charset="utf-8"><base href="${location.origin}/">` +
      `<link rel="stylesheet" href="/api/fonts.css"><style>html,body{margin:0;padding:0}</style>` +
      `</head><body>${html}</body></html>`
    : "";

  return (
    <div className="preview" ref={wrapRef}>
      {html ? (
        <div
          className="preview__stage"
          style={{
            width: size.width,
            height: size.height,
            transform: `scale(${scale})`,
          }}
        >
          <iframe
            title="Poster preview"
            className="preview__frame"
            sandbox="allow-same-origin"
            srcDoc={doc}
            width={size.width}
            height={size.height}
          />
        </div>
      ) : (
        <div className="preview__empty">
          <svg className="preview__icon" viewBox="0 0 48 48" fill="none" aria-hidden="true">
            <rect x="8" y="6" width="32" height="36" rx="3" stroke="currentColor" strokeWidth="1.5" />
            <circle cx="18" cy="17" r="3.2" stroke="currentColor" strokeWidth="1.5" />
            <path
              d="M11 34l9-9 6 6 4-4 7 7"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <span>{loading ? "Designing your poster…" : "Your poster will appear here"}</span>
          {!loading && <small>Drop an image and describe what you want</small>}
        </div>
      )}
      {loading && html && <div className="preview__overlay">Updating…</div>}
    </div>
  );
}
