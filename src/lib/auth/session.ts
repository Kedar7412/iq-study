/**
 * Cookie-backed session helpers.
 *
 * A session is a compact JWT signed (HS256) with `AUTH_SECRET`, stored in an
 * httpOnly cookie. This keeps auth serverless-friendly (no session store) and
 * requires no external provider. The pure sign/verify logic lives in
 * {@link import("./token")}; this module wires it to Next.js request cookies.
 *
 * Keyless dev: when `AUTH_SECRET` is unset, tokens are signed with a documented
 * dev-only fallback secret so build/tests/dev work without configuration.
 * Production MUST set a strong `AUTH_SECRET` (see README + .env.example).
 */

import { cookies } from "next/headers";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE,
  signSession,
  verifySession,
  type SessionPayload,
} from "./token";

export {
  SESSION_COOKIE,
  signSession,
  verifySession,
  type SessionPayload,
} from "./token";

/** Write the session cookie for the given payload. */
export async function createSessionCookie(
  payload: SessionPayload,
): Promise<void> {
  const token = await signSession(payload);
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
}

/** Clear the session cookie (logout). */
export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}

/**
 * Read and verify the current session from the request cookies.
 * Returns the session payload, or `null` if there is no valid session.
 */
export async function getSession(): Promise<SessionPayload | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  return verifySession(token);
}
