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

  const doc = html
    ? `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style></head><body>${html}</body></html>`
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
          {loading ? "Designing your poster…" : "Your poster will appear here."}
        </div>
      )}
      {loading && html && <div className="preview__overlay">Updating…</div>}
    </div>
  );
}
