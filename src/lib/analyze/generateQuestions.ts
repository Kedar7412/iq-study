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
 *   - `curriculumOverlap` is 1 when the concept matches a curriculum term else 0.
 *   - CONCEPT_WEIGHT (0.6) + CURRICULUM_WEIGHT (0.4) = 1, so a maximally
 *     important concept that also overlaps the curriculum scores 1.0.
 *
 * The rationale string records which signals fired so the UI can explain the
 * score. Results are returned sorted by probability descending.
 */

import { z } from "zod";
import type { LLMProvider } from "@/lib/llm/types";
import {
  curriculumTerms,
  conceptMatchesCurriculum,
} from "./analyzeBook";
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
      const draft = await provider.completeJSON(
        `${kc.concept}. ${analysis.summary}`,
        (raw) => questionDraftSchema.parse(raw),
        { system: "Explain this concept concisely for an exam answer." },
      );

      const overlaps = conceptMatchesCurriculum(kc.concept, terms);
      const probability = clamp01(
        CONCEPT_WEIGHT * kc.importance +
          CURRICULUM_WEIGHT * (overlaps ? 1 : 0),
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
        overlaps
          ? `Matches the curriculum (weight ${CURRICULUM_WEIGHT}).`
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
