/**
 * POST /api/auth/login
 *
 * Body: `{ email, password }`. Verifies the password against the stored bcrypt
 * hash, opens a session cookie, and returns the public user record plus whether
 * they already have a learning profile (so the client can route to onboarding).
 * Returns 401 on any credential mismatch (no user enumeration).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserStore, normalizeEmail } from "@/lib/store/users";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const store = getUserStore();
  const user = await store.getByEmail(email);

  const ok =
    user && (await verifyPassword(parsed.data.password, user.passwordHash));
  if (!user || !ok) {
    return NextResponse.json(
      { error: "Invalid email or password." },
      { status: 401 },
    );
  }

  await createSessionCookie({ sub: user.id, email: user.email });

  return NextResponse.json({
    user: { id: user.id, email: user.email },
    hasProfile: Boolean(user.learningProfile),
  });
}
