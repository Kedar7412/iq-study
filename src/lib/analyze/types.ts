/**
 * Domain types and zod schemas for book analysis and exam-question generation.
 *
 * These types describe the richer, curriculum-aware analysis introduced in
 * FEAT-003. They intentionally live alongside the analyze module (rather than
 * in `@/lib/llm/types`) because they extend the LLM layer's primitive
 * `BookAnalysis`/`StudyQuestion` shapes with structure the study flow needs
 * (source chunk provenance, question types, scoring rationale, curriculum).
 */

import { z } from "zod";

/**
 * Curriculum input model.
 *
 * A learner supplies their syllabus either as free-form pasted `text`, or as an
 * explicit list of `topics`, or both. At least one must be non-empty. The
 * curriculum is stored alongside the book and used to bias exam-likelihood
 * scoring toward concepts the learner will actually be tested on.
 */
export const curriculumSchema = z
  .object({
    /** Free-form syllabus / curriculum text pasted by the learner. */
    text: z.string().trim().max(20_000).optional(),
    /** Explicit list of curriculum topics/keywords. */
    topics: z.array(z.string().trim().min(1)).max(200).optional(),
  })
  .refine(
    (c) => (c.text && c.text.length > 0) || (c.topics && c.topics.length > 0),
    { message: "Provide curriculum text or at least one topic." },
  );

/** Parsed, validated curriculum input. */
export type Curriculum = z.infer<typeof curriculumSchema>;

/** A single salient concept extracted from the book. */
export const keyConceptSchema = z.object({
  /** The concept / keyword. */
  concept: z.string().min(1),
  /** Relative importance within the book, 0-1. */
  importance: z.number().min(0).max(1),
  /** Indexes of the source chunks this concept was derived from. */
  sourceChunkIndexes: z.array(z.number().int().nonnegative()),
});

/** A single salient concept extracted from the book. */
export type KeyConcept = z.infer<typeof keyConceptSchema>;

/** Structured analysis of an ingested book. */
export const bookAnalysisSchema = z.object({
  /** Short human-readable summary of the whole book. */
  summary: z.string().min(1),
  /** Deduplicated, importance-ranked key concepts. */
  keyConcepts: z.array(keyConceptSchema),
  /** Ordered high-level topic outline. */
  topicOutline: z.array(z.string().min(1)),
});

/** Structured analysis of an ingested book. */
export type BookAnalysis = z.infer<typeof bookAnalysisSchema>;

/** The kind of cognition an exam question exercises. */
export const questionTypeSchema = z.enum([
  "recall",
  "application",
  "conceptual",
]);

/** The kind of cognition an exam question exercises. */
export type QuestionType = z.infer<typeof questionTypeSchema>;

/** A ranked exam question tied to a source concept. */
export const examQuestionSchema = z.object({
  /** Stable identifier within a generated set. */
  id: z.string().min(1),
  /** The question prompt shown to the learner. */
  question: z.string().min(1),
  /** A concise reference answer. */
  answer: z.string().min(1),
  /** The key concept the question targets. */
  concept: z.string().min(1),
  /** Whether the question tests recall, application, or conceptual grasp. */
  questionType: questionTypeSchema,
  /** Estimated exam-likelihood score in [0, 1]. */
  probability: z.number().min(0).max(1),
  /** Human-readable explanation of how the probability was derived. */
  rationale: z.string().min(1),
});

/** A ranked exam question tied to a source concept. */
export type ExamQuestion = z.infer<typeof examQuestionSchema>;
