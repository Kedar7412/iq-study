import { describe, expect, it } from "vitest";
import type { BookAnalysis } from "@/lib/analyze/types";
import { buildConceptMap } from "../conceptMap";

function analysis(): BookAnalysis {
  return {
    summary: "s",
    topicOutline: ["outline"],
    keyConcepts: [
      { concept: "Photosynthesis", importance: 0.9, sourceChunkIndexes: [0, 1] },
      { concept: "Chlorophyll", importance: 0.7, sourceChunkIndexes: [1, 2] },
      { concept: "Mitosis", importance: 0.6, sourceChunkIndexes: [5] },
    ],
  };
}

describe("buildConceptMap", () => {
  it("links concepts that share source chunks", () => {
    const graph = buildConceptMap(analysis());
    // Photosynthesis (0,1) and Chlorophyll (1,2) share chunk 1.
    const edge = graph.edges.find(
      (e) =>
        (e.source === "Chlorophyll" && e.target === "Photosynthesis") ||
        (e.source === "Photosynthesis" && e.target === "Chlorophyll"),
    );
    expect(edge).toBeDefined();
    expect(edge!.weight).toBe(1);
  });

  it("does not link concepts with no shared sources", () => {
    const graph = buildConceptMap(analysis());
    const mitosisEdge = graph.edges.find(
      (e) => e.source === "Mitosis" || e.target === "Mitosis",
    );
    expect(mitosisEdge).toBeUndefined();
  });

  it("attaches per-concept mastery to nodes, defaulting to 0", () => {
    const graph = buildConceptMap(analysis(), { Photosynthesis: 0.6 });
    const photo = graph.nodes.find((n) => n.concept === "Photosynthesis")!;
    const mitosis = graph.nodes.find((n) => n.concept === "Mitosis")!;
    expect(photo.mastery).toBe(0.6);
    expect(mitosis.mastery).toBe(0);
  });

  it("links concepts co-occurring in a curriculum topic", () => {
    const graph = buildConceptMap(analysis(), {}, {
      topics: ["Photosynthesis and Mitosis in plant cells"],
    });
    const edge = graph.edges.find(
      (e) =>
        (e.source === "Mitosis" && e.target === "Photosynthesis") ||
        (e.source === "Photosynthesis" && e.target === "Mitosis"),
    );
    expect(edge).toBeDefined();
  });
});
