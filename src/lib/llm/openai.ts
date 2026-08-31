/**
 * OpenAI-backed LLM provider.
 *
 * Uses the official `openai` SDK and reads `OPENAI_API_KEY` from the
 * environment. This class is only instantiated by {@link getLLMProvider} when a
 * key is actually present, so importing this module never triggers a key check.
 */

import OpenAI from "openai";
import { parseJSONResponse } from "./json";
import type { CompleteOptions, LLMProvider } from "./types";

/** Default model; overridable via the `OPENAI_MODEL` env var. */
const DEFAULT_MODEL = "gpt-4o-mini";

export class OpenAIProvider implements LLMProvider {
  readonly name = "openai";
  private readonly client: OpenAI;
  private readonly model: string;

  /**
   * @param apiKey OpenAI API key. Required; callers must confirm presence.
   */
  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("OpenAIProvider requires a non-empty API key");
    }
    this.client = new OpenAI({ apiKey });
    this.model = process.env.OPENAI_MODEL || DEFAULT_MODEL;
  }

  async complete(prompt: string, opts: CompleteOptions = {}): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      messages: [
        ...(opts.system
          ? [{ role: "system" as const, content: opts.system }]
          : []),
        { role: "user" as const, content: prompt },
      ],
    });
    return response.choices[0]?.message?.content ?? "";
  }

  async completeJSON<T>(
    prompt: string,
    parse: (raw: unknown) => T,
    opts: CompleteOptions = {},
  ): Promise<T> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system" as const,
          content:
            opts.system ??
            "You are a helpful assistant that responds with valid JSON only.",
        },
        { role: "user" as const, content: prompt },
      ],
    });
    const content = response.choices[0]?.message?.content ?? "{}";
    return parse(parseJSONResponse(content));
  }
}
