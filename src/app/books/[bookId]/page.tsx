"use client";

import { use, useCallback, useEffect, useState } from "react";

interface KeyConcept {
  concept: string;
  importance: number;
  sourceChunkIndexes: number[];
}

interface BookAnalysis {
  summary: string;
  keyConcepts: KeyConcept[];
  topicOutline: string[];
}

interface ExamQuestion {
  id: string;
  question: string;
  answer: string;
  concept: string;
  questionType: "recall" | "application" | "conceptual";
  probability: number;
  rationale: string;
}

interface BookResponse {
  bookId: string;
  meta: { filename: string; kind: string; characters: number };
  chunkCount: number;
  analysis: BookAnalysis | null;
  questions: ExamQuestion[];
  analyzedAt: number | null;
}

const TYPE_LABEL: Record<ExamQuestion["questionType"], string> = {
  recall: "Recall",
  application: "Application",
  conceptual: "Conceptual",
};

function QuestionCard({ q }: { q: ExamQuestion }) {
  const [open, setOpen] = useState(false);
  const pct = Math.round(q.probability * 100);
  return (
    <li className="rounded-lg border border-gray-200 p-4 dark:border-gray-800">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
              {TYPE_LABEL[q.questionType]}
            </span>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
              {pct}% likely
            </span>
            <span className="text-gray-400">{q.concept}</span>
          </div>
          <p className="mt-2 font-medium">{q.question}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-3 text-sm font-medium text-blue-700 underline dark:text-blue-300"
        aria-expanded={open}
      >
        {open ? "Hide answer" : "Show answer"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 text-sm text-gray-700 dark:text-gray-300">
          <p>
            <span className="font-semibold">Answer: </span>
            {q.answer}
          </p>
          <p className="text-gray-500 dark:text-gray-400">{q.rationale}</p>
        </div>
      )}
    </li>
  );
}

export default function BookPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const [data, setData] = useState<BookResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [curriculumText, setCurriculumText] = useState("");
  const [count, setCount] = useState(10);
  const [analyzing, setAnalyzing] = useState(false);

  // Fetch the book without touching React state, so callers control when and
  // how results are applied (this keeps setState out of the effect body).
  const fetchBook = useCallback(async (): Promise<
    { ok: true; data: BookResponse } | { ok: false; error: string }
  > => {
    try {
      const res = await fetch(`/api/books/${bookId}`);
      const json = await res.json();
      if (!res.ok) {
        return { ok: false, error: json.error ?? "Failed to load book." };
      }
      return { ok: true, data: json as BookResponse };
    } catch {
      return { ok: false, error: "Network error while loading the book." };
    }
  }, [bookId]);

  useEffect(() => {
    let active = true;
    fetchBook().then((result) => {
      if (!active) return;
      if (result.ok) {
        setData(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [fetchBook]);

  async function handleAnalyze(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const topics = curriculumText
      .split(/[\n,]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    if (topics.length === 0) {
      setError("Enter at least one curriculum topic or paste your syllabus.");
      return;
    }

    setAnalyzing(true);
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bookId,
          curriculum: { text: curriculumText, topics },
          count,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Analysis failed.");
        return;
      }
      const refreshed = await fetchBook();
      if (refreshed.ok) {
        setData(refreshed.data);
        setError(null);
      } else {
        setError(refreshed.error);
      }
    } catch {
      setError("Network error while analyzing.");
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Book analysis</h1>
        <p className="mt-2 font-mono text-sm text-gray-500">{bookId}</p>
      </header>

      {loading && <p className="text-gray-500">Loading…</p>}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
        </div>
      )}

      {data && (
        <>
          <section className="rounded-lg border border-gray-200 p-6 dark:border-gray-800">
            <h2 className="text-lg font-semibold">Your curriculum</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Paste your syllabus or list topics (one per line or comma
              separated). We use it to rank the most exam-likely questions.
            </p>
            <form onSubmit={handleAnalyze} className="mt-4 flex flex-col gap-3">
              <textarea
                value={curriculumText}
                onChange={(e) => setCurriculumText(e.target.value)}
                rows={4}
                placeholder="e.g. photosynthesis, cellular respiration, chlorophyll"
                className="w-full rounded-lg border border-gray-300 p-3 text-sm dark:border-gray-700 dark:bg-gray-900"
              />
              <div className="flex flex-wrap items-center gap-3">
                <label className="text-sm">
                  Questions:{" "}
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={count}
                    onChange={(e) => setCount(Number(e.target.value))}
                    className="w-20 rounded-lg border border-gray-300 p-1 text-sm dark:border-gray-700 dark:bg-gray-900"
                  />
                </label>
                <button
                  type="submit"
                  disabled={analyzing}
                  className="rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
                >
                  {analyzing ? "Analyzing…" : "Analyze"}
                </button>
              </div>
            </form>
          </section>

          {data.analysis && (
            <section className="flex flex-col gap-4">
              <div>
                <h2 className="text-xl font-semibold">Summary</h2>
                <p className="mt-2 text-gray-700 dark:text-gray-300">
                  {data.analysis.summary}
                </p>
              </div>

              {data.analysis.keyConcepts.length > 0 && (
                <div>
                  <h2 className="text-xl font-semibold">Key concepts</h2>
                  <ul className="mt-2 flex flex-wrap gap-2">
                    {data.analysis.keyConcepts.map((c) => (
                      <li
                        key={c.concept}
                        className="rounded-full border border-gray-200 px-3 py-1 text-sm dark:border-gray-800"
                        title={`importance ${c.importance.toFixed(2)}`}
                      >
                        {c.concept}{" "}
                        <span className="text-gray-400">
                          {Math.round(c.importance * 100)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}

          {data.questions.length > 0 && (
            <section>
              <h2 className="text-xl font-semibold">
                Ultra high-probability questions
              </h2>
              <ol className="mt-3 flex flex-col gap-3">
                {data.questions.map((q) => (
                  <QuestionCard key={q.id} q={q} />
                ))}
              </ol>
            </section>
          )}

          {!data.analysis && !analyzing && (
            <p className="text-gray-500">
              No analysis yet. Add your curriculum above and hit Analyze.
            </p>
          )}
        </>
      )}
    </main>
  );
}
