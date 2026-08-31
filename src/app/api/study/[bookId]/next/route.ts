/**
 * GET /api/study/[bookId]/next
 *
 * Returns the next DUE review card for the logged-in user's deck on this book,
 * plus an adaptive prompt tailored to their dominant learning style, along with
 * progress (overall + per-concept mastery). Returns `{ card: null }` when
 * nothing is due.
 *
 * Requires an authenticated session (401 otherwise) and a book that has been
 * analyzed into questions (404/409 otherwise).
 */

import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getBookStore } from "@/lib/store";
import { getUserStore } from "@/lib/store/users";
import { getReviewStore } from "@/lib/store/reviews";
import type { LearningProfile } from "@/lib/study/learningProfile";
import {
  buildDeck,
  conceptMastery,
  deckMastery,
  dueCards,
  orderCardsForProfile,
} from "@/lib/study/session";
import { adaptivePrompt, defaultProfile } from "@/lib/study/prompt";
import { buildConceptMap } from "@/lib/study/conceptMap";
import type { ExamQuestion } from "@/lib/analyze/types";

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
  const book = await getBookStore().get(bookId);
  if (!book) {
    return NextResponse.json(
      { error: `No book found for id "${bookId}".` },
      { status: 404 },
    );
  }

  const questions = book.questions ?? [];
  if (questions.length === 0) {
    return NextResponse.json(
      { error: "This book has no generated questions yet. Analyze it first." },
      { status: 409 },
    );
  }

  const user = await getUserStore().getById(session.sub);
  const profile: LearningProfile = user?.learningProfile ?? defaultProfile();

  const reviewStore = getReviewStore();
  const existing = await reviewStore.getDeck(session.sub, bookId);
  const now = Date.now();
  const deck = buildDeck(session.sub, bookId, questions, existing, now);
  await reviewStore.saveDeck(deck);

  const questionTypes: Record<string, ExamQuestion["questionType"]> = {};
  const questionById: Record<string, ExamQuestion> = {};
  for (const q of questions) {
    questionTypes[q.id] = q.questionType;
    questionById[q.id] = q;
  }

  const due = orderCardsForProfile(dueCards(deck, now), profile, questionTypes);
  const next = due[0] ?? null;
  const question = next ? questionById[next.questionId] : null;

  const masteryByConcept = conceptMastery(deck);
  const conceptGraph = book.analysis
    ? buildConceptMap(book.analysis, masteryByConcept, book.curriculum)
    : { nodes: [], edges: [] };

  return NextResponse.json({
    card:
      next && question
        ? {
            cardId: next.cardId,
            questionId: next.questionId,
            question: question.question,
            answer: question.answer,
            concept: question.concept,
            questionType: question.questionType,
            prompt: adaptivePrompt(profile, question),
          }
        : null,
    dueCount: due.length,
    totalCards: deck.cards.length,
    mastery: deckMastery(deck),
    conceptMastery: masteryByConcept,
    conceptGraph,
    dominantStyle: profile.dominantStyle,
  });
}
