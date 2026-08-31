/**
 * Shared LLM provider abstraction and domain types.
 *
 * The rest of the app depends only on the {@link LLMProvider} interface, never
 * on a concrete backend. This keeps the AI layer swappable and lets the app
 * build, test, and run fully keyless via the deterministic MockProvider.
 */

/** Options accepted by a text completion call. */
export interface CompleteOptions {
  /** Optional system / instruction prompt prepended to the user prompt. */
  system?: string;
  /** Sampling temperature. Ignored by deterministic providers. */
  temperature?: number;
  /** Soft cap on output length. Interpretation is provider-specific. */
  maxTokens?: number;
}

/**
 * A pluggable large-language-model provider.
 *
 * Implementations must never throw at construction time for a missing key;
 * key validation (if any) happens lazily inside the methods.
 */
export interface LLMProvider {
  /** Human-readable provider name, e.g. "mock" or "openai". */
  readonly name: string;
  /** Produce a free-form text completion for the given prompt. */
  complete(prompt: string, opts?: CompleteOptions): Promise<string>;
  /**
   * Produce a structured JSON completion. The returned value is parsed and
   * validated by the caller-supplied `parse` function (typically a zod schema's
   * `parse`), so callers get a typed result.
   */
  completeJSON<T>(
    prompt: string,
    parse: (raw: unknown) => T,
    opts?: CompleteOptions,
  ): Promise<T>;
}

/** A single generated study question. */
export interface StudyQuestion {
  /** Stable identifier within a generated set. */
  id: string;
  /** The question prompt shown to the learner. */
  question: string;
  /** A concise reference answer. */
  answer: string;
  /** Estimated probability (0-1) this concept appears on an exam. */
  probability: number;
  /** Key concept / keyword the question targets. */
  concept: string;
}

/** Result of analysing a book's text. */
export interface BookAnalysis {
  /** Short human-readable summary of the material. */
  summary: string;
  /** Salient keywords / concepts extracted from the text. */
  keywords: string[];
  /** Generated high-probability study questions. */
  questions: StudyQuestion[];
  /** Whether these results were produced by the deterministic mock provider. */
  mockGenerated: boolean;
}
