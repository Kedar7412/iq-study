/**
 * Pure-function tests for the Supabase row <-> domain-object mappers.
 *
 * These tests run KEYLESS: they import only the pure mapper module and never
 * touch Supabase, the network, or any environment variable. They lock in the
 * three conventions the DB stores depend on:
 *  - object -> row -> object round-trips losslessly,
 *  - a DB `null` optional column maps to an ABSENT (undefined) property, not a
 *    fabricated value,
 *  - `bigint` timestamp columns round-trip as JS `number`s,
 *  - camelCase keys land in the correct snake_case columns.
 */

import { describe, it, expect } from "vitest";

import {
  userToRow,
  userFromRow,
  bookToRow,
  bookFromRow,
  reviewDeckToRow,
  reviewDeckFromRow,
  type UserRow,
  type BookRow,
  type ReviewDeckRow,
} from "@/lib/supabase/mappers";
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

const learningProfile: LearningProfile = {
  primaryStyle: "visual",
  scores: { visual: 3, auditory: 1, readingWriting: 2, kinesthetic: 0 },
  pace: "steady",
  reviewIntervalDays: 3,
} as unknown as LearningProfile;

const meta: ParsedBookMeta = {
  filename: "book.pdf",
  kind: "pdf",
  bytes: 1234,
  characters: 5678,
  pages: 12,
};

const chunks: TextChunk[] = [
  { index: 0, text: "first" },
  { index: 1, text: "second" },
];

const curriculum: Curriculum = { topics: ["algebra", "geometry"] };

const analysis: BookAnalysis = {
  summary: "A short summary.",
  keyConcepts: [{ concept: "limits", importance: 0.9, sourceChunkIndexes: [0] }],
  topicOutline: ["intro", "body"],
};

const questions: ExamQuestion[] = [
  {
    id: "q1",
    question: "What is a limit?",
    answer: "A value a function approaches.",
    concept: "limits",
    questionType: "conceptual",
    probability: 0.8,
    rationale: "Central to the syllabus.",
  },
];

const cards: ReviewCard[] = [
  {
    cardId: "c1",
    questionId: "q1",
    concept: "limits",
    easeFactor: 2.5,
    interval: 1,
    repetitions: 0,
    lastGrade: null,
    dueDate: 1_700_000_000_000,
    reviewCount: 0,
    mastery: 0,
  },
];

describe("user mappers", () => {
  it("round-trips a fully populated user", () => {
    const user: StoredUser = {
      id: "user_abc",
      email: "learner@example.com",
      passwordHash: "$2b$hash",
      learningProfile,
      createdAt: 1_700_000_000_000,
    };
    expect(userFromRow(userToRow(user))).toEqual(user);
  });

  it("maps camelCase keys to the correct snake_case columns", () => {
    const row = userToRow({
      id: "user_abc",
      email: "learner@example.com",
      passwordHash: "$2b$hash",
      createdAt: 1,
    });
    expect(row).toMatchObject({
      id: "user_abc",
      email: "learner@example.com",
      password_hash: "$2b$hash",
      created_at: 1,
    });
    expect(row).not.toHaveProperty("passwordHash");
    expect(row).not.toHaveProperty("createdAt");
  });

  it("writes absent learningProfile as null", () => {
    const row = userToRow({
      id: "u",
      email: "e@e.com",
      passwordHash: "h",
      createdAt: 1,
    });
    expect(row.learning_profile).toBeNull();
  });

  it("maps a null learning_profile column to an absent property", () => {
    const row: UserRow = {
      id: "u",
      email: "e@e.com",
      password_hash: "h",
      learning_profile: null,
      created_at: 1,
    };
    const user = userFromRow(row);
    expect(user).not.toHaveProperty("learningProfile");
    expect(user.learningProfile).toBeUndefined();
  });

  it("round-trips a bigint created_at as a number", () => {
    const row: UserRow = {
      id: "u",
      email: "e@e.com",
      password_hash: "h",
      learning_profile: null,
      // Simulate the string-ish bigint some drivers return.
      created_at: Number("1700000000000"),
    };
    const user = userFromRow(row);
    expect(typeof user.createdAt).toBe("number");
    expect(user.createdAt).toBe(1_700_000_000_000);
  });
});

describe("book mappers", () => {
  it("round-trips a fully populated (analyzed) book", () => {
    const book: StoredBook = {
      bookId: "book_abc",
      userId: "user_abc",
      meta,
      text: "full text",
      chunks,
      createdAt: 1_700_000_000_000,
      curriculum,
      analysis,
      questions,
      analyzedAt: 1_700_000_500_000,
    };
    expect(bookFromRow(bookToRow(book))).toEqual(book);
  });

  it("round-trips a not-yet-analyzed book with optionals absent", () => {
    const book: StoredBook = {
      bookId: "book_abc",
      userId: "user_abc",
      meta,
      text: "full text",
      chunks,
      createdAt: 1_700_000_000_000,
    };
    const back = bookFromRow(bookToRow(book));
    expect(back).toEqual(book);
    expect(back).not.toHaveProperty("curriculum");
    expect(back).not.toHaveProperty("analysis");
    expect(back).not.toHaveProperty("questions");
    expect(back).not.toHaveProperty("analyzedAt");
  });

  it("maps camelCase keys to the correct snake_case columns", () => {
    const row = bookToRow({
      bookId: "book_abc",
      userId: "user_abc",
      meta,
      text: "t",
      chunks,
      createdAt: 1,
    });
    expect(row).toMatchObject({ book_id: "book_abc", user_id: "user_abc" });
    expect(row).not.toHaveProperty("bookId");
    expect(row).not.toHaveProperty("userId");
    expect(row).not.toHaveProperty("analyzedAt");
  });

  it("writes absent optionals as null", () => {
    const row = bookToRow({
      bookId: "b",
      userId: "u",
      meta,
      text: "t",
      chunks,
      createdAt: 1,
    });
    expect(row.curriculum).toBeNull();
    expect(row.analysis).toBeNull();
    expect(row.questions).toBeNull();
    expect(row.analyzed_at).toBeNull();
  });

  it("maps null optional columns to absent properties", () => {
    const row: BookRow = {
      book_id: "b",
      user_id: "u",
      meta,
      text: "t",
      chunks,
      created_at: 1,
      curriculum: null,
      analysis: null,
      questions: null,
      analyzed_at: null,
    };
    const book = bookFromRow(row);
    expect(book.curriculum).toBeUndefined();
    expect(book.analysis).toBeUndefined();
    expect(book.questions).toBeUndefined();
    expect(book.analyzedAt).toBeUndefined();
    expect(book).not.toHaveProperty("analyzedAt");
  });

  it("round-trips bigint timestamps as numbers", () => {
    const row: BookRow = {
      book_id: "b",
      user_id: "u",
      meta,
      text: "t",
      chunks,
      created_at: Number("1700000000000"),
      curriculum: null,
      analysis: null,
      questions: null,
      analyzed_at: Number("1700000500000"),
    };
    const book = bookFromRow(row);
    expect(typeof book.createdAt).toBe("number");
    expect(typeof book.analyzedAt).toBe("number");
    expect(book.createdAt).toBe(1_700_000_000_000);
    expect(book.analyzedAt).toBe(1_700_000_500_000);
  });
});

describe("review deck mappers", () => {
  it("round-trips a deck with cards", () => {
    const deck: ReviewDeck = { userId: "user_abc", bookId: "book_abc", cards };
    expect(reviewDeckFromRow(reviewDeckToRow(deck))).toEqual(deck);
  });

  it("maps camelCase keys to the correct snake_case columns", () => {
    const row = reviewDeckToRow({
      userId: "user_abc",
      bookId: "book_abc",
      cards: [],
    });
    expect(row).toMatchObject({ user_id: "user_abc", book_id: "book_abc" });
    expect(row).not.toHaveProperty("userId");
    expect(row).not.toHaveProperty("bookId");
  });

  it("defaults a null cards column to an empty array", () => {
    const row = {
      user_id: "u",
      book_id: "b",
      cards: null,
    } as unknown as ReviewDeckRow;
    expect(reviewDeckFromRow(row).cards).toEqual([]);
  });
});
