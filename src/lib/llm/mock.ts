/**
 * Deterministic mock LLM provider.
 *
 * Produces stable, non-empty summaries, keywords, and study questions from an
 * input text using simple heuristics (sentence extraction + term frequency).
 * It never calls a network service, so the whole app builds, tests, and runs
 * without any API key. All generated content is clearly labelled as mock.
 */

import type { CompleteOptions, LLMProvider } from "./types";

/** Common English stop words excluded from keyword extraction. */
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "if", "then", "else", "of", "to",
  "in", "on", "at", "by", "for", "with", "as", "is", "are", "was", "were",
  "be", "been", "being", "this", "that", "these", "those", "it", "its", "we",
  "you", "they", "he", "she", "them", "his", "her", "their", "our", "your",
  "from", "into", "about", "over", "under", "than", "so", "not", "no", "can",
  "will", "would", "should", "could", "may", "might", "do", "does", "did",
  "has", "have", "had", "which", "who", "whom", "what", "when", "where",
  "why", "how", "all", "any", "each", "some", "such", "only", "own", "same",
  "there", "here", "also", "more", "most", "other", "one", "two", "up", "out",
]);

function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]{2,}/g) ?? []).filter(
    (w) => !STOP_WORDS.has(w),
  );
}

/**
 * Extract the most frequent meaningful terms, ordered by frequency then
 * lexicographically (for deterministic ties).
 */
export function extractKeywords(text: string, limit = 10): string[] {
  const counts = new Map<string, number>();
  for (const token of tokenize(text)) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([word]) => word);
}

/** Build a short extractive summary from the leading sentences. */
export function summarize(text: string, maxSentences = 3): string {
  const sentences = splitSentences(text);
  if (sentences.length === 0) {
    return "No readable content was found in the provided material.";
  }
  return sentences.slice(0, maxSentences).join(" ");
}

/** A deterministic FNV-1a hash used to derive stable pseudo-values. */
function hash(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * The deterministic mock provider. Given the same input it always returns the
 * same output, which is what unit tests and keyless local dev rely on.
 */
export class MockProvider implements LLMProvider {
  readonly name = "mock";

  async complete(prompt: string, _opts?: CompleteOptions): Promise<string> {
    void _opts;
    const keywords = extractKeywords(prompt, 6);
    const summary = summarize(prompt, 2);
    return [
      "[mock-generated]",
      summary,
      keywords.length > 0 ? `Key concepts: ${keywords.join(", ")}.` : "",
    ]
      .filter(Boolean)
      .join(" ");
  }

  async completeJSON<T>(
    prompt: string,
    parse: (raw: unknown) => T,
    _opts?: CompleteOptions,
  ): Promise<T> {
    void _opts;
    const keywords = extractKeywords(prompt, 8);
    const sentences = splitSentences(prompt);

    const questions = keywords.slice(0, 5).map((concept, i) => {
      const source =
        sentences.find((s) => s.toLowerCase().includes(concept)) ??
        sentences[i % Math.max(sentences.length, 1)] ??
        concept;
      // Deterministic probability in [0.60, 0.95] derived from the concept.
      const probability =
        0.6 + (hash(concept) % 36) / 100; // 0.60 .. 0.95
      return {
        id: `q${i + 1}`,
        question: `What is the significance of "${concept}" in this material?`,
        answer: `[mock-generated] ${source}`,
        probability: Number(probability.toFixed(2)),
        concept,
      };
    });

    const raw = {
      summary: summarize(prompt, 3),
      keywords,
      questions,
      mockGenerated: true,
    };

    return parse(raw);
  }
}
