import { describe, expect, it, vi } from "vitest";
import {
  createJSONWithFallback,
  isResponseFormatUnsupportedError,
  type ChatCreateParams,
  type ChatCreateResult,
} from "../completeJSON";

const PARAMS: ChatCreateParams = {
  model: "test-model",
  response_format: { type: "json_object" },
  messages: [
    { role: "system", content: "JSON only." },
    { role: "user", content: "hi" },
  ],
};

const OK: ChatCreateResult = {
  choices: [{ message: { content: '{"ok":true}' } }],
};

describe("isResponseFormatUnsupportedError", () => {
  it("matches a 400 that mentions response_format", () => {
    expect(
      isResponseFormatUnsupportedError({
        status: 400,
        message: "response_format is not supported by this model",
      }),
    ).toBe(true);
  });

  it("matches a 400 that mentions json_object via nested error", () => {
    expect(
      isResponseFormatUnsupportedError({
        status: 400,
        error: { message: "the json_object type is unsupported" },
      }),
    ).toBe(true);
  });

  it("matches a statusless message that calls the format unsupported", () => {
    expect(
      isResponseFormatUnsupportedError({
        message: "Unknown parameter: response_format",
      }),
    ).toBe(true);
  });

  it("does not match unrelated 400 errors", () => {
    expect(
      isResponseFormatUnsupportedError({
        status: 400,
        message: "invalid api key",
      }),
    ).toBe(false);
  });

  it("does not match a 429 rate-limit that mentions the format", () => {
    // A non-400 status with no 'unsupported' wording should not trigger a
    // pointless retry; rate limits are not a format problem.
    expect(
      isResponseFormatUnsupportedError({
        status: 429,
        message: "rate limited on response_format requests",
      }),
    ).toBe(false);
  });

  it("returns false for non-object inputs", () => {
    expect(isResponseFormatUnsupportedError(null)).toBe(false);
    expect(isResponseFormatUnsupportedError("boom")).toBe(false);
    expect(isResponseFormatUnsupportedError(undefined)).toBe(false);
  });
});

describe("createJSONWithFallback", () => {
  it("returns the first result on the happy path (no retry)", async () => {
    const create = vi.fn().mockResolvedValue(OK);
    const result = await createJSONWithFallback(create, PARAMS);
    expect(result).toBe(OK);
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].response_format).toEqual({
      type: "json_object",
    });
  });

  it("retries without response_format when the format is unsupported", async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce({
        status: 400,
        message: "response_format json_object is not supported",
      })
      .mockResolvedValueOnce(OK);

    const result = await createJSONWithFallback(create, PARAMS);
    expect(result).toBe(OK);
    expect(create).toHaveBeenCalledTimes(2);
    // The retry must drop response_format but keep the messages/model.
    const retryParams = create.mock.calls[1]![0];
    expect(retryParams.response_format).toBeUndefined();
    expect(retryParams.model).toBe("test-model");
    expect(retryParams.messages).toEqual(PARAMS.messages);
  });

  it("rethrows unrelated errors without retrying", async () => {
    const create = vi
      .fn()
      .mockRejectedValue({ status: 401, message: "invalid api key" });

    await expect(createJSONWithFallback(create, PARAMS)).rejects.toMatchObject({
      status: 401,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
