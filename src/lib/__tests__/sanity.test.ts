import { describe, expect, it } from "vitest";

/**
 * Trivial sanity test to confirm the Vitest pipeline runs.
 * Replaced/expanded by real unit tests in later features.
 */
describe("sanity", () => {
  it("runs the test pipeline", () => {
    expect(1 + 1).toBe(2);
  });
});
