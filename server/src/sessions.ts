import { nanoid } from "nanoid";
import type { SessionImage, SessionState, PosterSize } from "@poster/shared";
import { saveSession, loadAllSessions } from "./db.js";

/**
 * In-memory session cache backed by SQLite. One session === one poster project:
 * its uploaded images, version snapshots, and chat history. The cache is warmed
 * from the DB on startup; every mutation is persisted via persist().
 */
const sessions = new Map<string, SessionState>();

for (const s of loadAllSessions()) {
  sessions.set(s.id, s);
}

/** Persist a session's current state. Call after any mutation. */
export function persist(session: SessionState): void {
  saveSession(session);
}

export function createSession(size: PosterSize): SessionState {
  const session: SessionState = {
    id: nanoid(),
    size,
    images: [],
    versions: [],
    messages: [],
  };
  sessions.set(session.id, session);
  persist(session);
  return session;
}

export function getSession(id: string): SessionState | undefined {
  return sessions.get(id);
}

export function addImage(sessionId: string, image: Omit<SessionImage, "placeholder">): SessionImage | undefined {
  const session = sessions.get(sessionId);
  if (!session) return undefined;
  const placeholder = `{{IMAGE_${session.images.length + 1}}}`;
  const full: SessionImage = { ...image, placeholder };
  session.images.push(full);
  persist(session);
  return full;
}

export function currentDesign(session: SessionState): string | undefined {
  return session.versions.at(-1)?.html;
}
