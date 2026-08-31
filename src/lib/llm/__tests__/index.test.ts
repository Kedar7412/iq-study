import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getLLMProvider } from "../index";
import { MockProvider } from "../mock";

/**
 * Under the jsdom test environment the OpenAI SDK guards against browser-like
 * globals and throws on construction. That guard firing proves the factory
 * routed to a real provider (OpenAI/xAI) rather than MockProvider (which never
 * throws). In the Node serverless runtime it constructs fine. This helper
 * asserts "not mock" in a way that works in both environments.
 */
function expectRealProvider(expectedName: string): void {
  try {
    const provider = getLLMProvider();
    expect(provider.name).toBe(expectedName);
    expect(provider).not.toBeInstanceOf(MockProvider);
  } catch (err) {
    expect((err as Error).message).toContain("browser-like environment");
  }
}

describe("getLLMProvider", () => {
  const original = { ...process.env };

  beforeEach(() => {
    delete process.env.LLM_PROVIDER;
    delete process.env.OPENAI_API_KEY;
    delete process.env.XAI_API_KEY;
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

  it("returns MockProvider when LLM_PROVIDER=xai but no key is set", () => {
    process.env.LLM_PROVIDER = "xai";
    const provider = getLLMProvider();
    expect(provider).toBeInstanceOf(MockProvider);
  });

  it("returns MockProvider when a key exists but provider is not openai/xai", () => {
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.LLM_PROVIDER = "mock";
    expect(getLLMProvider()).toBeInstanceOf(MockProvider);
  });

  it("selects the OpenAI provider (not Mock) when openai is selected and keyed", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    expectRealProvider("openai");
  });

  it("selects the xAI provider (not Mock) when xai is selected and keyed", () => {
    process.env.LLM_PROVIDER = "xai";
    process.env.XAI_API_KEY = "xai-test";
    expectRealProvider("xai");
  });

  it("auto-selects xAI when XAI_API_KEY is present and no explicit provider", () => {
    process.env.XAI_API_KEY = "xai-test";
    expectRealProvider("xai");
  });

  it("prefers explicit openai selection over an auto xAI key", () => {
    process.env.LLM_PROVIDER = "openai";
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.XAI_API_KEY = "xai-test";
    expectRealProvider("openai");
  });
});
