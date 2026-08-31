/**
 * Route gating proxy (Next.js 16 successor to `middleware`).
 *
 * Redirects unauthenticated users away from protected pages
 * (/upload, /books, /onboarding, /study) to /login. Authentication is a signed
 * session JWT in the `iq_session` cookie, verified here with the pure
 * {@link verifySession} helper (backed by `jose`, which runs on the Edge
 * runtime). The token module is edge-safe: it never imports `next/headers`.
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/token";

/** Path prefixes that require a valid session. */
const PROTECTED_PREFIXES = ["/upload", "/books", "/onboarding", "/study"];

async function hasValidSession(request: NextRequest): Promise<boolean> {
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return false;
  return (await verifySession(token)) !== null;
}

export default async function proxy(
  request: NextRequest,
): Promise<NextResponse> {
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  if (!isProtected) {
    return NextResponse.next();
  }

  if (await hasValidSession(request)) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: [
    "/upload/:path*",
    "/books/:path*",
    "/onboarding/:path*",
    "/study/:path*",
  ],
};
