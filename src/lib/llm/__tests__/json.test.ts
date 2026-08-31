import { describe, expect, it } from "vitest";
import { parseJSONResponse } from "../json";

describe("parseJSONResponse", () => {
  it("parses clean JSON", () => {
    expect(parseJSONResponse('{"summary":"hi","keywords":["a","b"]}')).toEqual({
      summary: "hi",
      keywords: ["a", "b"],
    });
  });

  it("parses JSON wrapped in a ```json code fence", () => {
    const input = '```json\n{"summary":"hi","keywords":["a"]}\n```';
    expect(parseJSONResponse(input)).toEqual({ summary: "hi", keywords: ["a"] });
  });

  it("parses JSON wrapped in a bare ``` code fence", () => {
    const input = '```\n{"ok":true}\n```';
    expect(parseJSONResponse(input)).toEqual({ ok: true });
  });

  it("extracts JSON embedded in surrounding prose", () => {
    const input =
      'Sure! Here is the result:\n{"summary":"x","keywords":[]}\nHope that helps.';
    expect(parseJSONResponse(input)).toEqual({ summary: "x", keywords: [] });
  });

  it("handles braces inside string values when extracting", () => {
    const input = 'noise {"text":"a } b { c","n":1} trailing';
    expect(parseJSONResponse(input)).toEqual({ text: "a } b { c", n: 1 });
  });

  it("throws on input with no JSON object", () => {
    expect(() => parseJSONResponse("no json here")).toThrow();
  });

  it("throws on an unbalanced / malformed object", () => {
    expect(() => parseJSONResponse('{"broken": ')).toThrow();
  });
});
