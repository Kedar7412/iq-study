/**
 * POST /api/auth/register
 *
 * Body: `{ email, password }`. Creates a new user (bcrypt-hashed password) in
 * the user store, opens a session cookie, and returns the public user record.
 * Fails with 409 if the email already exists. Keyless-friendly: no external
 * provider, sessions signed with `AUTH_SECRET` (dev fallback when unset).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import {
  generateUserId,
  getUserStore,
  normalizeEmail,
  type StoredUser,
} from "@/lib/store/users";
import { hashPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";

export const runtime = "nodejs";

const registerSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
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

  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const email = normalizeEmail(parsed.data.email);
  const store = getUserStore();

  if (await store.getByEmail(email)) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  const user: StoredUser = {
    id: generateUserId(),
    email,
    passwordHash: await hashPassword(parsed.data.password),
    createdAt: Date.now(),
  };
  await store.create(user);
  await createSessionCookie({ sub: user.id, email: user.email });

  return NextResponse.json(
    { user: { id: user.id, email: user.email }, hasProfile: false },
    { status: 201 },
  );
}
