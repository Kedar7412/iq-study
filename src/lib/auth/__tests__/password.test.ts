import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../password";

describe("password hashing", () => {
  it("round-trips: a correct password verifies against its hash", async () => {
    const hash = await hashPassword("correct horse battery staple");
    expect(hash).not.toBe("correct horse battery staple");
    expect(await verifyPassword("correct horse battery staple", hash)).toBe(
      true,
    );
  });

  it("rejects an incorrect password", async () => {
    const hash = await hashPassword("s3cret-password");
    expect(await verifyPassword("wrong-password", hash)).toBe(false);
  });

  it("produces distinct hashes for the same password (salting)", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("returns false for an empty hash", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
  });
});
