import { describe, expect, it } from "vitest";
import { MockProvider } from "@/lib/llm/mock";
import type { TextChunk } from "@/lib/ingest/chunk";
import { analyzeBook } from "../analyzeBook";

const CHUNKS: TextChunk[] = [
  {
    index: 0,
    text: "Photosynthesis is the process by which plants convert light energy into chemical energy. Chlorophyll in the leaves absorbs sunlight.",
  },
  {
    index: 1,
    text: "The plant uses carbon dioxide and water. Oxygen is released as a byproduct. Photosynthesis occurs in the chloroplasts of plant cells.",
  },
];

describe("analyzeBook", () => {
  it("returns non-empty concepts from sample chunks via MockProvider", async () => {
    const analysis = await analyzeBook(CHUNKS, new MockProvider());
    expect(analysis.summary.length).toBeGreaterThan(0);
    expect(analysis.keyConcepts.length).toBeGreaterThan(0);
    expect(analysis.topicOutline.length).toBeGreaterThan(0);
  });

  it("keeps concept importance within [0,1] and sorted descending", async () => {
    const analysis = await analyzeBook(CHUNKS, new MockProvider());
    for (const c of analysis.keyConcepts) {
      expect(c.importance).toBeGreaterThanOrEqual(0);
      expect(c.importance).toBeLessThanOrEqual(1);
      expect(c.sourceChunkIndexes.length).toBeGreaterThan(0);
    }
    for (let i = 1; i < analysis.keyConcepts.length; i++) {
      expect(analysis.keyConcepts[i - 1]!.importance).toBeGreaterThanOrEqual(
        analysis.keyConcepts[i]!.importance,
      );
    }
  });

  it("is deterministic for the same input", async () => {
    const a = await analyzeBook(CHUNKS, new MockProvider());
    const b = await analyzeBook(CHUNKS, new MockProvider());
    expect(a).toEqual(b);
  });

  it("tracks provenance across multiple chunks for repeated concepts", async () => {
    const analysis = await analyzeBook(CHUNKS, new MockProvider());
    const photosynthesis = analysis.keyConcepts.find(
      (c) => c.concept.toLowerCase() === "photosynthesis",
    );
    expect(photosynthesis).toBeDefined();
    // Provenance is tracked back to at least the chunk(s) it was extracted from.
    expect(photosynthesis!.sourceChunkIndexes.length).toBeGreaterThan(0);
    for (const idx of photosynthesis!.sourceChunkIndexes) {
      expect([0, 1]).toContain(idx);
    }
  });

  it("returns an empty analysis for no chunks", async () => {
    const analysis = await analyzeBook([], new MockProvider());
    expect(analysis.keyConcepts).toEqual([]);
    expect(analysis.topicOutline).toEqual([]);
  });
});
