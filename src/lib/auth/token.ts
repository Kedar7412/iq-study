/**
 * Pure session-token sign/verify helpers.
 *
 * Kept free of `next/headers` so they can be imported anywhere (route handlers,
 * middleware, unit tests) without pulling in request-scoped APIs. Cookie
 * read/write lives in {@link import("./session")}.
 *
 * Tokens are HS256 JWTs signed with `AUTH_SECRET` via `jose`. Keyless dev falls
 * back to a documented dev-only secret (see README/.env.example); production
 * MUST set a strong `AUTH_SECRET`.
 */

import { SignJWT, jwtVerify } from "jose";

/** Cookie name for the session token. */
export const SESSION_COOKIE = "iq_session";

/** Session lifetime in seconds (7 days). */
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7;

/**
 * Dev-only fallback secret. NEVER relied on in production: deployments must set
 * a real `AUTH_SECRET`. This exists only so keyless dev/CI works.
 */
export const DEV_FALLBACK_SECRET =
  "iq-study-dev-insecure-secret-do-not-use-in-production";

/** Claims embedded in a session token. */
export interface SessionPayload {
  /** User id. */
  sub: string;
  /** User email (convenience for nav display). */
  email: string;
}

function getSecretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET?.trim() || DEV_FALLBACK_SECRET;
  return new TextEncoder().encode(secret);
}

/** Sign a session token for the given payload. */
export async function signSession(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(getSecretKey());
}

/** Verify a session token, returning its payload or `null` if invalid. */
export async function verifySession(
  token: string,
): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getSecretKey());
    if (typeof payload.sub !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { sub: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
