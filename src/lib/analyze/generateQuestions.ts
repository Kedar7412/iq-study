/**
 * Ranked exam-question generation from a {@link BookAnalysis} + curriculum.
 *
 * Each key concept becomes a candidate question. Question text/answers come
 * from the pluggable {@link LLMProvider} (deterministic and keyless via the
 * MockProvider), while the exam-likelihood `probability` is computed locally
 * from a transparent, documented heuristic so it is reproducible and testable.
 *
 * Scoring heuristic (probability in [0, 1]):
 *
 *   probability = clamp01( CONCEPT_WEIGHT * importance
 *                          + CURRICULUM_WEIGHT * curriculumOverlap )
 *
 * where:
 *   - `importance` is the concept's normalised importance from the analysis.
 *   - `curriculumOverlap` is a graded [0, 1] score (see
 *     {@link curriculumOverlapScore}): 1.0 for a full-concept match, a scaled
 *     fraction for a partial word-level match, and 0 for no overlap. A one-word
 *     coincidence therefore contributes far less than a full-topic match.
 *   - CONCEPT_WEIGHT (0.6) + CURRICULUM_WEIGHT (0.4) = 1, so a maximally
 *     important concept that also fully overlaps the curriculum scores 1.0.
 *
 * The rationale string records which signals fired so the UI can explain the
 * score. Results are returned sorted by probability descending.
 */

import { z } from "zod";
import type { LLMProvider } from "@/lib/llm/types";
import type { TextChunk } from "@/lib/ingest/chunk";
import { curriculumTerms, curriculumOverlapScore } from "./analyzeBook";
import { ANALYSIS_TEMPERATURE, conceptAnswerSystemPrompt } from "./prompts";
import {
  examQuestionSchema,
  type BookAnalysis,
  type Curriculum,
  type ExamQuestion,
  type QuestionType,
} from "./types";

/** Weight applied to a concept's intrinsic importance. */
export const CONCEPT_WEIGHT = 0.6;
/** Weight applied to curriculum overlap. */
export const CURRICULUM_WEIGHT = 0.4;

/** Options for {@link generateQuestions}. */
export interface GenerateQuestionsOptions {
  /** Curriculum used to bias scoring. Optional. */
  curriculum?: Curriculum;
  /** Number of questions to request. Default 10. */
  count?: number;
  /**
   * The book's source chunks, used to ground each concept's reference answer in
   * its actual source text (via {@link KeyConcept.sourceChunkIndexes}) rather
   * than only the book-level summary. Optional; when omitted, the per-concept
   * prompt falls back to `analysis.summary`.
   */
  chunks?: TextChunk[];
}

/**
 * Max characters of source text fed into a single concept's reference-answer
 * prompt. Keeps the payload bounded for concepts that span many chunks while
 * still giving the model the concept's actual context to work from.
 */
export const CONCEPT_CONTEXT_CHAR_LIMIT = 4000;

/**
 * Build the grounding context for one concept's reference-answer call.
 *
 * Prefers the concept's own source chunk text (looked up by index from
 * `chunks`), concatenated in chunk order and capped at
 * {@link CONCEPT_CONTEXT_CHAR_LIMIT} characters. Falls back to the book-level
 * `summary` when no source text is available (no chunks passed, or none of the
 * concept's source indexes resolve). This keeps the "use only the provided
 * context" instruction truthful: the model receives the text the concept was
 * actually drawn from.
 */
export function buildConceptContext(
  concept: string,
  sourceChunkIndexes: number[],
  chunks: TextChunk[] | undefined,
  summary: string,
): string {
  const byIndex = new Map<number, string>();
  for (const chunk of chunks ?? []) {
    byIndex.set(chunk.index, chunk.text);
  }

  const parts: string[] = [];
  let used = 0;
  for (const idx of [...sourceChunkIndexes].sort((a, b) => a - b)) {
    const text = byIndex.get(idx);
    if (!text) continue;
    const remaining = CONCEPT_CONTEXT_CHAR_LIMIT - used;
    if (remaining <= 0) break;
    const slice = text.slice(0, remaining);
    parts.push(slice);
    used += slice.length;
  }

  const sourceText = parts.join("\n\n").trim();
  const context = sourceText || summary.trim();

  return [`Concept: ${concept}`, "", "Context:", context].join("\n");
}

/** Shape the LLM is asked to return for a single concept's question. */
const questionDraftSchema = z.object({
  summary: z.string(),
  keywords: z.array(z.string()),
});

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Deterministically assign a question type by rotating through the three kinds
 * based on the concept ordinal. This keeps a healthy mix without a model call.
 */
const QUESTION_TYPES: QuestionType[] = ["recall", "application", "conceptual"];
function questionTypeFor(index: number): QuestionType {
  return QUESTION_TYPES[index % QUESTION_TYPES.length]!;
}

/**
 * Generate a ranked set of exam questions from a book analysis and curriculum.
 *
 * Returns exactly `min(count, availableConcepts)` questions, sorted by
 * probability descending (ties broken by concept name for stability).
 */
export async function generateQuestions(
  analysis: BookAnalysis,
  provider: LLMProvider,
  options: GenerateQuestionsOptions = {},
): Promise<ExamQuestion[]> {
  const count = options.count ?? 10;
  const terms = curriculumTerms(options.curriculum);

  const concepts = analysis.keyConcepts.slice(0, Math.max(0, count));

  const questions = await Promise.all(
    concepts.map(async (kc, i) => {
      // Use the provider to produce a concise reference answer for the concept.
      // We reuse completeJSON (available on every provider) and take its
      // summary as the answer body; this stays deterministic under the mock.
      // The user message grounds the concept in its actual source chunk text
      // (falling back to the book summary), so the "use only the provided
      // context" system instruction matches the payload the model receives.
      const userMessage = buildConceptContext(
        kc.concept,
        kc.sourceChunkIndexes,
        options.chunks,
        analysis.summary,
      );
      const draft = await provider.completeJSON(
        userMessage,
        (raw) => questionDraftSchema.parse(raw),
        { system: conceptAnswerSystemPrompt(), temperature: ANALYSIS_TEMPERATURE },
      );

      const overlap = curriculumOverlapScore(kc.concept, terms);
      const probability = clamp01(
        CONCEPT_WEIGHT * kc.importance + CURRICULUM_WEIGHT * overlap,
      );

      const questionType = questionTypeFor(i);
      const question =
        questionType === "recall"
          ? `Define and explain "${kc.concept}".`
          : questionType === "application"
            ? `How would you apply the concept of "${kc.concept}" to a new problem?`
            : `Why is "${kc.concept}" important, and how does it relate to the surrounding material?`;

      const rationaleParts = [
        `Concept importance ${kc.importance.toFixed(2)} (weight ${CONCEPT_WEIGHT}).`,
        overlap > 0
          ? `Curriculum overlap ${overlap.toFixed(2)} (weight ${CURRICULUM_WEIGHT}).`
          : "No curriculum overlap detected.",
      ];

      return examQuestionSchema.parse({
        id: `q${i + 1}`,
        question,
        answer: draft.summary.trim() || `Key idea: ${kc.concept}.`,
        concept: kc.concept,
        questionType,
        probability: Number(probability.toFixed(4)),
        rationale: rationaleParts.join(" "),
      });
    }),
  );

  return questions.sort(
    (a, b) =>
      b.probability - a.probability || a.concept.localeCompare(b.concept),
  );
}
