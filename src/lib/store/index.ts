/**
 * Persistence layer for ingested books.
 *
 * Kept behind a small {@link BookStore} interface so the backing store can be
 * swapped later (SQLite, Postgres, Redis, etc.) without touching callers.
 *
 * The default implementation is an in-memory module singleton. This is fine for
 * MVP and local dev, but note the limitation: on Vercel's serverless runtime
 * each invocation may run in a fresh isolate, so data written by one request is
 * NOT guaranteed to be visible to another. Swap in a durable store before
 * relying on cross-request persistence in production.
 */

import type { ParsedBookMeta } from "@/lib/ingest/parse";
import type { TextChunk } from "@/lib/ingest/chunk";
import type {
  BookAnalysis,
  Curriculum,
  ExamQuestion,
} from "@/lib/analyze/types";
import { getSupabaseAdmin, isSupabaseConfigured } from "@/lib/supabase/server";
import { bookFromRow, bookToRow } from "@/lib/supabase/mappers";

/** A fully ingested book record. */
export interface StoredBook {
  /** Generated unique identifier. */
  bookId: string;
  /**
   * Id of the user who uploaded (and therefore owns) this book. Set at upload
   * time from the session. Every read/analyze/study path must verify the
   * requesting user matches this owner, so one learner can never reach another
   * learner's book by id (tenant isolation / IDOR protection).
   */
  userId: string;
  /** Source metadata. */
  meta: ParsedBookMeta;
  /** Full extracted text. */
  text: string;
  /** Deterministic overlapping chunks. */
  chunks: TextChunk[];
  /** Creation timestamp (epoch ms). */
  createdAt: number;
  /** Curriculum the learner supplied for this book (set during analysis). */
  curriculum?: Curriculum;
  /** Structured analysis produced by the analyze step. */
  analysis?: BookAnalysis;
  /** Ranked exam questions produced from the analysis. */
  questions?: ExamQuestion[];
  /** Timestamp of the most recent analysis (epoch ms). */
  analyzedAt?: number;
}

/** Fields written when persisting an analysis result for a book. */
export interface AnalysisResult {
  curriculum: Curriculum;
  analysis: BookAnalysis;
  questions: ExamQuestion[];
}

/** Storage abstraction for ingested books. */
export interface BookStore {
  save(book: StoredBook): Promise<void>;
  /**
   * Fetch a book by id, scoped to its owner. Returns the record only when it
   * exists AND `userId` matches the stored owner; otherwise `undefined`. This
   * makes ownership enforcement the store's responsibility so callers can never
   * accidentally leak another user's book.
   */
  get(bookId: string, userId: string): Promise<StoredBook | undefined>;
  /** List the books owned by `userId`, most recent first. */
  list(userId: string): Promise<StoredBook[]>;
  /**
   * Attach analysis output to an existing book owned by `userId`. Returns the
   * updated record, or `undefined` if no matching owned book exists.
   */
  saveAnalysis(
    bookId: string,
    userId: string,
    result: AnalysisResult,
  ): Promise<StoredBook | undefined>;
}

/** In-memory implementation backed by a Map. Dev/MVP only. */
class InMemoryBookStore implements BookStore {
  private readonly books = new Map<string, StoredBook>();

  async save(book: StoredBook): Promise<void> {
    this.books.set(book.bookId, book);
  }

  async get(bookId: string, userId: string): Promise<StoredBook | undefined> {
    const book = this.books.get(bookId);
    if (!book || book.userId !== userId) return undefined;
    return book;
  }

  async list(userId: string): Promise<StoredBook[]> {
    return [...this.books.values()]
      .filter((b) => b.userId === userId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  async saveAnalysis(
    bookId: string,
    userId: string,
    result: AnalysisResult,
  ): Promise<StoredBook | undefined> {
    const existing = this.books.get(bookId);
    if (!existing || existing.userId !== userId) return undefined;
    const updated: StoredBook = {
      ...existing,
      curriculum: result.curriculum,
      analysis: result.analysis,
      questions: result.questions,
      analyzedAt: Date.now(),
    };
    this.books.set(bookId, updated);
    return updated;
  }
}

/** Durable Supabase-backed implementation (service_role, bypasses RLS). */
class SupabaseBookStore implements BookStore {
  async save(book: StoredBook): Promise<void> {
    const { error } = await getSupabaseAdmin()
      .from("books")
      .upsert(bookToRow(book), { onConflict: "book_id" });
    if (error) throw new Error(`Failed to save book: ${error.message}`);
  }

  async get(bookId: string, userId: string): Promise<StoredBook | undefined> {
    const { data, error } = await getSupabaseAdmin()
      .from("books")
      .select("*")
      .eq("book_id", bookId)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) throw new Error(`Failed to load book: ${error.message}`);
    return data ? bookFromRow(data) : undefined;
  }

  async list(userId: string): Promise<StoredBook[]> {
    const { data, error } = await getSupabaseAdmin()
      .from("books")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(`Failed to list books: ${error.message}`);
    return (data ?? []).map(bookFromRow);
  }

  async saveAnalysis(
    bookId: string,
    userId: string,
    result: AnalysisResult,
  ): Promise<StoredBook | undefined> {
    const { data, error } = await getSupabaseAdmin()
      .from("books")
      .update({
        curriculum: result.curriculum,
        analysis: result.analysis,
        questions: result.questions,
        analyzed_at: Date.now(),
      })
      .eq("book_id", bookId)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(`Failed to save analysis: ${error.message}`);
    return data ? bookFromRow(data) : undefined;
  }
}

// Module singleton. In dev this survives HMR via a global cache.
const globalForStore = globalThis as unknown as {
  __iqStudyBookStore?: BookStore;
};

const store: BookStore =
  globalForStore.__iqStudyBookStore ??
  (isSupabaseConfigured() ? new SupabaseBookStore() : new InMemoryBookStore());

if (process.env.NODE_ENV !== "production") {
  globalForStore.__iqStudyBookStore = store;
}

/** Return the process-wide book store instance. */
export function getBookStore(): BookStore {
  return store;
}

/** Generate a URL-safe unique book identifier. */
export function generateBookId(): string {
  return `book_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
