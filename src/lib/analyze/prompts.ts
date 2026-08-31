/**
 * Pure prompt-building helpers for the analyze / question-generation pipeline.
 *
 * These system prompts were originally terse strings tuned for the
 * deterministic MockProvider's keyword heuristics. With a real model (Grok /
 * xAI) that terseness let the model wander off-topic ("asks anything about
 * anything") because nothing anchored it to the uploaded material.
 *
 * The prompts here are grounding-first: they constrain the model to ONLY the
 * text it is given, forbid invented or outside facts, and require a single JSON
 * object matching the unchanged zod schemas the rest of the pipeline depends
 * on. They are exported as pure functions so they can be unit-tested without a
 * network call and reused by every consumer.
 *
 * IMPORTANT: the JSON shape described in these prompts must stay in lockstep
 * with `chunkAnalysisSchema` ({ summary, keywords }) in `analyzeBook.ts` and
 * `questionDraftSchema` ({ summary, keywords }) in `generateQuestions.ts`.
 */

/** Low sampling temperature used for analysis calls to reduce model drift. */
export const ANALYSIS_TEMPERATURE = 0.2;

/**
 * System prompt for the per-chunk map step in {@link analyzeBook}.
 *
 * The model receives one excerpt of a larger study text and must return a JSON
 * object with `summary` (2-4 sentences describing ONLY this excerpt) and
 * `keywords` (specific noun-phrase concepts that literally appear in it). The
 * instructions forbid outside knowledge and require JSON-only output so the
 * result validates against `chunkAnalysisSchema`.
 */
export function chunkAnalysisSystemPrompt(): string {
  return [
    "You are analyzing ONE excerpt of a larger study text.",
    "Work strictly from the excerpt provided by the user. Do not add outside knowledge, do not invent facts, and do not describe anything the excerpt does not actually say.",
    "Return a single JSON object only, with no prose, no explanation, and no markdown code fences, using exactly these two keys:",
    '- "summary": a string of 2-4 sentences that summarizes ONLY what this excerpt states, grounded entirely in its wording.',
    '- "keywords": an array of strings listing the specific key concepts or technical terms that literally appear in this excerpt, written as short noun phrases, deduplicated, with no generic filler words (avoid vague terms like "introduction", "chapter", "topic", "information").',
    "If the excerpt is too short or contains no meaningful concepts, return an empty keywords array rather than inventing entries.",
    "Respond with the JSON object only.",
  ].join("\n");
}

/**
 * System prompt for the per-concept reference-answer call in
 * {@link generateQuestions}.
 *
 * The user message supplies the concept plus the source text it was drawn from
 * (its own chunks where available, otherwise the book-level summary) as
 * context. The model must produce an exam-quality explanation of that concept
 * as it is used IN THIS book, grounded in the supplied context, returned as a
 * JSON object matching `questionDraftSchema` ({ summary, keywords }).
 */
export function conceptAnswerSystemPrompt(): string {
  return [
    "You are writing an exam-quality reference answer for a single concept, grounded in the study material provided by the user.",
    'The user message gives the concept (after "Concept:") followed by the source text it comes from (after "Context:"). Explain the concept as it is used IN THIS book, using only the provided context. Do not invent facts or bring in outside knowledge that the context does not support.',
    "Return a single JSON object only, with no prose, no explanation, and no markdown code fences, using exactly these two keys:",
    '- "summary": a string of 2-4 sentences giving an accurate, specific, self-contained explanation of the concept. No filler, no restating the question.',
    '- "keywords": an array of short noun-phrase strings for the most important related terms, deduplicated (an empty array is acceptable).',
    "Respond with the JSON object only.",
  ].join("\n");
}
