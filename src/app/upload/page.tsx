"use client";

import { useState } from "react";

interface UploadMeta {
  filename: string;
  kind: string;
  bytes: number;
  characters: number;
  pages?: number;
}

interface UploadResult {
  bookId: string;
  meta: UploadMeta;
  chunkCount: number;
}

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "uploading">("idle");
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError("Please choose a file to upload.");
      return;
    }

    const formData = new FormData();
    formData.append("file", file);

    setStatus("uploading");
    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();
      if (!response.ok) {
        setError(data.error ?? "Upload failed.");
        return;
      }
      setResult(data as UploadResult);
    } catch {
      setError("Network error while uploading. Please try again.");
    } finally {
      setStatus("idle");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Upload a book</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Upload a <code>.txt</code>, <code>.md</code>, or <code>.pdf</code>{" "}
          file. IQ Study extracts the text and splits it into chunks ready for
          analysis.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <input
          type="file"
          accept=".txt,.md,.pdf,text/plain,text/markdown,application/pdf"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full rounded-lg border border-gray-300 p-3 text-sm dark:border-gray-700"
        />
        <button
          type="submit"
          disabled={status === "uploading"}
          className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
        >
          {status === "uploading" ? "Uploading…" : "Upload"}
        </button>
      </form>

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {result && (
        <div className="rounded-lg border border-green-300 bg-green-50 p-4 text-sm text-green-900 dark:border-green-800 dark:bg-green-950 dark:text-green-200">
          <p className="font-semibold">Upload complete</p>
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="font-medium">Book ID</dt>
            <dd className="font-mono">{result.bookId}</dd>
            <dt className="font-medium">File</dt>
            <dd>
              {result.meta.filename} ({result.meta.kind})
            </dd>
            <dt className="font-medium">Characters</dt>
            <dd>{result.meta.characters.toLocaleString()}</dd>
            {result.meta.pages !== undefined && (
              <>
                <dt className="font-medium">Pages</dt>
                <dd>{result.meta.pages}</dd>
              </>
            )}
            <dt className="font-medium">Chunks</dt>
            <dd>{result.chunkCount}</dd>
          </dl>
          <a
            href={`/books/${result.bookId}`}
            className="mt-4 inline-block rounded-lg bg-black px-4 py-2 font-medium text-white dark:bg-white dark:text-black"
          >
            Add curriculum &amp; analyze →
          </a>
        </div>
      )}
    </main>
  );
}
