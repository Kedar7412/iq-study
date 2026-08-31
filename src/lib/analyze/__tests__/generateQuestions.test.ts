import { describe, expect, it } from "vitest";
import { MockProvider } from "@/lib/llm/mock";
import { generateQuestions } from "../generateQuestions";
import type { BookAnalysis } from "../types";

const ANALYSIS: BookAnalysis = {
  summary: "A study of photosynthesis, respiration, and chlorophyll.",
  keyConcepts: [
    { concept: "photosynthesis", importance: 0.9, sourceChunkIndexes: [0, 1] },
    { concept: "respiration", importance: 0.7, sourceChunkIndexes: [1] },
    { concept: "chlorophyll", importance: 0.5, sourceChunkIndexes: [0] },
    { concept: "mitochondria", importance: 0.3, sourceChunkIndexes: [2] },
  ],
  topicOutline: ["photosynthesis", "respiration", "chlorophyll", "mitochondria"],
};

describe("generateQuestions", () => {
  it("returns the requested count with probabilities in [0,1]", async () => {
    const questions = await generateQuestions(ANALYSIS, new MockProvider(), {
      count: 3,
    });
    expect(questions).toHaveLength(3);
    for (const q of questions) {
      expect(q.probability).toBeGreaterThanOrEqual(0);
      expect(q.probability).toBeLessThanOrEqual(1);
      expect(q.answer.length).toBeGreaterThan(0);
      expect(["recall", "application", "conceptual"]).toContain(q.questionType);
    }
  });

  it("returns questions sorted by probability descending", async () => {
    const questions = await generateQuestions(ANALYSIS, new MockProvider(), {
      count: 4,
    });
    for (let i = 1; i < questions.length; i++) {
      expect(questions[i - 1]!.probability).toBeGreaterThanOrEqual(
        questions[i]!.probability,
      );
    }
  });

  it("does not return more questions than available concepts", async () => {
    const questions = await generateQuestions(ANALYSIS, new MockProvider(), {
      count: 100,
    });
    expect(questions).toHaveLength(ANALYSIS.keyConcepts.length);
  });

  it("raises the probability of concepts overlapping the curriculum", async () => {
    const withoutCurriculum = await generateQuestions(
      ANALYSIS,
      new MockProvider(),
      { count: 4 },
    );
    const withCurriculum = await generateQuestions(ANALYSIS, new MockProvider(), {
      count: 4,
      curriculum: { topics: ["chlorophyll"] },
    });

    const findConcept = (list: typeof withoutCurriculum, concept: string) =>
      list.find((q) => q.concept === concept)!;

    const before = findConcept(withoutCurriculum, "chlorophyll");
    const after = findConcept(withCurriculum, "chlorophyll");

    expect(after.probability).toBeGreaterThan(before.probability);
  });

  it("uses syllabus text (not just topic list) for curriculum overlap", async () => {
    const withoutCurriculum = await generateQuestions(
      ANALYSIS,
      new MockProvider(),
      { count: 4 },
    );
    const withText = await generateQuestions(ANALYSIS, new MockProvider(), {
      count: 4,
      curriculum: { text: "This exam covers respiration in depth." },
    });

    const before = withoutCurriculum.find((q) => q.concept === "respiration")!;
    const after = withText.find((q) => q.concept === "respiration")!;
    expect(after.probability).toBeGreaterThan(before.probability);
  });
});
