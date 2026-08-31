/**
 * LLM provider factory.
 *
 * Selects a concrete provider from environment configuration, preferring an
 * explicit `LLM_PROVIDER` selection, then auto-selecting xAI (Grok) when an
 * `XAI_API_KEY` is present, and otherwise falling back to the deterministic
 * {@link MockProvider}. This function never throws for a missing key, so the
 * app builds, tests, and runs fully keyless by default.
 */

import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import { XAIProvider } from "./xai";
import type { LLMProvider } from "./types";

export type { LLMProvider, CompleteOptions, BookAnalysis, StudyQuestion } from "./types";
export { MockProvider } from "./mock";
export { OpenAIProvider } from "./openai";
export { XAIProvider } from "./xai";
export { parseJSONResponse } from "./json";

/**
 * Resolve the active LLM provider from environment configuration.
 *
 * Selection order:
 * 1. `LLM_PROVIDER=xai` + `XAI_API_KEY` set -> {@link XAIProvider}.
 * 2. `LLM_PROVIDER=openai` + `OPENAI_API_KEY` set -> {@link OpenAIProvider}.
 * 3. No explicit `LLM_PROVIDER` but `XAI_API_KEY` present -> {@link XAIProvider}.
 * 4. Otherwise -> {@link MockProvider}.
 *
 * Provider constructors do not touch the network or validate the key at import
 * time (only in their constructors), so every path here is safe keyless.
 *
 * @returns the configured provider, or a {@link MockProvider} fallback.
 */
export function getLLMProvider(): LLMProvider {
  const provider = (process.env.LLM_PROVIDER ?? "").toLowerCase();
  const xaiKey = process.env.XAI_API_KEY;
  const openaiKey = process.env.OPENAI_API_KEY;

  if (provider === "xai" && xaiKey) {
    return new XAIProvider(xaiKey);
  }

  if (provider === "openai" && openaiKey) {
    return new OpenAIProvider(openaiKey);
  }

  // No explicit provider selected: auto-select xAI (Grok) when keyed.
  if (!provider && xaiKey) {
    return new XAIProvider(xaiKey);
  }

  return new MockProvider();
}
