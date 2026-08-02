import { nanoid } from "nanoid";
import type { SessionImage, SessionState, PosterSizeId } from "@poster/shared";

/**
 * In-memory session store (MVP). One session === one poster project:
 * its uploaded images, version snapshots, and chat history.
 * Swap this for SQLite in M4 for persistence across restarts.
 */
const sessions = new Map<string, SessionState>();

export function createSession(sizeId: PosterSizeId): SessionState {
  const session: SessionState = {
    id: nanoid(),
    sizeId,
    images: [],
    versions: [],
    messages: [],
  };
  sessions.set(session.id, session);
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
  return full;
}

export function currentDesign(session: SessionState): string | undefined {
  return session.versions.at(-1)?.html;
}
