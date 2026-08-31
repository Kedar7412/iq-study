/**
 * xAI (Grok) LLM provider.
 *
 * xAI's API is OpenAI-compatible, so this reuses the official `openai` SDK with
 * a different `baseURL`. It reads `XAI_API_KEY` (checked by the caller) and the
 * model from `XAI_MODEL`. Like {@link OpenAIProvider}, it is only instantiated
 * by {@link getLLMProvider} when a key is present, so importing this module
 * never triggers a key check or a network call.
 */

import OpenAI from "openai";
import { createJSONWithFallback } from "./completeJSON";
import { parseJSONResponse } from "./json";
import type { CompleteOptions, LLMProvider } from "./types";

/** xAI OpenAI-compatible API base URL. */
const XAI_BASE_URL = "https://api.x.ai/v1";

/**
 * Default model; a cost-effective current xAI chat model. This is a moving
 * target across xAI's lineup, so production deployments are expected to pin an
 * explicit model via the `XAI_MODEL` env var rather than rely on this default.
 * It exists mainly so a keyed user without `XAI_MODEL` still gets a working
 * model; if xAI retires it, set `XAI_MODEL` to a current model name.
 */
const DEFAULT_MODEL = "grok-3-mini";

/**
 * Instruction appended to the system prompt for JSON completions so output
 * stays a single valid JSON object even if a given model ignores
 * `response_format`.
 */
const JSON_ONLY_INSTRUCTION =
  "Respond with a single valid JSON object only. Do not include any prose, " +
  "explanation, or markdown code fences.";

export class XAIProvider implements LLMProvider {
  readonly name = "xai";
  private readonly client: OpenAI;
  private readonly model: string;

  /**
   * @param apiKey xAI API key. Required; callers must confirm presence.
   */
  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error("XAIProvider requires a non-empty API key");
    }
    this.client = new OpenAI({ apiKey, baseURL: XAI_BASE_URL });
    this.model = process.env.XAI_MODEL || DEFAULT_MODEL;
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
    const baseSystem =
      opts.system ??
      "You are a helpful assistant that responds with valid JSON only.";
    // Request a JSON object, but fall back to a plain call (relying on the
    // JSON-only system instruction + parseJSONResponse) if the Grok model
    // rejects the response_format parameter with a 400.
    const response = await createJSONWithFallback(
      (params) => this.client.chat.completions.create(params),
      {
        model: this.model,
        temperature: opts.temperature,
        max_tokens: opts.maxTokens,
        response_format: { type: "json_object" },
        messages: [
          {
            role: "system" as const,
            content: `${baseSystem}\n\n${JSON_ONLY_INSTRUCTION}`,
          },
          { role: "user" as const, content: prompt },
        ],
      },
    );
    const content = response.choices[0]?.message?.content ?? "{}";
    return parse(parseJSONResponse(content));
  }
}
