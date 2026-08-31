import { describe, expect, it } from "vitest";
import { MockProvider } from "@/lib/llm/mock";
import type { TextChunk } from "@/lib/ingest/chunk";
import type { LLMProvider } from "@/lib/llm/types";
import {
  buildConceptContext,
  CONCEPT_CONTEXT_CHAR_LIMIT,
  generateQuestions,
} from "../generateQuestions";
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

  it("grounds the per-concept prompt in the concept's source chunk text", async () => {
    const chunks: TextChunk[] = [
      { index: 0, text: "Chunk zero discusses chlorophyll pigments." },
      { index: 1, text: "Chunk one covers photosynthesis and respiration." },
      { index: 2, text: "Chunk two explains mitochondria in detail." },
    ];

    // A spy provider that records the user messages it is asked to complete.
    const seen: string[] = [];
    const spy: LLMProvider = {
      name: "spy",
      async complete() {
        return "";
      },
      async completeJSON<T>(
        prompt: string,
        parse: (raw: unknown) => T,
      ): Promise<T> {
        seen.push(prompt);
        return parse({ summary: "grounded answer", keywords: [] });
      },
    };

    await generateQuestions(ANALYSIS, spy, { count: 4, chunks });

    // The concept "mitochondria" comes from chunk 2, so its prompt should
    // contain that chunk's text rather than only the book summary.
    const mitoPrompt = seen.find((p) => p.includes("Concept: mitochondria"));
    expect(mitoPrompt).toBeDefined();
    expect(mitoPrompt).toContain("Chunk two explains mitochondria");
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

describe("buildConceptContext", () => {
  const CHUNKS: TextChunk[] = [
    { index: 0, text: "Alpha chunk text." },
    { index: 1, text: "Beta chunk text." },
    { index: 2, text: "Gamma chunk text." },
  ];

  it("concatenates the concept's source chunks in index order", () => {
    const out = buildConceptContext("topic", [2, 0], CHUNKS, "the summary");
    expect(out).toContain("Concept: topic");
    expect(out).toContain("Alpha chunk text.");
    expect(out).toContain("Gamma chunk text.");
    // Order should be by index: alpha (0) before gamma (2).
    expect(out.indexOf("Alpha")).toBeLessThan(out.indexOf("Gamma"));
    expect(out).not.toContain("the summary");
  });

  it("falls back to the summary when no chunks are provided", () => {
    const out = buildConceptContext("topic", [0], undefined, "the summary");
    expect(out).toContain("Concept: topic");
    expect(out).toContain("the summary");
  });

  it("falls back to the summary when no source index resolves", () => {
    const out = buildConceptContext("topic", [99], CHUNKS, "the summary");
    expect(out).toContain("the summary");
    expect(out).not.toContain("Alpha chunk text.");
  });

  it("caps the combined source text at the char limit", () => {
    const big: TextChunk[] = [
      { index: 0, text: "a".repeat(CONCEPT_CONTEXT_CHAR_LIMIT + 500) },
    ];
    const out = buildConceptContext("topic", [0], big, "summary");
    const aCount = (out.match(/a/g) ?? []).length;
    expect(aCount).toBeLessThanOrEqual(CONCEPT_CONTEXT_CHAR_LIMIT);
  });
});
