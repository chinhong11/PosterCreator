import crypto from "node:crypto";
import type { RequestHandler } from "express";

// A single shared password gates the app when APP_PASSWORD is set. Unset =>
// auth disabled (local development). This is a personal-deploy gate, not
// multi-user accounts: everyone who knows the password shares the same posters.
const PASSWORD = process.env.APP_PASSWORD || "";
export const authRequired = PASSWORD.length > 0;

const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

function sign(exp: number): string {
  return crypto.createHmac("sha256", PASSWORD).update(String(exp)).digest("hex");
}

/** Issue a signed, expiring bearer token after a correct password. */
export function issueToken(): string {
  const exp = Date.now() + TTL_MS;
  return `${exp}.${sign(exp)}`;
}

/** Verify a bearer token's signature and expiry (constant-time). */
export function verifyToken(token: string | undefined): boolean {
  if (!authRequired) return true;
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot === -1) return false;
  const exp = Number(token.slice(0, dot));
  const mac = token.slice(dot + 1);
  if (!Number.isFinite(exp) || exp < Date.now() || mac.length !== 64) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(sign(exp), "hex"));
  } catch {
    return false;
  }
}

/** Constant-time password check. */
export function checkPassword(pw: string): boolean {
  if (!authRequired) return true;
  const a = Buffer.from(pw || "");
  const b = Buffer.from(PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Paths that bypass auth: health/config/login, and assets the preview iframe
// loads without an Authorization header (fonts + uploaded images).
const PUBLIC_API = new Set(["/api/health", "/api/config", "/api/login", "/api/fonts.css"]);

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!authRequired) return next();
  // Only gate the JSON API; /assets/* (non-/api) stays public for the iframe.
  if (!req.path.startsWith("/api/")) return next();
  if (PUBLIC_API.has(req.path)) return next();
  const token = (req.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (verifyToken(token)) return next();
  res.status(401).json({ error: "Unauthorized" });
};
