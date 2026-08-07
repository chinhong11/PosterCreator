import type {
  CreateSessionResponse,
  DesignDirection,
  DirectionsResponse,
  GenerateResponse,
  PosterSize,
  ResizeResponse,
  SessionLoadResponse,
  SessionSummary,
  UploadResponse,
} from "@poster/shared";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export async function createSession(size: PosterSize): Promise<string> {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size }),
  });
  const body = await json<CreateSessionResponse>(res);
  return body.sessionId;
}

export async function uploadImage(sessionId: string, file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("image", file);
  const res = await fetch(`/api/session/${sessionId}/image`, {
    method: "POST",
    body: form,
  });
  return json<UploadResponse>(res);
}

export async function generate(
  sessionId: string,
  prompt: string,
  direction?: DesignDirection,
): Promise<GenerateResponse> {
  const res = await fetch(`/api/session/${sessionId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, direction }),
  });
  return json<GenerateResponse>(res);
}

export interface StreamHandlers {
  onDelta: (html: string) => void;
  onDone: (res: GenerateResponse) => void;
  onError: (message: string) => void;
}

/**
 * Streaming generate over SSE: onDelta fires with partial poster HTML as it
 * draws in; onDone fires with the final version; onError on failure.
 */
export async function streamGenerate(
  sessionId: string,
  prompt: string,
  direction: DesignDirection | undefined,
  handlers: StreamHandlers,
): Promise<void> {
  const res = await fetch(`/api/session/${sessionId}/generate/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, direction }),
  });
  if (!res.ok || !res.body) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    handlers.onError(body.error ?? "Request failed");
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep: number;
    while ((sep = buffer.indexOf("\n\n")) >= 0) {
      const chunk = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const evt = JSON.parse(line.slice(5).trim());
      if (evt.type === "delta") handlers.onDelta(evt.html);
      else if (evt.type === "done") handlers.onDone(evt as GenerateResponse);
      else if (evt.type === "error") handlers.onError(evt.error);
    }
  }
}

export async function suggestDirections(
  sessionId: string,
  prompt: string,
): Promise<DesignDirection[]> {
  const res = await fetch(`/api/session/${sessionId}/directions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  return (await json<DirectionsResponse>(res)).directions;
}

export async function loadSession(sessionId: string): Promise<SessionLoadResponse> {
  const res = await fetch(`/api/session/${sessionId}`);
  return json<SessionLoadResponse>(res);
}

export async function listSessions(): Promise<SessionSummary[]> {
  const res = await fetch("/api/sessions");
  const body = await json<{ sessions: SessionSummary[] }>(res);
  return body.sessions;
}

export async function rollback(sessionId: string, versionId: string): Promise<GenerateResponse> {
  const res = await fetch(`/api/session/${sessionId}/rollback`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ versionId }),
  });
  return json<GenerateResponse>(res);
}

export async function resize(sessionId: string, size: PosterSize): Promise<ResizeResponse> {
  const res = await fetch(`/api/session/${sessionId}/size`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ size }),
  });
  return json<ResizeResponse>(res);
}

/** Download a server-rendered export (PNG or PDF) — exact font/PDF fidelity. */
async function downloadExport(
  sessionId: string,
  format: "pdf" | "png",
  filename: string,
  body: Record<string, unknown> = {},
): Promise<void> {
  const res = await fetch(`/api/session/${sessionId}/export/${format}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? "Export failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Request a print-quality PDF and trigger a browser download. */
export function exportPdf(sessionId: string): Promise<void> {
  return downloadExport(sessionId, "pdf", "poster.pdf");
}

/** Request a PNG at the given scale (server-rendered) and download it. */
export function exportPng(sessionId: string, scale: number): Promise<void> {
  return downloadExport(sessionId, "png", `poster@${scale}x.png`, { scale });
}
