import { describe, expect, it } from "vitest";
import { z } from "zod";
import { MockProvider, extractKeywords, summarize } from "../mock";

const SAMPLE = `Photosynthesis is the process by which plants convert light energy into chemical energy.
Chlorophyll in the leaves absorbs sunlight. The plant uses carbon dioxide and water.
Oxygen is released as a byproduct. This process is essential for life on Earth.
Photosynthesis occurs in the chloroplasts of plant cells.`;

const analysisSchema = z.object({
  summary: z.string().min(1),
  keywords: z.array(z.string()).min(1),
  questions: z
    .array(
      z.object({
        id: z.string(),
        question: z.string().min(1),
        answer: z.string().min(1),
        probability: z.number().min(0).max(1),
        concept: z.string().min(1),
      }),
    )
    .min(1),
  mockGenerated: z.literal(true),
});

describe("MockProvider heuristics", () => {
  it("extracts frequency-ranked keywords deterministically", () => {
    const a = extractKeywords(SAMPLE);
    const b = extractKeywords(SAMPLE);
    expect(a).toEqual(b);
    expect(a).toContain("photosynthesis");
  });

  it("summarizes leading sentences", () => {
    expect(summarize(SAMPLE, 1)).toContain("Photosynthesis");
  });
});

describe("MockProvider", () => {
  it("has the mock name", () => {
    expect(new MockProvider().name).toBe("mock");
  });

  it("produces non-empty, mock-labelled text completions", async () => {
    const provider = new MockProvider();
    const out = await provider.complete(SAMPLE);
    expect(out.length).toBeGreaterThan(0);
    expect(out).toContain("[mock-generated]");
  });

  it("produces stable, schema-valid structured analysis", async () => {
    const provider = new MockProvider();
    const first = await provider.completeJSON(SAMPLE, (raw) =>
      analysisSchema.parse(raw),
    );
    const second = await provider.completeJSON(SAMPLE, (raw) =>
      analysisSchema.parse(raw),
    );

    expect(first).toEqual(second); // deterministic
    expect(first.mockGenerated).toBe(true);
    expect(first.keywords.length).toBeGreaterThan(0);
    expect(first.questions.length).toBeGreaterThan(0);
    for (const q of first.questions) {
      expect(q.probability).toBeGreaterThanOrEqual(0);
      expect(q.probability).toBeLessThanOrEqual(1);
    }
  });
});
