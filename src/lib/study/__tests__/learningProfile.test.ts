import { describe, expect, it } from "vitest";
import {
  LEARNING_STYLES,
  QUESTIONNAIRE,
  scoreProfile,
  validateAnswers,
  type LearningStyle,
  type QuestionnaireAnswers,
} from "../learningProfile";

/** Pick the option at `index` (or last) for every question of a given style. */
function answersForStyle(style: LearningStyle): QuestionnaireAnswers {
  const answers: QuestionnaireAnswers = {};
  for (const q of QUESTIONNAIRE) {
    const styled = q.options.find((o) => o.style === style);
    // Fall back to the first option for style-less questions (q9/q10).
    answers[q.id] = (styled ?? q.options[0]).id;
  }
  return answers;
}

describe("QUESTIONNAIRE", () => {
  it("has 10 questions with unique ids and unique option ids", () => {
    expect(QUESTIONNAIRE).toHaveLength(10);
    const qIds = new Set(QUESTIONNAIRE.map((q) => q.id));
    expect(qIds.size).toBe(QUESTIONNAIRE.length);
    const optionIds = QUESTIONNAIRE.flatMap((q) => q.options.map((o) => o.id));
    expect(new Set(optionIds).size).toBe(optionIds.length);
  });
});

describe("scoreProfile", () => {
  it("normalizes the four sensory dimensions to sum to ~1", () => {
    const profile = scoreProfile(answersForStyle("visual"));
    const sum =
      profile.visual +
      profile.auditory +
      profile.readingWriting +
      profile.kinesthetic;
    expect(sum).toBeCloseTo(1, 2);
    for (const style of LEARNING_STYLES) {
      expect(profile[style]).toBeGreaterThanOrEqual(0);
      expect(profile[style]).toBeLessThanOrEqual(1);
    }
    expect(profile.pace).toBeGreaterThanOrEqual(0);
    expect(profile.pace).toBeLessThanOrEqual(1);
    expect(profile.preferredReviewInterval).toBeGreaterThanOrEqual(1);
    expect(profile.preferredReviewInterval).toBeLessThanOrEqual(14);
  });

  it("returns the expected dominantStyle for each style-dominant answer set", () => {
    for (const style of LEARNING_STYLES) {
      const profile = scoreProfile(answersForStyle(style));
      expect(profile.dominantStyle).toBe(style);
      // The dominant dim should be the strongest of the four.
      const others = LEARNING_STYLES.filter((s) => s !== style);
      for (const other of others) {
        expect(profile[style]).toBeGreaterThanOrEqual(profile[other]);
      }
    }
  });

  it("is deterministic for identical inputs", () => {
    const answers = answersForStyle("auditory");
    expect(scoreProfile(answers)).toEqual(scoreProfile(answers));
  });

  it("breaks ties using the fixed style order (visual first)", () => {
    // One visual and one auditory answer => equal counts; visual wins the tie.
    const answers: QuestionnaireAnswers = { q1: "q1a", q2: "q2b" };
    const profile = scoreProfile(answers);
    expect(profile.visual).toBeCloseTo(0.5, 5);
    expect(profile.auditory).toBeCloseTo(0.5, 5);
    expect(profile.dominantStyle).toBe("visual");
  });

  it("maps a fast-pace answer to a higher pace and frequent review to a shorter interval", () => {
    const fast = scoreProfile({ q9: "q9c", q10: "q10a" });
    const slow = scoreProfile({ q9: "q9a", q10: "q10c" });
    expect(fast.pace).toBeGreaterThan(slow.pace);
    expect(fast.preferredReviewInterval).toBeLessThan(
      slow.preferredReviewInterval,
    );
  });

  it("rejects unknown question and option ids", () => {
    expect(() => scoreProfile({ nope: "x" })).toThrow(/Unknown question/);
    expect(() => scoreProfile({ q1: "bogus" })).toThrow(/Unknown option/);
    expect(() => validateAnswers({})).toThrow(/No answers/);
  });
});
