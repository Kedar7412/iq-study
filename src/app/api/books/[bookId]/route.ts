/**
 * GET /api/books/[bookId]
 *
 * Returns the stored book's metadata plus its analysis + ranked questions (if
 * the analyze step has run). Used by the book results page.
 */

import { NextResponse } from "next/server";
import { getBookStore } from "@/lib/store";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ bookId: string }> },
): Promise<NextResponse> {
  const { bookId } = await params;
  const book = await getBookStore().get(bookId);

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
