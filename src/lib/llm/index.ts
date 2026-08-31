/**
 * LLM provider factory.
 *
 * Returns an {@link OpenAIProvider} only when `LLM_PROVIDER=openai` AND
 * `OPENAI_API_KEY` is set; otherwise falls back to the deterministic
 * {@link MockProvider}. This function never throws for a missing key, so the
 * app builds, tests, and runs fully keyless by default.
 */

import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import type { LLMProvider } from "./types";

export type { LLMProvider, CompleteOptions, BookAnalysis, StudyQuestion } from "./types";
export { MockProvider } from "./mock";
export { OpenAIProvider } from "./openai";

/**
 * Resolve the active LLM provider from environment configuration.
 *
 * @returns an {@link OpenAIProvider} when explicitly selected and keyed,
 *          otherwise a {@link MockProvider}.
 */
export function getLLMProvider(): LLMProvider {
  const provider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const apiKey = process.env.OPENAI_API_KEY;

  // OpenAIProvider does not touch the network or validate the key at import
  // time (only in its constructor), so this path is safe to reach keyless.
  if (provider === "openai" && apiKey) {
    return new OpenAIProvider(apiKey);
  }

  return new MockProvider();
}
