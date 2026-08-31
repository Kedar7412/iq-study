"use client";

import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";

type QuestionType = "recall" | "application" | "conceptual";
type LearningStyle =
  | "visual"
  | "auditory"
  | "readingWriting"
  | "kinesthetic";

interface StudyCard {
  cardId: string;
  questionId: string;
  question: string;
  answer: string;
  concept: string;
  questionType: QuestionType;
  prompt: string;
}

interface ConceptNode {
  concept: string;
  importance: number;
  mastery: number;
}

interface ConceptEdge {
  source: string;
  target: string;
  weight: number;
}

interface ConceptGraph {
  nodes: ConceptNode[];
  edges: ConceptEdge[];
}

interface StudyState {
  card: StudyCard | null;
  dueCount: number;
  totalCards: number;
  mastery: number;
  conceptMastery: Record<string, number>;
  conceptGraph: ConceptGraph;
  dominantStyle: LearningStyle;
}

const STYLE_LABEL: Record<LearningStyle, string> = {
  visual: "Visual",
  auditory: "Auditory",
  readingWriting: "Reading / Writing",
  kinesthetic: "Kinesthetic",
};

const TYPE_LABEL: Record<QuestionType, string> = {
  recall: "Recall",
  application: "Application",
  conceptual: "Conceptual",
};

const GRADES: { grade: number; label: string }[] = [
  { grade: 0, label: "Blackout" },
  { grade: 1, label: "Wrong" },
  { grade: 2, label: "Almost" },
  { grade: 3, label: "Hard" },
  { grade: 4, label: "Good" },
  { grade: 5, label: "Easy" },
];

/** Colour a mastery value (0-1) from red (weak) through amber to green. */
function masteryColor(mastery: number): string {
  const hue = Math.round(mastery * 120); // 0 = red, 120 = green
  return `hsl(${hue}, 70%, 45%)`;
}

/** Deterministic circular layout for the concept web. */
function ConceptWeb({
  graph,
}: {
  graph: ConceptGraph;
}) {
  if (graph.nodes.length === 0) {
    return (
      <p className="text-sm text-gray-500">
        Analyze this book to build your concept web.
      </p>
    );
  }

  const size = 320;
  const center = size / 2;
  const radius = size / 2 - 44;
  const n = graph.nodes.length;

  const positions = new Map<string, { x: number; y: number }>();
  graph.nodes.forEach((node, i) => {
    const angle = n === 1 ? -Math.PI / 2 : (2 * Math.PI * i) / n - Math.PI / 2;
    positions.set(node.concept, {
      x: center + radius * Math.cos(angle),
      y: center + radius * Math.sin(angle),
    });
  });

  return (
    <svg
      viewBox={`0 0 ${size} ${size}`}
      className="mx-auto h-auto w-full max-w-sm"
      role="img"
      aria-label="Concept web coloured by mastery"
    >
      {graph.edges.map((edge, i) => {
        const a = positions.get(edge.source);
        const b = positions.get(edge.target);
        if (!a || !b) return null;
        return (
          <line
            key={`e${i}`}
            x1={a.x}
            y1={a.y}
            x2={b.x}
            y2={b.y}
            stroke="currentColor"
            className="text-gray-300 dark:text-gray-700"
            strokeWidth={Math.min(4, edge.weight)}
          />
        );
      })}
      {graph.nodes.map((node) => {
        const p = positions.get(node.concept);
        if (!p) return null;
        const r = 8 + node.importance * 6;
        return (
          <g key={node.concept}>
            <circle
              cx={p.x}
              cy={p.y}
              r={r}
              fill={masteryColor(node.mastery)}
              stroke="white"
              strokeWidth={1.5}
            >
              <title>{`${node.concept} — ${Math.round(
                node.mastery * 100,
              )}% mastered`}</title>
            </circle>
            <text
              x={p.x}
              y={p.y - r - 4}
              textAnchor="middle"
              className="fill-gray-700 text-[9px] dark:fill-gray-200"
            >
              {node.concept.length > 16
                ? `${node.concept.slice(0, 15)}…`
                : node.concept}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

export default function StudyPage({
  params,
}: {
  params: Promise<{ bookId: string }>;
}) {
  const { bookId } = use(params);
  const [state, setState] = useState<StudyState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [grading, setGrading] = useState(false);

  const fetchNext = useCallback(async (): Promise<
    { ok: true; data: StudyState } | { ok: false; error: string }
  > => {
    try {
      const res = await fetch(`/api/study/${bookId}/next`);
      const json = await res.json();
      if (!res.ok) {
        return { ok: false, error: json.error ?? "Failed to load study loop." };
      }
      return { ok: true, data: json as StudyState };
    } catch {
      return { ok: false, error: "Network error while loading the study loop." };
    }
  }, [bookId]);

  useEffect(() => {
    let active = true;
    fetchNext().then((result) => {
      if (!active) return;
      if (result.ok) {
        setState(result.data);
        setError(null);
      } else {
        setError(result.error);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [fetchNext]);

  async function submitGrade(grade: number) {
    if (!state?.card || grading) return;
    setGrading(true);
    setError(null);
    try {
      const res = await fetch(`/api/study/${bookId}/grade`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardId: state.card.cardId, grade }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to grade card.");
        return;
      }
      setState((prev) =>
        prev
          ? {
              ...prev,
              card: json.card,
              dueCount: json.dueCount,
              totalCards: json.totalCards,
              mastery: json.mastery,
              conceptMastery: json.conceptMastery,
              conceptGraph: {
                ...prev.conceptGraph,
                nodes: prev.conceptGraph.nodes.map((node) => ({
                  ...node,
                  mastery: json.conceptMastery[node.concept] ?? node.mastery,
                })),
              },
            }
          : prev,
      );
      setRevealed(false);
    } catch {
      setError("Network error while grading.");
    } finally {
      setGrading(false);
    }
  }

  const masteryPct = state ? Math.round(state.mastery * 100) : 0;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">Study loop</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Active recall + spaced repetition. Try to answer before you reveal,
          then grade yourself honestly so we can schedule the next review.
        </p>
        {state && (
          <p className="mt-1 text-sm text-gray-500">
            Tuned for your{" "}
            <strong>{STYLE_LABEL[state.dominantStyle]}</strong> learning style.
          </p>
        )}
      </header>

      {loading && <p className="text-gray-500">Loading…</p>}

      {error && (
        <div
          role="alert"
          className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
        >
          {error}
          <div className="mt-2">
            <Link href={`/books/${bookId}`} className="underline">
              Go to book analysis
            </Link>
          </div>
        </div>
      )}

      {state && (
        <>
          <section className="flex flex-col gap-2">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium">Overall mastery</span>
              <span className="text-gray-500">
                {masteryPct}% · {state.dueCount} due · {state.totalCards} cards
              </span>
            </div>
            <span className="h-2 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-800">
              <span
                className="block h-full"
                style={{
                  width: `${masteryPct}%`,
                  backgroundColor: masteryColor(state.mastery),
                }}
              />
            </span>
          </section>

          {state.card ? (
            <section className="rounded-lg border border-gray-200 p-6 dark:border-gray-800">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="rounded-full bg-gray-100 px-2 py-0.5 font-medium text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                  {TYPE_LABEL[state.card.questionType]}
                </span>
                <span className="text-gray-400">{state.card.concept}</span>
              </div>
              <p className="mt-3 text-lg font-medium">{state.card.question}</p>
              <p className="mt-2 text-sm italic text-blue-700 dark:text-blue-300">
                {state.card.prompt}
              </p>

              {!revealed ? (
                <button
                  type="button"
                  onClick={() => setRevealed(true)}
                  className="mt-5 rounded-lg bg-black px-4 py-2 font-medium text-white dark:bg-white dark:text-black"
                >
                  Reveal answer
                </button>
              ) : (
                <div className="mt-4 space-y-4">
                  <div className="rounded-lg bg-gray-50 p-4 text-sm dark:bg-gray-900">
                    <span className="font-semibold">Answer: </span>
                    {state.card.answer}
                  </div>
                  <div>
                    <p className="text-sm font-medium">
                      How well did you recall it?
                    </p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {GRADES.map((g) => (
                        <button
                          key={g.grade}
                          type="button"
                          disabled={grading}
                          onClick={() => submitGrade(g.grade)}
                          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 dark:border-gray-700 dark:hover:bg-gray-900"
                        >
                          {g.grade} · {g.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </section>
          ) : (
            <section className="rounded-lg border border-green-300 bg-green-50 p-6 text-sm dark:border-green-800 dark:bg-green-950">
              <h2 className="text-lg font-semibold text-green-900 dark:text-green-200">
                All caught up 🎉
              </h2>
              <p className="mt-1 text-green-900 dark:text-green-200">
                No cards are due right now. Come back later for your next
                scheduled review, or revisit the analysis.
              </p>
              <Link
                href={`/books/${bookId}`}
                className="mt-3 inline-block underline"
              >
                Back to book analysis
              </Link>
            </section>
          )}

          <section>
            <h2 className="text-xl font-semibold">The web forming in your brain</h2>
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-300">
              Related concepts link when they share source passages. Nodes turn
              greener as you master them.
            </p>
            <div className="mt-4 rounded-lg border border-gray-200 p-4 dark:border-gray-800">
              <ConceptWeb graph={state.conceptGraph} />
            </div>
          </section>
        </>
      )}
    </main>
  );
}
