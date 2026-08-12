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

// ---- Auth token (shared-password gate) ----

const TOKEN_KEY = "poster:token";
let authToken = localStorage.getItem(TOKEN_KEY) ?? "";
let onUnauthorized: () => void = () => {};

export function setToken(token: string): void {
  authToken = token;
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function hasToken(): boolean {
  return !!authToken;
}

/** Register a handler invoked whenever the API returns 401 (token invalid). */
export function setUnauthorizedHandler(fn: () => void): void {
  onUnauthorized = fn;
}

/** fetch wrapper that attaches the bearer token and traps 401s. */
async function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (authToken) headers.set("Authorization", `Bearer ${authToken}`);
  const res = await fetch(url, { ...init, headers });
  if (res.status === 401) {
    setToken("");
    onUnauthorized();
  }
  return res;
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

function jsonPost(url: string, body: unknown): Promise<Response> {
  return apiFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// ---- Auth endpoints (public) ----

export async function getConfig(): Promise<{ authRequired: boolean }> {
  const res = await fetch("/api/config");
  return json<{ authRequired: boolean }>(res);
}

/** Log in with the shared password; stores the returned token on success. */
export async function login(password: string): Promise<void> {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const body = await json<{ token: string }>(res);
  setToken(body.token);
}

// ---- Sessions ----

export async function createSession(size: PosterSize): Promise<string> {
  const body = await json<CreateSessionResponse>(await jsonPost("/api/session", { size }));
  return body.sessionId;
}

export async function uploadImage(sessionId: string, file: File): Promise<UploadResponse> {
  const form = new FormData();
  form.append("image", file);
  const res = await apiFetch(`/api/session/${sessionId}/image`, { method: "POST", body: form });
  return json<UploadResponse>(res);
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
  const res = await jsonPost(`/api/session/${sessionId}/generate/stream`, { prompt, direction });
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
  const res = await jsonPost(`/api/session/${sessionId}/directions`, { prompt });
  return (await json<DirectionsResponse>(res)).directions;
}

export async function loadSession(sessionId: string): Promise<SessionLoadResponse> {
  return json<SessionLoadResponse>(await apiFetch(`/api/session/${sessionId}`));
}

export async function listSessions(): Promise<SessionSummary[]> {
  const body = await json<{ sessions: SessionSummary[] }>(await apiFetch("/api/sessions"));
  return body.sessions;
}

export async function rollback(sessionId: string, versionId: string): Promise<GenerateResponse> {
  return json<GenerateResponse>(await jsonPost(`/api/session/${sessionId}/rollback`, { versionId }));
}

export async function resize(sessionId: string, size: PosterSize): Promise<ResizeResponse> {
  return json<ResizeResponse>(await jsonPost(`/api/session/${sessionId}/size`, { size }));
}

/** Download a server-rendered export (PNG or PDF) — exact font/PDF fidelity. */
async function downloadExport(
  sessionId: string,
  format: "pdf" | "png",
  filename: string,
  body: Record<string, unknown> = {},
): Promise<void> {
  const res = await jsonPost(`/api/session/${sessionId}/export/${format}`, body);
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
