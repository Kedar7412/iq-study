/**
 * Book analysis via map/reduce over stored chunks.
 *
 * The book is analysed one chunk at a time (the "map" step) using the pluggable
 * {@link LLMProvider}, then the per-chunk results are merged into a single
 * deduplicated, importance-ranked {@link BookAnalysis} (the "reduce" step). This
 * keeps each LLM call small so arbitrarily long books never blow the model's
 * context window.
 *
 * With the deterministic MockProvider this runs fully keyless, which is what
 * local dev and the unit tests rely on.
 */

import { z } from "zod";
import type { LLMProvider } from "@/lib/llm/types";
import type { TextChunk } from "@/lib/ingest/chunk";
import { ANALYSIS_TEMPERATURE, chunkAnalysisSystemPrompt } from "./prompts";
import {
  bookAnalysisSchema,
  type BookAnalysis,
  type Curriculum,
  type KeyConcept,
} from "./types";

/** Options for {@link analyzeBook}. */
export interface AnalyzeBookOptions {
  /** Optional curriculum used to nudge concept importance toward the syllabus. */
  curriculum?: Curriculum;
  /** Max concepts to keep in the final analysis. Default 24. */
  maxConcepts?: number;
}

/** Shape the LLM is asked to return for a single chunk. */
const chunkAnalysisSchema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()),
});

/**
 * Normalise a concept string for dedupe/matching: lowercase, trimmed, and with
 * internal whitespace collapsed. The display form keeps the first-seen casing.
 */
function normalizeConcept(concept: string): string {
  return concept.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Build the set of normalised curriculum terms from its text and topic list.
 * Used to boost the importance of concepts the learner will be examined on.
 */
export function curriculumTerms(curriculum?: Curriculum): Set<string> {
  const terms = new Set<string>();
  if (!curriculum) return terms;
  for (const topic of curriculum.topics ?? []) {
    const n = normalizeConcept(topic);
    if (n) terms.add(n);
  }
  if (curriculum.text) {
    for (const word of curriculum.text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ??
      []) {
      terms.add(word);
    }
  }
  return terms;
}

/**
 * Return true when a concept overlaps the curriculum at all: either the whole
 * concept matches a curriculum term, or any word of the concept does.
 *
 * Retained for callers that only need a boolean; scoring paths should prefer
 * the graded {@link curriculumOverlapScore} so a one-word coincidence does not
 * count the same as a full-topic match.
 */
export function conceptMatchesCurriculum(
  concept: string,
  terms: Set<string>,
): boolean {
  return curriculumOverlapScore(concept, terms) > 0;
}

/**
 * Graded curriculum overlap in [0, 1].
 *
 * A full-concept match (the whole normalised concept is a curriculum term)
 * scores 1.0. Otherwise the score is the fraction of the concept's words that
 * are curriculum terms, capped just below a full match so a partial word-level
 * hit never outranks an exact topic match:
 *
 *   score = matchedWords / totalWords, then scaled by PARTIAL_MATCH_CEILING.
 *
 * So a two-word concept sharing one common word with the syllabus scores ~0.45
 * rather than 1.0, while a concept whose every word is on the syllabus (but is
 * not itself a listed topic) approaches, but never reaches, a full match. This
 * keeps loosely-related concepts from being pulled to the top of the "ultra
 * high probability" list on a single coincidental word.
 */
export const PARTIAL_MATCH_CEILING = 0.9;

export function curriculumOverlapScore(
  concept: string,
  terms: Set<string>,
): number {
  if (terms.size === 0) return 0;
  const normalized = normalizeConcept(concept);
  if (terms.has(normalized)) return 1;
  const words = normalized.split(" ").filter(Boolean);
  if (words.length === 0) return 0;
  const matched = words.filter((word) => terms.has(word)).length;
  if (matched === 0) return 0;
  const fraction = matched / words.length;
  return Number((fraction * PARTIAL_MATCH_CEILING).toFixed(4));
}

/**
 * Analyse an ingested book's chunks and produce a structured, deduplicated
 * {@link BookAnalysis}.
 *
 * Scoring: a concept's raw importance is its normalised cross-chunk frequency
 * (how many chunks mention it, relative to the most frequent concept). When a
 * curriculum is supplied, concepts that overlap it get a fixed additive boost
 * (capped at 1.0) so the syllabus pulls relevant material to the top.
 */
export async function analyzeBook(
  chunks: TextChunk[],
  provider: LLMProvider,
  options: AnalyzeBookOptions = {},
): Promise<BookAnalysis> {
  const maxConcepts = options.maxConcepts ?? 24;
  const terms = curriculumTerms(options.curriculum);

  if (chunks.length === 0) {
    return bookAnalysisSchema.parse({
      summary: "No content was available to analyse.",
      keyConcepts: [],
      topicOutline: [],
    });
  }

  // --- Map: analyse each chunk independently. ---
  const perChunk = await Promise.all(
    chunks.map((chunk) =>
      provider.completeJSON(chunk.text, (raw) => chunkAnalysisSchema.parse(raw), {
        system: chunkAnalysisSystemPrompt(),
        temperature: ANALYSIS_TEMPERATURE,
      }),
    ),
  );

  // --- Reduce: merge concepts, tracking source chunks and frequency. ---
  interface Accum {
    display: string;
    chunkIndexes: Set<number>;
    frequency: number;
  }
  const merged = new Map<string, Accum>();

  perChunk.forEach((result, i) => {
    const chunkIndex = chunks[i]?.index ?? i;
    for (const keyword of result.keywords) {
      const display = keyword.trim();
      if (!display) continue;
      const key = normalizeConcept(display);
      const entry = merged.get(key);
      if (entry) {
        entry.frequency += 1;
        entry.chunkIndexes.add(chunkIndex);
      } else {
        merged.set(key, {
          display,
          chunkIndexes: new Set([chunkIndex]),
          frequency: 1,
        });
      }
    }
  });

  const maxFrequency = Math.max(
    1,
    ...[...merged.values()].map((e) => e.frequency),
  );

  // Max additive boost for a concept that fully matches the curriculum. Partial
  // (word-level) overlaps receive a proportional fraction of this, so a single
  // coincidental word nudges importance rather than jumping it a full 0.3.
  const CURRICULUM_BOOST = 0.3;

  const keyConcepts: KeyConcept[] = [...merged.values()]
    .map((entry) => {
      const base = entry.frequency / maxFrequency;
      const boost = CURRICULUM_BOOST * curriculumOverlapScore(entry.display, terms);
      const importance = Math.min(1, Number((base + boost).toFixed(4)));
      return {
        concept: entry.display,
        importance,
        sourceChunkIndexes: [...entry.chunkIndexes].sort((a, b) => a - b),
      };
    })
    .sort(
      (a, b) =>
        b.importance - a.importance || a.concept.localeCompare(b.concept),
    )
    .slice(0, maxConcepts);

  // Summary: reuse the first chunk's summary as the book-level summary, since
  // chunk 0 typically covers the material's opening/overview.
  const summary =
    perChunk[0]?.summary?.trim() ||
    "Analysis complete; no summary text was produced.";

  // Topic outline: the top concepts in importance order, capped for readability.
  const topicOutline = keyConcepts.slice(0, 10).map((c) => c.concept);

  return bookAnalysisSchema.parse({
    summary,
    keyConcepts,
    topicOutline,
  });
}
