import { describe, expect, it } from "vitest";
import type { ExamQuestion } from "@/lib/analyze/types";
import type { LearningProfile } from "@/lib/study/learningProfile";
import type { ReviewDeck } from "@/lib/store/reviews";
import {
  buildDeck,
  cardMastery,
  dueCards,
  gradeCard,
  intervalMultiplier,
  orderCardsForProfile,
} from "../session";

const NOW = 1_700_000_000_000;
const DAY = 24 * 60 * 60 * 1000;

function question(
  id: string,
  concept: string,
  questionType: ExamQuestion["questionType"] = "recall",
): ExamQuestion {
  return {
    id,
    question: `Q ${id}`,
    answer: `A ${id}`,
    concept,
    questionType,
    probability: 0.5,
    rationale: "because",
  };
}

function profile(overrides: Partial<LearningProfile> = {}): LearningProfile {
  return {
    visual: 0.25,
    auditory: 0.25,
    readingWriting: 0.25,
    kinesthetic: 0.25,
    pace: 0.5,
    preferredReviewInterval: 7,
    dominantStyle: "readingWriting",
    ...overrides,
  };
}

describe("buildDeck", () => {
  it("creates a due-now card per question when there is no prior deck", () => {
    const deck = buildDeck(
      "u1",
      "b1",
      [question("q1", "A"), question("q2", "B")],
      undefined,
      NOW,
    );
    expect(deck.cards).toHaveLength(2);
    expect(deck.cards.every((c) => c.dueDate === NOW)).toBe(true);
    expect(deck.cards.every((c) => c.repetitions === 0)).toBe(true);
  });

  it("preserves existing SM-2 state and drops orphaned cards", () => {
    const existing: ReviewDeck = {
      userId: "u1",
      bookId: "b1",
      cards: [
        {
          cardId: "card_q1",
          questionId: "q1",
          concept: "A",
          easeFactor: 2.6,
          interval: 6,
          repetitions: 2,
          lastGrade: 4,
          dueDate: NOW + 6 * DAY,
          reviewCount: 2,
          mastery: 0.5,
        },
        {
          cardId: "card_qOld",
          questionId: "qOld",
          concept: "Z",
          easeFactor: 2.5,
          interval: 1,
          repetitions: 1,
          lastGrade: 3,
          dueDate: NOW,
          reviewCount: 1,
          mastery: 0.3,
        },
      ],
    };
    const deck = buildDeck(
      "u1",
      "b1",
      [question("q1", "A"), question("q2", "B")],
      existing,
      NOW,
    );
    expect(deck.cards.map((c) => c.questionId).sort()).toEqual(["q1", "q2"]);
    const q1 = deck.cards.find((c) => c.questionId === "q1")!;
    expect(q1.repetitions).toBe(2);
    expect(q1.interval).toBe(6);
  });
});

describe("dueCards", () => {
  it("returns only cards whose dueDate is at or before now", () => {
    const deck = buildDeck("u1", "b1", [question("q1", "A")], undefined, NOW);
    deck.cards.push({
      cardId: "card_future",
      questionId: "qf",
      concept: "F",
      easeFactor: 2.5,
      interval: 6,
      repetitions: 2,
      lastGrade: 5,
      dueDate: NOW + 6 * DAY,
      reviewCount: 2,
      mastery: 0.8,
    });
    const due = dueCards(deck, NOW);
    expect(due).toHaveLength(1);
    expect(due[0].questionId).toBe("q1");
  });
});

describe("orderCardsForProfile", () => {
  it("surfaces conceptual/application cards first for kinesthetic learners", () => {
    const questions = [
      question("q1", "A", "recall"),
      question("q2", "B", "application"),
      question("q3", "C", "conceptual"),
    ];
    const deck = buildDeck("u1", "b1", questions, undefined, NOW);
    const types = Object.fromEntries(
      questions.map((q) => [q.id, q.questionType]),
    ) as Record<string, ExamQuestion["questionType"]>;

    const ordered = orderCardsForProfile(
      deck.cards,
      profile({ dominantStyle: "kinesthetic", kinesthetic: 0.7 }),
      types,
    );
    expect(ordered.map((c) => c.questionId)).toEqual(["q3", "q2", "q1"]);
  });

  it("orders least-mastered first for a non-kinesthetic learner", () => {
    const questions = [question("q1", "A"), question("q2", "B")];
    const deck = buildDeck("u1", "b1", questions, undefined, NOW);
    deck.cards[0].mastery = 0.9;
    deck.cards[1].mastery = 0.1;
    const types = { q1: "recall", q2: "recall" } as Record<
      string,
      ExamQuestion["questionType"]
    >;
    const ordered = orderCardsForProfile(deck.cards, profile(), types);
    expect(ordered.map((c) => c.questionId)).toEqual(["q2", "q1"]);
  });
});

describe("intervalMultiplier", () => {
  it("compresses intervals for frequent reviewers and expands for spaced ones", () => {
    const frequent = intervalMultiplier(profile({ preferredReviewInterval: 1 }));
    const spaced = intervalMultiplier(profile({ preferredReviewInterval: 14 }));
    expect(frequent).toBeLessThan(1);
    expect(spaced).toBeGreaterThan(1);
  });
});

describe("gradeCard", () => {
  it("applies the profile interval multiplier and updates mastery", () => {
    const deck = buildDeck("u1", "b1", [question("q1", "A")], undefined, NOW);
    // Advance to a multi-day interval first.
    let card = gradeCard(deck.cards[0], 5, profile(), NOW);
    card = gradeCard(card, 5, profile(), NOW);
    card = gradeCard(card, 5, profile(), NOW);
    const spacedCard = gradeCard(
      card,
      5,
      profile({ preferredReviewInterval: 14 }),
      NOW,
    );
    expect(spacedCard.mastery).toBeGreaterThan(0);
    expect(spacedCard.dueDate).toBeGreaterThan(NOW);
  });

  it("caps mastery low after a recent failing grade", () => {
    const failed = cardMastery({ repetitions: 0, lastGrade: 1, reviewCount: 1 });
    expect(failed).toBeLessThanOrEqual(0.3);
  });
});
