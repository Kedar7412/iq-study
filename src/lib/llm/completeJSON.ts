/**
 * Shared JSON-completion helpers for OpenAI-compatible providers.
 *
 * Both {@link OpenAIProvider} and {@link XAIProvider} ask the model for a JSON
 * object via `response_format: { type: "json_object" }`. Not every model
 * accepts that parameter: some xAI/Grok (and older OpenAI-compatible) models
 * reject it with a hard 400. Rather than letting the whole analysis fail, these
 * helpers detect that specific failure and retry once WITHOUT the
 * `response_format` field, relying on the JSON-only system instruction plus
 * {@link parseJSONResponse} to still yield a clean object.
 *
 * The helpers take an injected "create" function so they can be unit-tested
 * with a stub client and never touch the network.
 */

/** Minimal shape of a chat.completions.create params object we care about. */
export interface ChatCreateParams {
  model: string;
  temperature?: number;
  max_tokens?: number;
  response_format?: { type: "json_object" };
  messages: Array<{ role: "system" | "user"; content: string }>;
}

/** Minimal shape of a chat completion response we read from. */
export interface ChatCreateResult {
  choices: Array<{ message?: { content?: string | null } | null }>;
}

/** A create function compatible with `client.chat.completions.create`. */
export type ChatCreateFn = (
  params: ChatCreateParams,
) => Promise<ChatCreateResult>;

/**
 * Decide whether an error thrown by a chat-completions call indicates that the
 * model does not support the `response_format` / `json_object` parameter.
 *
 * The check is deliberately defensive: it inspects the error's HTTP `status`
 * (400 is what these APIs return for an unsupported parameter) together with a
 * message/param that mentions `response_format` or `json_object`. It also
 * matches messages that describe the parameter as unsupported/invalid even when
 * no numeric status is exposed, so it is robust across SDK error shapes.
 */
export function isResponseFormatUnsupportedError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;

  const err = error as {
    status?: unknown;
    code?: unknown;
    param?: unknown;
    message?: unknown;
    error?: { message?: unknown; param?: unknown; code?: unknown };
  };

  const status = typeof err.status === "number" ? err.status : undefined;
  const param = String(err.param ?? err.error?.param ?? "").toLowerCase();
  const message = String(err.message ?? err.error?.message ?? "").toLowerCase();
  const haystack = `${param} ${message}`;

  const mentionsFormat =
    haystack.includes("response_format") || haystack.includes("json_object");
  if (!mentionsFormat) return false;

  // A 400 that mentions the format parameter is the canonical case.
  if (status === 400) return true;

  // No usable status, but the message calls the parameter out as a problem.
  const soundsUnsupported =
    haystack.includes("unsupported") ||
    haystack.includes("not supported") ||
    haystack.includes("does not support") ||
    haystack.includes("unknown") ||
    haystack.includes("invalid") ||
    haystack.includes("unrecognized");

  return status === undefined && soundsUnsupported;
}

/**
 * Call `create` requesting a JSON object; if the model rejects
 * `response_format`, retry once without it. Any other error propagates.
 *
 * `params` should already include `response_format: { type: "json_object" }`
 * and a system message instructing JSON-only output, so the retry (which drops
 * only `response_format`) still stands a good chance of producing valid JSON.
 */
export async function createJSONWithFallback(
  create: ChatCreateFn,
  params: ChatCreateParams,
): Promise<ChatCreateResult> {
  try {
    return await create(params);
  } catch (error) {
    if (!isResponseFormatUnsupportedError(error)) {
      throw error;
    }
    // Retry without response_format, relying on the JSON-only system
    // instruction plus parseJSONResponse downstream.
    const { response_format: _dropped, ...withoutFormat } = params;
    void _dropped;
    return create(withoutFormat);
  }
}
