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

/**
 * Build a complete answer set (required now that partial submissions are
 * rejected) then override specific questions with the given option ids.
 */
function fullAnswers(overrides: QuestionnaireAnswers = {}): QuestionnaireAnswers {
  const answers: QuestionnaireAnswers = {};
  for (const q of QUESTIONNAIRE) {
    answers[q.id] = q.options[0]!.id;
  }
  return { ...answers, ...overrides };
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
    // A full submission whose style-bearing answers split evenly between visual
    // and auditory => equal counts; visual wins the tie by the fixed order.
    const answers = answersForStyle("visual");
    // Flip the four style-bearing questions after q4 to auditory so visual and
    // auditory each carry four answers (q9/q10 are style-less).
    for (const q of QUESTIONNAIRE) {
      const auditory = q.options.find((o) => o.style === "auditory");
      if (auditory && Number(q.id.slice(1)) >= 5) answers[q.id] = auditory.id;
    }
    const profile = scoreProfile(answers);
    expect(profile.visual).toBeCloseTo(0.5, 5);
    expect(profile.auditory).toBeCloseTo(0.5, 5);
    expect(profile.dominantStyle).toBe("visual");
  });

  it("maps a fast-pace answer to a higher pace and frequent review to a shorter interval", () => {
    const fast = scoreProfile(fullAnswers({ q9: "q9c", q10: "q10a" }));
    const slow = scoreProfile(fullAnswers({ q9: "q9a", q10: "q10c" }));
    expect(fast.pace).toBeGreaterThan(slow.pace);
    expect(fast.preferredReviewInterval).toBeLessThan(
      slow.preferredReviewInterval,
    );
  });

  it("rejects unknown question and option ids", () => {
    expect(() => scoreProfile(fullAnswers({ nope: "x" }))).toThrow(
      /Unknown question/,
    );
    expect(() => scoreProfile(fullAnswers({ q1: "bogus" }))).toThrow(
      /Unknown option/,
    );
  });

  it("rejects an incomplete questionnaire (partial submission)", () => {
    // A single answer used to yield a lopsided but 'valid' profile; now it must
    // be rejected until every question is answered.
    expect(() => scoreProfile({ q1: "q1a" })).toThrow(/answer every question/i);
    expect(() => validateAnswers({})).toThrow(/answer every question/i);
    // Missing a single answer is still rejected, and names the gap.
    const almost = fullAnswers();
    delete almost.q10;
    expect(() => validateAnswers(almost)).toThrow(/q10/);
  });

  it("accepts a complete questionnaire", () => {
    expect(() => scoreProfile(fullAnswers())).not.toThrow();
    expect(validateAnswers(fullAnswers())).toHaveLength(QUESTIONNAIRE.length);
  });
});
