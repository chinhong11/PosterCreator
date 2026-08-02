import type {
  CreateSessionResponse,
  GenerateResponse,
  PosterSize,
  ResizeResponse,
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

export async function generate(sessionId: string, prompt: string): Promise<GenerateResponse> {
  const res = await fetch(`/api/session/${sessionId}/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  return json<GenerateResponse>(res);
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

/** Request a print-quality PDF and trigger a browser download. */
export async function exportPdf(sessionId: string): Promise<void> {
  const res = await fetch(`/api/session/${sessionId}/export/pdf`, { method: "POST" });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "PDF export failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "poster.pdf";
  a.click();
  URL.revokeObjectURL(url);
}
