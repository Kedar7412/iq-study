import { describe, expect, it } from "vitest";
import { chunkText, DEFAULT_CHUNK_OVERLAP, DEFAULT_CHUNK_SIZE } from "../chunk";

describe("chunkText", () => {
  it("returns an empty array for empty / whitespace text", () => {
    expect(chunkText("")).toEqual([]);
    expect(chunkText("   \n  ")).toEqual([]);
  });

  it("returns a single chunk when text is shorter than the chunk size", () => {
    const chunks = chunkText("hello world", { size: 100, overlap: 10 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual({ index: 0, text: "hello world" });
  });

  it("is deterministic across repeated calls", () => {
    const text = "abcdefghij".repeat(500); // 5000 chars
    const a = chunkText(text);
    const b = chunkText(text);
    expect(a).toEqual(b);
  });

  it("produces overlapping chunks of the expected size and overlap", () => {
    const text = "x".repeat(2500);
    const chunks = chunkText(text, { size: 1000, overlap: 150 });

    // step = 850, so starts at 0, 850, 1700 -> 3 chunks
    expect(chunks).toHaveLength(3);
    expect(chunks[0].text).toHaveLength(1000);
    expect(chunks[1].text).toHaveLength(1000);

    // Verify overlap: last 150 chars of chunk 0 equal first 150 of chunk 1.
    const tail = chunks[0].text.slice(-DEFAULT_CHUNK_OVERLAP);
    const head = chunks[1].text.slice(0, DEFAULT_CHUNK_OVERLAP);
    expect(tail).toEqual(head);

    // Indices are sequential.
    expect(chunks.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it("overlaps trailing content of each chunk with the head of the next", () => {
    // Build text where each position is identifiable (repeating printable set).
    const text = Array.from({ length: 2000 }, (_, i) =>
      String.fromCharCode(33 + (i % 90)),
    ).join("");
    const size = 1000;
    const overlap = 150;
    const chunks = chunkText(text, { size, overlap });

    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1].text;
      const cur = chunks[i].text;
      const overlapLen = Math.min(overlap, prev.length, cur.length);
      expect(cur.slice(0, overlapLen)).toEqual(prev.slice(-overlapLen));
    }
  });

  it("uses the documented defaults", () => {
    expect(DEFAULT_CHUNK_SIZE).toBe(1000);
    expect(DEFAULT_CHUNK_OVERLAP).toBe(150);
  });

  it("throws for invalid options", () => {
    expect(() => chunkText("abc", { size: 0 })).toThrow();
    expect(() => chunkText("abc", { size: 100, overlap: 100 })).toThrow();
    expect(() => chunkText("abc", { size: 100, overlap: -1 })).toThrow();
  });
});
