/**
 * GET /api/books/[bookId]
 *
 * Returns the stored book's metadata plus its analysis + ranked questions (if
 * the analyze step has run). Used by the book results page.
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBookStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { bookId } = await params;
  // Scoped to the owner: another user's book (or a missing one) is a 404.
  const book = await getBookStore().get(bookId, session.sub);

  if (!book) {
    return NextResponse.json(
      { error: `No book found for id "${bookId}".` },
      { status: 404 },
    );
  }

  return NextResponse.json({
    bookId: book.bookId,
    meta: book.meta,
    chunkCount: book.chunks.length,
    curriculum: book.curriculum ?? null,
    analysis: book.analysis ?? null,
    questions: book.questions ?? [],
    analyzedAt: book.analyzedAt ?? null,
  });
}
