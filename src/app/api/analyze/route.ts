/**
 * POST /api/analyze
 *
 * Body: `{ bookId, curriculum, count? }`. Loads the stored book, runs
 * {@link analyzeBook} (map/reduce over its chunks) then
 * {@link generateQuestions}, persists both to the store, and returns
 * `{ bookId, analysis, questions }`.
 *
 * Works fully keyless via the MockProvider. Input is validated with zod.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/auth/session";
import { getLLMProvider } from "@/lib/llm";
import { getBookStore } from "@/lib/store";
import { analyzeBook } from "@/lib/analyze/analyzeBook";
import { generateQuestions } from "@/lib/analyze/generateQuestions";
import { curriculumSchema } from "@/lib/analyze/types";

// PDF-free here, but keep the Node runtime for parity with the rest of the API.
export const runtime = "nodejs";

const analyzeSchema = z.object({
  bookId: z.string().min(1, "bookId is required."),
  curriculum: curriculumSchema,
  /** Number of questions to generate. Default 10, capped at 50. */
  count: z.number().int().min(1).max(50).optional(),
});

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

  const parsed = analyzeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

  const { bookId, curriculum, count } = parsed.data;
  const store = getBookStore();
  // Ownership is enforced by the store: a book owned by another user resolves
  // to undefined, so a non-owner gets the same 404 as a missing book.
  const book = await store.get(bookId, session.sub);
  if (!book) {
    return NextResponse.json(
      { error: `No book found for id "${bookId}".` },
      { status: 404 },
    );
  }

  try {
    const provider = getLLMProvider();
    const analysis = await analyzeBook(book.chunks, provider, { curriculum });
    const questions = await generateQuestions(analysis, provider, {
      curriculum,
      count,
    });

    await store.saveAnalysis(bookId, session.sub, {
      curriculum,
      analysis,
      questions,
    });

    return NextResponse.json({ bookId, analysis, questions });
  } catch {
    return NextResponse.json(
      { error: "Failed to analyze the book." },
      { status: 500 },
    );
  }
}
