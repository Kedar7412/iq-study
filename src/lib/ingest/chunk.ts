/**
 * Deterministic overlapping text chunking.
 *
 * Splits a body of text into fixed-size, overlapping windows. The output is
 * fully deterministic for a given input and options, which makes it safe to
 * unit-test and to feed into downstream embedding / analysis steps.
 */

/** A single chunk of text with its ordinal position. */
export interface TextChunk {
  /** Zero-based index of this chunk in the sequence. */
  index: number;
  /** The chunk text. */
  text: string;
}

/** Options controlling chunk size and overlap. */
export interface ChunkOptions {
  /** Target chunk size in characters. Default 1000. */
  size?: number;
  /** Number of characters each chunk overlaps with the previous one. Default 150. */
  overlap?: number;
}

export const DEFAULT_CHUNK_SIZE = 1000;
export const DEFAULT_CHUNK_OVERLAP = 150;

/**
 * Split `text` into overlapping chunks of roughly `size` characters.
 *
 * Guarantees:
 * - Deterministic: same input + options always yields identical output.
 * - Overlapping: consecutive chunks share `overlap` trailing/leading chars.
 * - Complete: every character of the input appears in at least one chunk.
 */
export function chunkText(text: string, opts: ChunkOptions = {}): TextChunk[] {
  const size = opts.size ?? DEFAULT_CHUNK_SIZE;
  const overlap = opts.overlap ?? DEFAULT_CHUNK_OVERLAP;

  if (size <= 0) {
    throw new Error("chunkText: size must be a positive integer");
  }
  if (overlap < 0 || overlap >= size) {
    throw new Error(
      "chunkText: overlap must be >= 0 and strictly less than size",
    );
  }

  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (normalized.length === 0) {
    return [];
  }

  const step = size - overlap;
  const chunks: TextChunk[] = [];
  let index = 0;

  for (let start = 0; start < normalized.length; start += step) {
    const end = Math.min(start + size, normalized.length);
    chunks.push({ index, text: normalized.slice(start, end) });
    index += 1;
    if (end >= normalized.length) {
      break;
    }
  }

  return chunks;
}
