// @vitest-environment node
/**
 * Route-handler tests for authentication and per-user book ownership.
 *
 * These guard the two BLOCKING issues from the semantic review:
 *   1. The ingestion/analysis endpoints (/api/upload, /api/analyze,
 *      /api/books/[bookId]) must reject unauthenticated callers with 401.
 *   2. Books are scoped to their owner, so a logged-in user can never read,
 *      analyze, or study another user's book by id (IDOR): the store returns
 *      undefined for a non-owner and the routes surface a 404.
 *
 * `getSession` is mocked so we can drive the "who is calling" dimension without
 * a real request cookie. The in-memory book store singleton is the real thing,
 * seeded directly, so ownership enforcement is exercised end to end.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionPayload } from "@/lib/auth/session";

// Mutable session the mock returns; individual tests set it.
let currentSession: SessionPayload | null = null;

vi.mock("@/lib/auth/session", () => ({
  getSession: async () => currentSession,
}));

import { getSession } from "@/lib/auth/session";
import { getBookStore, type StoredBook } from "@/lib/store";
import { POST as analyzePost } from "@/app/api/analyze/route";
import { GET as bookGet } from "@/app/api/books/[bookId]/route";
import { GET as studyNext } from "@/app/api/study/[bookId]/next/route";

void getSession; // referenced so the mocked import is not tree-shaken away.

const OWNER: SessionPayload = { sub: "user_owner", email: "owner@example.com" };
const OTHER: SessionPayload = { sub: "user_other", email: "other@example.com" };

function seedBook(bookId: string, userId: string): StoredBook {
  const book: StoredBook = {
    bookId,
    userId,
    meta: {
      filename: "notes.txt",
      kind: "txt",
      bytes: 10,
      characters: 10,
    },
    text: "photosynthesis and respiration",
    chunks: [{ index: 0, text: "photosynthesis and respiration" }],
    createdAt: Date.now(),
    analysis: {
      summary: "s",
      keyConcepts: [
        { concept: "photosynthesis", importance: 0.9, sourceChunkIndexes: [0] },
      ],
      topicOutline: ["photosynthesis"],
    },
    questions: [
      {
        id: "q1",
        question: "Define photosynthesis.",
        answer: "The process...",
        concept: "photosynthesis",
        questionType: "recall",
        probability: 0.9,
        rationale: "important",
      },
    ],
  };
  return book;
}

function jsonRequest(body: unknown): Request {
  return new Request("http://test/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  currentSession = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("GET /api/books/[bookId]", () => {
  it("returns 401 when unauthenticated", async () => {
    currentSession = null;
    const res = await bookGet(new Request("http://test/api/books/x"), {
      params: Promise.resolve({ bookId: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns the book to its owner", async () => {
    const bookId = "book_owned_1";
    await getBookStore().save(seedBook(bookId, OWNER.sub));
    currentSession = OWNER;
    const res = await bookGet(new Request("http://test"), {
      params: Promise.resolve({ bookId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.bookId).toBe(bookId);
  });

  it("returns 404 to a non-owner (IDOR protection)", async () => {
    const bookId = "book_owned_2";
    await getBookStore().save(seedBook(bookId, OWNER.sub));
    currentSession = OTHER;
    const res = await bookGet(new Request("http://test"), {
      params: Promise.resolve({ bookId }),
    });
    expect(res.status).toBe(404);
  });
});

describe("POST /api/analyze", () => {
  it("returns 401 when unauthenticated", async () => {
    currentSession = null;
    const res = await analyzePost(
      jsonRequest({ bookId: "x", curriculum: { topics: ["t"] } }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 404 when a non-owner tries to analyze another user's book", async () => {
    const bookId = "book_owned_3";
    await getBookStore().save(seedBook(bookId, OWNER.sub));
    currentSession = OTHER;
    const res = await analyzePost(
      jsonRequest({ bookId, curriculum: { topics: ["photosynthesis"] } }),
    );
    expect(res.status).toBe(404);
  });

  it("lets the owner analyze their own book", async () => {
    const bookId = "book_owned_4";
    await getBookStore().save(seedBook(bookId, OWNER.sub));
    currentSession = OWNER;
    const res = await analyzePost(
      jsonRequest({ bookId, curriculum: { topics: ["photosynthesis"] } }),
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.bookId).toBe(bookId);
    expect(Array.isArray(json.questions)).toBe(true);
  });
});

describe("GET /api/study/[bookId]/next", () => {
  it("returns 401 when unauthenticated", async () => {
    currentSession = null;
    const res = await studyNext(new Request("http://test"), {
      params: Promise.resolve({ bookId: "x" }),
    });
    expect(res.status).toBe(401);
  });

  it("returns 404 when a non-owner tries to study another user's book", async () => {
    const bookId = "book_owned_5";
    await getBookStore().save(seedBook(bookId, OWNER.sub));
    currentSession = OTHER;
    const res = await studyNext(new Request("http://test"), {
      params: Promise.resolve({ bookId }),
    });
    expect(res.status).toBe(404);
  });

  it("serves a due card to the owner", async () => {
    const bookId = "book_owned_6";
    await getBookStore().save(seedBook(bookId, OWNER.sub));
    currentSession = OWNER;
    const res = await studyNext(new Request("http://test"), {
      params: Promise.resolve({ bookId }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.totalCards).toBeGreaterThan(0);
  });
});
