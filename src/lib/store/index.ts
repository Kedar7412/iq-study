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

/** A fully ingested book record. */
export interface StoredBook {
  /** Generated unique identifier. */
  bookId: string;
  /** Source metadata. */
  meta: ParsedBookMeta;
  /** Full extracted text. */
  text: string;
  /** Deterministic overlapping chunks. */
  chunks: TextChunk[];
  /** Creation timestamp (epoch ms). */
  createdAt: number;
}

/** Storage abstraction for ingested books. */
export interface BookStore {
  save(book: StoredBook): Promise<void>;
  get(bookId: string): Promise<StoredBook | undefined>;
  list(): Promise<StoredBook[]>;
}

/** In-memory implementation backed by a Map. Dev/MVP only. */
class InMemoryBookStore implements BookStore {
  private readonly books = new Map<string, StoredBook>();

  async save(book: StoredBook): Promise<void> {
    this.books.set(book.bookId, book);
  }

  async get(bookId: string): Promise<StoredBook | undefined> {
    return this.books.get(bookId);
  }

  async list(): Promise<StoredBook[]> {
    return [...this.books.values()].sort((a, b) => b.createdAt - a.createdAt);
  }
}

// Module singleton. In dev this survives HMR via a global cache.
const globalForStore = globalThis as unknown as {
  __iqStudyBookStore?: BookStore;
};

const store: BookStore =
  globalForStore.__iqStudyBookStore ?? new InMemoryBookStore();

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
