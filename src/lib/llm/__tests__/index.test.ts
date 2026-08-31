import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLLMProvider } from "../index";
import { MockProvider } from "../mock";

describe("getLLMProvider", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENAI_API_KEY;
  });

  afterEach(() => {
    process.env = { ...original };
  });

  it("returns MockProvider when no key is set (does not throw)", () => {
    const provider = getLLMProvider();
    expect(provider).toBeInstanceOf(MockProvider);
    expect(provider.name).toBe("mock");
  });

  it("returns MockProvider when LLM_PROVIDER=openai but no key is set", () => {
    process.env.LLM_PROVIDER = "openai";
    const provider = getLLMProvider();
    expect(provider).toBeInstanceOf(MockProvider);
  });

  it("returns MockProvider when a key exists but provider is not openai", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.LLM_PROVIDER = "mock";
    expect(getLLMProvider()).toBeInstanceOf(MockProvider);
  });

  it("selects the OpenAI provider (not Mock) when openai is selected and keyed", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    // Under the jsdom test environment the OpenAI SDK guards against
    // browser-like globals and throws on construction. That guard firing
    // proves the factory routed to OpenAIProvider rather than MockProvider
    // (which never throws). In the Node serverless runtime it constructs fine.
    try {
      const provider = getLLMProvider();
      expect(provider.name).toBe("openai");
      expect(provider).not.toBeInstanceOf(MockProvider);
    } catch (err) {
      expect((err as Error).message).toContain("browser-like environment");
    }
  });
});
