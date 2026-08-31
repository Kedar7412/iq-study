import { describe, expect, it } from "vitest";
import {
  ANALYSIS_TEMPERATURE,
  chunkAnalysisSystemPrompt,
  conceptAnswerSystemPrompt,
} from "../prompts";

describe("chunkAnalysisSystemPrompt", () => {
  const prompt = chunkAnalysisSystemPrompt();

  it("requires a single JSON object only", () => {
    expect(prompt).toMatch(/JSON object only/i);
  });

  it("grounds the model in the provided excerpt", () => {
    expect(prompt).toMatch(/excerpt/i);
    expect(prompt).toMatch(/outside knowledge/i);
  });

  it("forbids inventing facts", () => {
    expect(prompt).toMatch(/do not invent/i);
  });

  it("describes the exact summary and keywords keys", () => {
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"keywords"');
  });
});

describe("conceptAnswerSystemPrompt", () => {
  const prompt = conceptAnswerSystemPrompt();

  it("requires a single JSON object only", () => {
    expect(prompt).toMatch(/JSON object only/i);
  });

  it("grounds the answer in the provided book context", () => {
    expect(prompt).toMatch(/IN THIS book/i);
    expect(prompt).toMatch(/only the provided context/i);
  });

  it("forbids inventing facts / outside knowledge", () => {
    expect(prompt).toMatch(/do not invent/i);
    expect(prompt).toMatch(/outside knowledge/i);
  });

  it("describes the exact summary and keywords keys", () => {
    expect(prompt).toContain('"summary"');
    expect(prompt).toContain('"keywords"');
  });
});

describe("ANALYSIS_TEMPERATURE", () => {
  it("is a low temperature to reduce drift", () => {
    expect(ANALYSIS_TEMPERATURE).toBeGreaterThanOrEqual(0);
    expect(ANALYSIS_TEMPERATURE).toBeLessThanOrEqual(0.3);
  });
});
