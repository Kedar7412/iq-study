/**
 * POST /api/upload
 *
 * Accepts a multipart/form-data upload of a book file (`.txt`, `.md`, `.pdf`),
 * extracts its text, chunks it deterministically, persists it, and returns
 * `{ bookId, meta, chunkCount }`. Input is validated with zod and a max file
 * size is enforced.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import { parseBook, UnsupportedFileTypeError } from "@/lib/ingest/parse";
import { chunkText } from "@/lib/ingest/chunk";
import { generateBookId, getBookStore } from "@/lib/store";

// Ensure this route runs on the Node.js runtime (PDF parsing needs it).
export const runtime = "nodejs";

/** Maximum accepted upload size: 10 MB. */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

const uploadSchema = z.object({
  file: z
    .instanceof(File, { message: "A file upload is required." })
    .refine((f) => f.size > 0, { message: "The uploaded file is empty." })
    .refine((f) => f.size <= MAX_FILE_BYTES, {
      message: `File exceeds the ${MAX_FILE_BYTES / (1024 * 1024)}MB limit.`,
    }),
});

export async function POST(request: Request): Promise<NextResponse> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Request must be multipart/form-data." },
      { status: 400 },
    );
  }

  const parsed = uploadSchema.safeParse({ file: formData.get("file") });
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid upload." },
      { status: 400 },
    );
  }

  const { file } = parsed.data;

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { text, meta } = await parseBook(buffer, file.name);
    const chunks = chunkText(text);

    if (chunks.length === 0) {
      return NextResponse.json(
        { error: "No readable text could be extracted from the file." },
        { status: 422 },
      );
    }

    const bookId = generateBookId();
    await getBookStore().save({
      bookId,
      meta,
      text,
      chunks,
      createdAt: Date.now(),
    });

    return NextResponse.json({ bookId, meta, chunkCount: chunks.length });
  } catch (err) {
    if (err instanceof UnsupportedFileTypeError) {
      return NextResponse.json({ error: err.message }, { status: 415 });
    }
    return NextResponse.json(
      { error: "Failed to process the uploaded file." },
      { status: 500 },
    );
  }
}
