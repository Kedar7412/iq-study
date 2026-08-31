/**
 * /api/onboarding
 *
 * POST: accepts questionnaire answers for the logged-in user, computes a
 * {@link LearningProfile} via the pure {@link scoreProfile}, and persists it to
 * the user's record.
 *
 * GET: returns the current user's learning profile, or `{ profile: null }` if
 * they have not completed onboarding yet.
 *
 * Both require a valid session (401 otherwise).
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getUserStore } from "@/lib/store/users";
import { answersSchema, scoreProfile } from "@/lib/study/learningProfile";

export const runtime = "nodejs";

const onboardingSchema = z.object({
  answers: answersSchema,
});

export async function GET(): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }
  const user = await getUserStore().getById(session.sub);
  return NextResponse.json({ profile: user?.learningProfile ?? null });
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  let profile;
  try {
    profile = scoreProfile(parsed.data.answers);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid answers." },
      { status: 400 },
    );
  }

  const updated = await getUserStore().saveProfile(session.sub, profile);
  if (!updated) {
    return NextResponse.json({ error: "User not found." }, { status: 404 });
  }

  return NextResponse.json({ profile });
}
