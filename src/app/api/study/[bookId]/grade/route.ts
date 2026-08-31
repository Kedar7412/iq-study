/**
 * POST /api/study/[bookId]/grade
 *
 * Body: { cardId: string, grade: 0-5 }. Applies the SM-2 scheduler (adjusted by
 * the learner's profile) to the graded card, persists the updated deck, and
 * returns the next due card plus refreshed mastery.
 *
 * Requires an authenticated session (401) and an existing deck / valid card
 * (404 otherwise). Validated with zod.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
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
  gradeCard,
  orderCardsForProfile,
} from "@/lib/study/session";
import { adaptivePrompt, defaultProfile } from "@/lib/study/prompt";
import type { RecallGrade } from "@/lib/study/scheduler";
import type { ExamQuestion } from "@/lib/analyze/types";

export const runtime = "nodejs";

const gradeSchema = z.object({
  cardId: z.string().min(1),
  grade: z.number().int().min(0).max(5),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ bookId: string }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const { bookId } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const parsed = gradeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid request." },
      { status: 400 },
    );
  }

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
      { error: "This book has no generated questions yet." },
      { status: 409 },
    );
  }

  const user = await getUserStore().getById(session.sub);
  const profile: LearningProfile = user?.learningProfile ?? defaultProfile();

  const reviewStore = getReviewStore();
  const now = Date.now();
  const existing = await reviewStore.getDeck(session.sub, bookId);
  // Reconcile with current questions so the deck is always coherent.
  const deck = buildDeck(session.sub, bookId, questions, existing, now);

  const index = deck.cards.findIndex((c) => c.cardId === parsed.data.cardId);
  if (index === -1) {
    return NextResponse.json(
      { error: `No card found for id "${parsed.data.cardId}".` },
      { status: 404 },
    );
  }

  const updatedCard = gradeCard(
    deck.cards[index],
    parsed.data.grade as RecallGrade,
    profile,
    now,
  );
  const cards = [...deck.cards];
  cards[index] = updatedCard;
  const updatedDeck = { ...deck, cards };
  await reviewStore.saveDeck(updatedDeck);

  const questionTypes: Record<string, ExamQuestion["questionType"]> = {};
  const questionById: Record<string, ExamQuestion> = {};
  for (const q of questions) {
    questionTypes[q.id] = q.questionType;
    questionById[q.id] = q;
  }

  const due = orderCardsForProfile(
    dueCards(updatedDeck, now),
    profile,
    questionTypes,
  );
  const next = due[0] ?? null;
  const nextQuestion = next ? questionById[next.questionId] : null;

  return NextResponse.json({
    graded: {
      cardId: updatedCard.cardId,
      concept: updatedCard.concept,
      mastery: updatedCard.mastery,
      interval: updatedCard.interval,
      repetitions: updatedCard.repetitions,
      dueDate: updatedCard.dueDate,
    },
    card:
      next && nextQuestion
        ? {
            cardId: next.cardId,
            questionId: next.questionId,
            question: nextQuestion.question,
            answer: nextQuestion.answer,
            concept: nextQuestion.concept,
            questionType: nextQuestion.questionType,
            prompt: adaptivePrompt(profile, nextQuestion),
          }
        : null,
    dueCount: due.length,
    totalCards: updatedDeck.cards.length,
    mastery: deckMastery(updatedDeck),
    conceptMastery: conceptMastery(updatedDeck),
  });
}
