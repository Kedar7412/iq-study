// @vitest-environment node
// jose's HS256 signing requires a Node-realm Uint8Array; jsdom's realm-crossed
// typed arrays fail jose's key type check, so run these tests under node.
import { describe, expect, it } from "vitest";
import { signSession, verifySession } from "../token";

describe("session token", () => {
  it("round-trips: a signed token verifies back to its payload", async () => {
    const payload = { sub: "user_123", email: "learner@example.com" };
    const token = await signSession(payload);
    expect(typeof token).toBe("string");
    expect(token.split(".")).toHaveLength(3); // header.payload.signature

    const verified = await verifySession(token);
    expect(verified).toEqual(payload);
  });

  it("returns null for a tampered token", async () => {
    const token = await signSession({ sub: "u1", email: "a@b.com" });
    const tampered = `${token}tamper`;
    expect(await verifySession(tampered)).toBeNull();
  });

  it("returns null for garbage and empty tokens", async () => {
    expect(await verifySession("")).toBeNull();
    expect(await verifySession("not-a-jwt")).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const original = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "secret-a-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    const token = await signSession({ sub: "u1", email: "a@b.com" });

    process.env.AUTH_SECRET = "secret-b-bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
    expect(await verifySession(token)).toBeNull();

    // Restore original env for isolation.
    if (original === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = original;
  });
});
