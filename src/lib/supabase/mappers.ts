/**
 * Pure row <-> domain-object mappers for the Supabase-backed stores.
 *
 * These functions contain NO Supabase calls and NO I/O, so they are fully
 * unit-testable without a live database or any environment configuration. They
 * are the single source of truth for the camelCase (domain) <-> snake_case
 * (Postgres column) translation, and for the null-vs-undefined and
 * bigint-vs-number conventions used across the three tables:
 *
 * - DB `null` for an optional column maps to an ABSENT property on the domain
 *   object (the property is not set), never to `null`. When writing, an absent
 *   optional is sent as `null` so the column is cleared.
 * - `bigint` timestamp columns (`created_at`, `analyzed_at`) round-trip as
 *   JavaScript `number`s via `Number()`.
 */

import type { StoredUser } from "@/lib/store/users";
import type { StoredBook } from "@/lib/store/index";
import type { ReviewDeck, ReviewCard } from "@/lib/store/reviews";
import type { LearningProfile } from "@/lib/study/learningProfile";
import type { ParsedBookMeta } from "@/lib/ingest/parse";
import type { TextChunk } from "@/lib/ingest/chunk";
import type {
  BookAnalysis,
  Curriculum,
  ExamQuestion,
} from "@/lib/analyze/types";

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

/** Shape of a `public.users` row. */
export interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  learning_profile: LearningProfile | null;
  created_at: number;
}

/** Map a {@link StoredUser} domain object to a `users` row for writing. */
export function userToRow(user: StoredUser): UserRow {
  return {
    id: user.id,
    email: user.email,
    password_hash: user.passwordHash,
    learning_profile: user.learningProfile ?? null,
    created_at: user.createdAt,
  };
}

/** Map a `users` row to a {@link StoredUser} domain object. */
export function userFromRow(row: UserRow): StoredUser {
  const user: StoredUser = {
    id: row.id,
    email: row.email,
    passwordHash: row.password_hash,
    createdAt: Number(row.created_at),
  };
  if (row.learning_profile != null) {
    user.learningProfile = row.learning_profile;
  }
  return user;
}

/* -------------------------------------------------------------------------- */
/* Books                                                                      */
/* -------------------------------------------------------------------------- */

/** Shape of a `public.books` row. */
export interface BookRow {
  book_id: string;
  user_id: string;
  meta: ParsedBookMeta;
  text: string;
  chunks: TextChunk[];
  created_at: number;
  curriculum: Curriculum | null;
  analysis: BookAnalysis | null;
  questions: ExamQuestion[] | null;
  analyzed_at: number | null;
}

/** Map a {@link StoredBook} domain object to a `books` row for writing. */
export function bookToRow(book: StoredBook): BookRow {
  return {
    book_id: book.bookId,
    user_id: book.userId,
    meta: book.meta,
    text: book.text,
    chunks: book.chunks,
    created_at: book.createdAt,
    curriculum: book.curriculum ?? null,
    analysis: book.analysis ?? null,
    questions: book.questions ?? null,
    analyzed_at: book.analyzedAt ?? null,
  };
}

/** Map a `books` row to a {@link StoredBook} domain object. */
export function bookFromRow(row: BookRow): StoredBook {
  const book: StoredBook = {
    bookId: row.book_id,
    userId: row.user_id,
    meta: row.meta,
    text: row.text,
    chunks: row.chunks,
    createdAt: Number(row.created_at),
  };
  if (row.curriculum != null) book.curriculum = row.curriculum;
  if (row.analysis != null) book.analysis = row.analysis;
  if (row.questions != null) book.questions = row.questions;
  if (row.analyzed_at != null) book.analyzedAt = Number(row.analyzed_at);
  return book;
}

/* -------------------------------------------------------------------------- */
/* Review decks                                                               */
/* -------------------------------------------------------------------------- */

/** Shape of a `public.review_decks` row. */
export interface ReviewDeckRow {
  user_id: string;
  book_id: string;
  cards: ReviewCard[];
}

/** Map a {@link ReviewDeck} domain object to a `review_decks` row for writing. */
export function reviewDeckToRow(deck: ReviewDeck): ReviewDeckRow {
  return {
    user_id: deck.userId,
    book_id: deck.bookId,
    cards: deck.cards,
  };
}

/** Map a `review_decks` row to a {@link ReviewDeck} domain object. */
export function reviewDeckFromRow(row: ReviewDeckRow): ReviewDeck {
  return {
    userId: row.user_id,
    bookId: row.book_id,
    cards: row.cards ?? [],
  };
}
