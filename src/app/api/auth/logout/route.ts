/**
 * POST /api/auth/logout
 *
 * Clears the session cookie. Always succeeds (idempotent).
 */

import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

export async function POST(): Promise<NextResponse> {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
