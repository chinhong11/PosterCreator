import type {
  CreateSessionResponse,
  GenerateResponse,
  PosterSizeId,
  UploadResponse,
} from "@poster/shared";

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? "Request failed");
  }
  return res.json() as Promise<T>;
}

export async function createSession(sizeId: PosterSizeId): Promise<string> {
  const res = await fetch("/api/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sizeId }),
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
