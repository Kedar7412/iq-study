import { describe, expect, it } from "vitest";
import { parseBook, UnsupportedFileTypeError } from "../parse";

describe("parseBook", () => {
  it("parses a .txt file as UTF-8 plain text", async () => {
    const content = "Hello world.\nThis is a plain text book.";
    const { text, meta } = await parseBook(Buffer.from(content), "notes.txt");
    expect(text).toBe(content);
    expect(meta.kind).toBe("txt");
    expect(meta.filename).toBe("notes.txt");
    expect(meta.characters).toBe(content.length);
    expect(meta.bytes).toBe(Buffer.byteLength(content));
  });

  it("parses a .md file as plain text", async () => {
    const content = "# Title\n\nSome **markdown** content.";
    const { text, meta } = await parseBook(Buffer.from(content), "readme.md");
    expect(text).toBe(content);
    expect(meta.kind).toBe("md");
  });

  it("throws UnsupportedFileTypeError for unknown extensions", async () => {
    await expect(
      parseBook(Buffer.from("data"), "image.png"),
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });

  it("throws UnsupportedFileTypeError for files without an extension", async () => {
    await expect(
      parseBook(Buffer.from("data"), "noext"),
    ).rejects.toBeInstanceOf(UnsupportedFileTypeError);
  });
});
