/**
 * GET /api/auth/me
 *
 * Returns the current session's public user record plus whether they have a
 * learning profile, or `{ user: null }` when unauthenticated.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getUserStore } from "@/lib/store/users";

export const runtime = "nodejs";

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ user: null });
  }
  const user = await getUserStore().getById(session.sub);
  return NextResponse.json({
    user: { id: session.sub, email: session.email },
    hasProfile: Boolean(user?.learningProfile),
  });
}
