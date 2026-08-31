/**
 * Book ingestion: extract plain text from an uploaded file.
 *
 * Supports `.txt` and `.md` natively (decoded as UTF-8) and `.pdf` via
 * {@link https://github.com/unjs/unpdf unpdf}, a serverless-friendly PDF text
 * extractor that runs on the Vercel Node runtime without native bindings.
 */

/** Metadata describing a parsed source file. */
export interface ParsedBookMeta {
  /** Original filename as uploaded. */
  filename: string;
  /** Detected file kind. */
  kind: "txt" | "md" | "pdf";
  /** Size of the source buffer in bytes. */
  bytes: number;
  /** Number of characters of extracted text. */
  characters: number;
  /** Number of pages (PDF only). */
  pages?: number;
}

/** Result of parsing an uploaded book file. */
export interface ParsedBook {
  /** Extracted plain text. */
  text: string;
  /** Metadata about the source. */
  meta: ParsedBookMeta;
}

/** Error thrown when an uploaded file type is not supported. */
export class UnsupportedFileTypeError extends Error {
  constructor(public readonly filename: string) {
    super(
      `Unsupported file type for "${filename}". Supported types: .txt, .md, .pdf`,
    );
    this.name = "UnsupportedFileTypeError";
  }
}

function fileExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : "";
}

/**
 * Extract plain text from an uploaded file.
 *
 * @param buffer   Raw file contents.
 * @param filename Original filename (used to detect the type by extension).
 * @throws {UnsupportedFileTypeError} when the extension is not recognised.
 */
export async function parseBook(
  buffer: Buffer | Uint8Array,
  filename: string,
): Promise<ParsedBook> {
  const bytes = buffer.byteLength;
  const ext = fileExtension(filename);

  if (ext === "txt" || ext === "md") {
    const text = Buffer.from(buffer).toString("utf-8");
    return {
      text,
      meta: {
        filename,
        kind: ext,
        bytes,
        characters: text.length,
      },
    };
  }

  if (ext === "pdf") {
    // Lazy import so the (heavier) PDF stack is only loaded when actually used.
    const { extractText, getDocumentProxy } = await import("unpdf");
    const data = new Uint8Array(buffer);
    const pdf = await getDocumentProxy(data);
    const { totalPages, text: pageText } = await extractText(pdf, {
      mergePages: true,
    });
    const text = Array.isArray(pageText) ? pageText.join("\n\n") : pageText;
    return {
      text,
      meta: {
        filename,
        kind: "pdf",
        bytes,
        characters: text.length,
        pages: totalPages,
      },
    };
  }

  throw new UnsupportedFileTypeError(filename);
}
