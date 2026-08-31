/**
 * Adaptive study-session engine.
 *
 * Bridges the pure SM-2 scheduler ({@link import("./scheduler")}) and the
 * persisted review deck ({@link import("@/lib/store/reviews")}) with the
 * learner's {@link LearningProfile}. Responsibilities:
 *
 * - Build a deck from a book's generated {@link ExamQuestion}s (one card each),
 *   preserving any existing SM-2 state when new questions are added.
 * - Select the cards that are currently DUE (dueDate <= now).
 * - ORDER due cards adaptively: high kinesthetic / application-oriented learners
 *   see conceptual + application prompts first; everyone sees the least-mastered
 *   cards earlier. Ordering is deterministic.
 * - Apply a review-interval multiplier derived from
 *   `profile.preferredReviewInterval` when scheduling, so learners who prefer
 *   frequent review get shorter intervals and vice-versa.
 * - Track per-concept mastery aggregated from card state.
 *
 * The functions here are pure with respect to their inputs (they take a deck +
 * questions + profile and return new values); persistence is the caller's job.
 */

import type { ExamQuestion } from "@/lib/analyze/types";
import type { LearningProfile } from "@/lib/study/learningProfile";
import type { ReviewCard, ReviewDeck } from "@/lib/store/reviews";
import {
  DEFAULT_EASE_FACTOR,
  scheduleReview,
  type RecallGrade,
} from "@/lib/study/scheduler";

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Baseline review interval (days) the profile multiplier is measured against. */
const BASELINE_INTERVAL_DAYS = 7;

/**
 * Derive a scheduling multiplier from the learner's preferred review interval.
 *
 * A learner who wants to review every ~2 days gets intervals compressed to
 * ~0.3x; one who prefers ~14-day cadence gets ~2x. Clamped to a sane range so a
 * single card never balloons or collapses unreasonably.
 */
export function intervalMultiplier(profile: LearningProfile): number {
  const raw = profile.preferredReviewInterval / BASELINE_INTERVAL_DAYS;
  return clamp(raw, 0.25, 2.5);
}

/**
 * Mastery for a single card in [0, 1].
 *
 * Combines the SM-2 repetition streak (progress toward "known") with the most
 * recent grade. A never-reviewed card is 0; a card with several successful
 * repetitions and a high last grade approaches 1. A failed last grade caps
 * mastery low regardless of past streak.
 */
export function cardMastery(card: {
  repetitions: number;
  lastGrade: RecallGrade | null;
  reviewCount: number;
}): number {
  if (card.reviewCount === 0 || card.lastGrade === null) return 0;
  if (card.lastGrade < 3) {
    // A recent failure: mastery reflects only partial recall.
    return round3(clamp((card.lastGrade / 5) * 0.3, 0, 0.3));
  }
  // Streak component saturates around 4 successful repetitions.
  const streak = clamp(card.repetitions / 4, 0, 1);
  const gradeComponent = card.lastGrade / 5;
  return round3(clamp(0.4 * gradeComponent + 0.6 * streak, 0, 1));
}

/** A fresh, immediately-due card for a question that has no prior state. */
function newCard(question: ExamQuestion, now: number): ReviewCard {
  return {
    cardId: `card_${question.id}`,
    questionId: question.id,
    concept: question.concept,
    easeFactor: DEFAULT_EASE_FACTOR,
    interval: 0,
    repetitions: 0,
    lastGrade: null,
    dueDate: now, // brand-new cards are due immediately
    reviewCount: 0,
    mastery: 0,
  };
}

/**
 * Reconcile a deck with the current set of generated questions.
 *
 * Existing cards keep their SM-2 state; questions without a card get a fresh,
 * due-now card; cards whose question no longer exists are dropped. Returns a new
 * deck (does not mutate the input).
 */
export function buildDeck(
  userId: string,
  bookId: string,
  questions: ExamQuestion[],
  existing: ReviewDeck | undefined,
  now: number = Date.now(),
): ReviewDeck {
  const byQuestion = new Map<string, ReviewCard>();
  for (const card of existing?.cards ?? []) {
    byQuestion.set(card.questionId, card);
  }

  const cards: ReviewCard[] = questions.map((q) => {
    const prior = byQuestion.get(q.id);
    if (!prior) return newCard(q, now);
    // Keep SM-2 state but refresh the concept label in case it changed.
    return { ...prior, concept: q.concept };
  });

  return { userId, bookId, cards };
}

/** Cards whose dueDate is at or before `now`. */
export function dueCards(
  deck: ReviewDeck,
  now: number = Date.now(),
): ReviewCard[] {
  return deck.cards.filter((c) => c.dueDate <= now);
}

/**
 * Order due cards adaptively for a learner.
 *
 * Kinesthetic / application-oriented learners (high kinesthetic score or a
 * kinesthetic dominant style) see conceptual and application questions first,
 * since those "push the brain" and suit hands-on cognition. All learners then
 * see their least-mastered cards earlier so weak spots surface sooner. Ties
 * break on questionId for determinism.
 *
 * @param cards Candidate due cards.
 * @param profile Learner profile driving the ordering.
 * @param questionTypes Map from questionId to its {@link ExamQuestion.questionType}.
 */
export function orderCardsForProfile(
  cards: ReviewCard[],
  profile: LearningProfile,
  questionTypes: Record<string, ExamQuestion["questionType"]>,
): ReviewCard[] {
  const prefersApplication =
    profile.dominantStyle === "kinesthetic" || profile.kinesthetic >= 0.4;

  const typeRank = (id: string): number => {
    if (!prefersApplication) return 0;
    const type = questionTypes[id];
    // Lower rank sorts earlier: conceptual + application before recall.
    if (type === "conceptual") return 0;
    if (type === "application") return 1;
    return 2;
  };

  return [...cards].sort((a, b) => {
    const rankDiff = typeRank(a.questionId) - typeRank(b.questionId);
    if (rankDiff !== 0) return rankDiff;
    // Least-mastered first.
    const masteryDiff = a.mastery - b.mastery;
    if (masteryDiff !== 0) return masteryDiff;
    return a.questionId.localeCompare(b.questionId);
  });
}

/**
 * Grade a card and return the updated card.
 *
 * Runs the SM-2 scheduler, applies the profile-derived interval multiplier to
 * the resulting interval/dueDate, and recomputes mastery. Returns a new card;
 * does not mutate the input.
 */
export function gradeCard(
  card: ReviewCard,
  grade: RecallGrade,
  profile: LearningProfile,
  now: number = Date.now(),
): ReviewCard {
  const result = scheduleReview(
    {
      easeFactor: card.easeFactor,
      interval: card.interval,
      repetitions: card.repetitions,
    },
    grade,
    now,
  );

  const multiplier = intervalMultiplier(profile);
  const adjustedInterval = Math.max(1, Math.round(result.interval * multiplier));
  const dueDate = now + adjustedInterval * MS_PER_DAY;
  const reviewCount = card.reviewCount + 1;

  const updated: ReviewCard = {
    ...card,
    easeFactor: result.easeFactor,
    interval: adjustedInterval,
    repetitions: result.repetitions,
    lastGrade: grade,
    dueDate,
    reviewCount,
    mastery: 0,
  };
  updated.mastery = cardMastery(updated);
  return updated;
}

/** Aggregate per-concept mastery: the mean mastery of that concept's cards. */
export function conceptMastery(deck: ReviewDeck): Record<string, number> {
  const sums = new Map<string, { total: number; count: number }>();
  for (const card of deck.cards) {
    const entry = sums.get(card.concept) ?? { total: 0, count: 0 };
    entry.total += card.mastery;
    entry.count += 1;
    sums.set(card.concept, entry);
  }
  const out: Record<string, number> = {};
  for (const [concept, { total, count }] of sums) {
    out[concept] = count > 0 ? round3(total / count) : 0;
  }
  return out;
}

/** Overall deck mastery: mean mastery across all cards (0 for an empty deck). */
export function deckMastery(deck: ReviewDeck): number {
  if (deck.cards.length === 0) return 0;
  const total = deck.cards.reduce((sum, c) => sum + c.mastery, 0);
  return round3(total / deck.cards.length);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
