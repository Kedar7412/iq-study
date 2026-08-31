import { describe, expect, it } from "vitest";
import {
  conceptMatchesCurriculum,
  curriculumOverlapScore,
  curriculumTerms,
  PARTIAL_MATCH_CEILING,
} from "../analyzeBook";

describe("curriculumOverlapScore", () => {
  it("scores no overlap as 0 and an empty curriculum as 0", () => {
    const terms = curriculumTerms({ topics: ["photosynthesis"] });
    expect(curriculumOverlapScore("mitochondria", terms)).toBe(0);
    expect(curriculumOverlapScore("photosynthesis", new Set())).toBe(0);
  });

  it("scores a full-concept match as 1.0", () => {
    const terms = curriculumTerms({ topics: ["cellular respiration"] });
    expect(curriculumOverlapScore("cellular respiration", terms)).toBe(1);
  });

  it("grades a partial word-level match below a full match", () => {
    // "light reactions" shares only the word "light" with the syllabus.
    const terms = curriculumTerms({ topics: ["light"] });
    const partial = curriculumOverlapScore("light reactions", terms);
    // One of two words matches => 0.5 * ceiling.
    expect(partial).toBeCloseTo(0.5 * PARTIAL_MATCH_CEILING, 4);
    expect(partial).toBeGreaterThan(0);
    expect(partial).toBeLessThan(1);
  });

  it("ranks a fuller overlap higher than a one-word coincidence", () => {
    const terms = curriculumTerms({ topics: ["carbon", "cycle"] });
    const oneWord = curriculumOverlapScore("carbon footprint", terms);
    const twoWord = curriculumOverlapScore("carbon cycle", terms);
    expect(twoWord).toBeGreaterThan(oneWord);
  });

  it("caps a full word-level match just below an exact topic match", () => {
    // Every word is a curriculum term, but the concept itself is not a listed
    // topic, so it approaches but never reaches a full 1.0 match.
    const terms = curriculumTerms({ topics: ["carbon", "cycle"] });
    const allWords = curriculumOverlapScore("cycle carbon", terms);
    expect(allWords).toBeCloseTo(PARTIAL_MATCH_CEILING, 4);
    expect(allWords).toBeLessThan(1);
  });

  it("conceptMatchesCurriculum stays a boolean view of the graded score", () => {
    const terms = curriculumTerms({ topics: ["light"] });
    expect(conceptMatchesCurriculum("light reactions", terms)).toBe(true);
    expect(conceptMatchesCurriculum("mitochondria", terms)).toBe(false);
  });
});
