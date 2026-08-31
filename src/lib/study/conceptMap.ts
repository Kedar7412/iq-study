/**
 * Concept-map ("web forming in your brain") derivation.
 *
 * Turns a {@link BookAnalysis} into an undirected graph of related concepts.
 * Two concepts are linked when they share at least one source chunk (they were
 * derived from overlapping passages) or when they co-occur in the same
 * curriculum topic. Edge weight is the number of shared sources, so tightly
 * coupled concepts render as stronger links.
 *
 * The graph is enriched with a per-concept mastery value (0-1) supplied by the
 * study loop, so the UI can colour each node by how well the learner knows it.
 *
 * Pure and deterministic: no I/O, stable ordering, so it is trivially
 * unit-testable.
 */

import type { BookAnalysis, Curriculum } from "@/lib/analyze/types";

/** A node in the concept web. */
export interface ConceptNode {
  /** The concept name (unique within a graph). */
  concept: string;
  /** Relative importance in the book, 0-1 (from the analysis). */
  importance: number;
  /** Learner mastery in [0, 1]; 0 when never reviewed. */
  mastery: number;
}

/** An undirected edge linking two related concepts. */
export interface ConceptEdge {
  /** First concept (sorted before {@link ConceptEdge.target}). */
  source: string;
  /** Second concept. */
  target: string;
  /** Link strength: count of shared source chunks (+ curriculum co-occurrence). */
  weight: number;
}

/** The derived concept web. */
export interface ConceptGraph {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

/** Normalize a token for loose curriculum matching. */
function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Build the concept web for a book.
 *
 * @param analysis The structured book analysis.
 * @param mastery Optional map from concept name to mastery in [0, 1].
 * @param curriculum Optional curriculum, used to link concepts that a topic
 *   mentions together.
 */
export function buildConceptMap(
  analysis: BookAnalysis,
  mastery: Record<string, number> = {},
  curriculum?: Curriculum,
): ConceptGraph {
  const concepts = analysis.keyConcepts;

  const nodes: ConceptNode[] = concepts.map((c) => ({
    concept: c.concept,
    importance: c.importance,
    mastery: clamp01(mastery[c.concept] ?? 0),
  }));

  // Accumulate edge weights keyed by a stable "a|b" pair (a < b).
  const weights = new Map<string, number>();

  const addWeight = (a: string, b: string, delta: number) => {
    if (a === b) return;
    const [source, target] = a < b ? [a, b] : [b, a];
    const key = `${source}|${target}`;
    weights.set(key, (weights.get(key) ?? 0) + delta);
  };

  // 1) Link concepts that share source chunks.
  for (let i = 0; i < concepts.length; i += 1) {
    const a = concepts[i];
    const aSources = new Set(a.sourceChunkIndexes);
    for (let j = i + 1; j < concepts.length; j += 1) {
      const b = concepts[j];
      let shared = 0;
      for (const idx of b.sourceChunkIndexes) {
        if (aSources.has(idx)) shared += 1;
      }
      if (shared > 0) addWeight(a.concept, b.concept, shared);
    }
  }

  // 2) Link concepts that co-occur in the same curriculum topic. A concept
  //    "co-occurs" with a topic when the topic text contains the concept name.
  const topics = curriculum?.topics ?? [];
  if (topics.length > 0) {
    for (const topic of topics) {
      const t = normalize(topic);
      const matched = concepts.filter((c) => t.includes(normalize(c.concept)));
      for (let i = 0; i < matched.length; i += 1) {
        for (let j = i + 1; j < matched.length; j += 1) {
          addWeight(matched[i].concept, matched[j].concept, 1);
        }
      }
    }
  }

  const edges: ConceptEdge[] = [...weights.entries()]
    .map(([key, weight]) => {
      const [source, target] = key.split("|");
      return { source, target, weight };
    })
    .sort(
      (a, b) =>
        b.weight - a.weight ||
        a.source.localeCompare(b.source) ||
        a.target.localeCompare(b.target),
    );

  return { nodes, edges };
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
