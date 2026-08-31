/**
 * Persistence layer for spaced-repetition review state.
 *
 * Mirrors the {@link import("./index").BookStore} pattern: a small
 * {@link ReviewStore} interface backed by an in-memory module singleton with a
 * globalThis cache so it survives HMR in dev.
 *
 * Review state is keyed per (userId, bookId): a learner reviewing the same book
 * keeps a persistent deck of {@link ReviewCard}s, one per generated exam
 * question. Each card carries its SM-2 state plus a derived mastery level and
 * the concept it targets, so the study loop can track progress and colour the
 * concept map.
 *
 * The same serverless caveat applies as the book/user stores: on Vercel each
 * invocation may run in a fresh isolate, so an in-memory store is fine for
 * MVP/dev but must be swapped for a durable store (SQLite/Postgres/Redis)
 * before relying on cross-request persistence in production.
 */

import type { RecallGrade } from "@/lib/study/scheduler";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { reviewDeckFromRow, reviewDeckToRow } from "@/lib/supabase/mappers";

/** A single review card: one generated question with its SM-2 state. */
export interface ReviewCard {
  /** Stable identifier (derived from the source question id). */
  cardId: string;
  /** Source exam-question id. */
  questionId: string;
  /** The concept this card targets. */
  concept: string;
  /** SM-2 ease factor. */
  easeFactor: number;
  /** Current inter-review interval in days. */
  interval: number;
  /** Consecutive successful (grade >= 3) reviews. */
  repetitions: number;
  /** Most recent recall grade, or null if never reviewed. */
  lastGrade: RecallGrade | null;
  /** Epoch ms when the card is next due for review. */
  dueDate: number;
  /** Number of times the card has been reviewed. */
  reviewCount: number;
  /** Derived mastery in [0, 1] (see {@link import("@/lib/study/session")}). */
  mastery: number;
}

/** A per-(user, book) review deck. */
export interface ReviewDeck {
  userId: string;
  bookId: string;
  cards: ReviewCard[];
}

/** Storage abstraction for review decks. */
export interface ReviewStore {
  /** Return the deck for a (user, book), or `undefined` if none exists yet. */
  getDeck(userId: string, bookId: string): Promise<ReviewDeck | undefined>;
  /** Create or replace the deck for a (user, book). */
  saveDeck(deck: ReviewDeck): Promise<void>;
}

function deckKey(userId: string, bookId: string): string {
  return `${userId}::${bookId}`;
}

/** In-memory implementation backed by a Map. Dev/MVP only. */
class InMemoryReviewStore implements ReviewStore {
  private readonly decks = new Map<string, ReviewDeck>();

  async getDeck(
    userId: string,
    bookId: string,
  ): Promise<ReviewDeck | undefined> {
    return this.decks.get(deckKey(userId, bookId));
  }

  async saveDeck(deck: ReviewDeck): Promise<void> {
    this.decks.set(deckKey(deck.userId, deck.bookId), deck);
  }
}

/** Durable Supabase-backed implementation (service_role, bypasses RLS). */
class SupabaseReviewStore implements ReviewStore {
  async getDeck(
    userId: string,
    bookId: string,
  ): Promise<ReviewDeck | undefined> {
    const { data, error } = await getSupabaseAdmin()
      .from("review_decks")
      .select("*")
      .eq("user_id", userId)
      .eq("book_id", bookId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load review deck: ${error.message}`);
    return data ? reviewDeckFromRow(data) : undefined;
  }

  async saveDeck(deck: ReviewDeck): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("review_decks")
      .upsert(reviewDeckToRow(deck), { onConflict: "user_id,book_id" });
    if (error) throw new Error(`Failed to save review deck: ${error.message}`);
  }
}

// Module singleton. In dev this survives HMR via a global cache.
const globalForReviewStore = globalThis as unknown as {
  __iqStudyReviewStore?: ReviewStore;
};

const store: ReviewStore =
  globalForReviewStore.__iqStudyReviewStore ??
  (isSupabaseConfigured()
    ? new SupabaseReviewStore()
    : new InMemoryReviewStore());

if (process.env.NODE_ENV !== "production") {
  globalForReviewStore.__iqStudyReviewStore = store;
}

/** Return the process-wide review store instance. */
export function getReviewStore(): ReviewStore {
  return store;
}
