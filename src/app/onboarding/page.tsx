"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  QUESTIONNAIRE,
  type LearningProfile,
  type QuestionnaireAnswers,
} from "@/lib/study/learningProfile";

const STYLE_LABEL: Record<LearningProfile["dominantStyle"], string> = {
  visual: "Visual",
  auditory: "Auditory",
  readingWriting: "Reading / Writing",
  kinesthetic: "Kinesthetic",
};

function ProfileSummary({ profile }: { profile: LearningProfile }) {
  const dims: { key: keyof typeof STYLE_LABEL; value: number }[] = [
    { key: "visual", value: profile.visual },
    { key: "auditory", value: profile.auditory },
    { key: "readingWriting", value: profile.readingWriting },
    { key: "kinesthetic", value: profile.kinesthetic },
  ];
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-green-300 bg-green-50 p-6 text-sm dark:border-green-800 dark:bg-green-950">
      <div>
        <h2 className="text-lg font-semibold text-green-900 dark:text-green-200">
          Your learning profile
        </h2>
        <p className="mt-1 text-green-900 dark:text-green-200">
          Dominant style: <strong>{STYLE_LABEL[profile.dominantStyle]}</strong>
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {dims.map((d) => (
          <li key={d.key} className="flex items-center gap-3">
            <span className="w-36 text-green-900 dark:text-green-200">
              {STYLE_LABEL[d.key]}
            </span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-green-200 dark:bg-green-900">
              <span
                className="block h-full bg-green-600"
                style={{ width: `${Math.round(d.value * 100)}%` }}
              />
            </span>
            <span className="w-10 text-right text-green-900 dark:text-green-200">
              {Math.round(d.value * 100)}%
            </span>
          </li>
        ))}
      </ul>
      <p className="text-green-900 dark:text-green-200">
        Pace: <strong>{Math.round(profile.pace * 100)}%</strong> · Review every{" "}
        <strong>{profile.preferredReviewInterval}</strong>{" "}
        {profile.preferredReviewInterval === 1 ? "day" : "days"}
      </p>
      <a
        href="/upload"
        className="inline-block w-fit rounded-lg bg-black px-4 py-2 font-medium text-white dark:bg-white dark:text-black"
      >
        Start studying →
      </a>
    </section>
  );
}

export default function OnboardingPage() {
  const router = useRouter();
  const [answers, setAnswers] = useState<QuestionnaireAnswers>({});
  const [profile, setProfile] = useState<LearningProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load auth + any existing profile without touching state inside the effect.
  const load = useCallback(async (): Promise<
    | { ok: true; authed: boolean; profile: LearningProfile | null }
    | { ok: false; error: string }
  > => {
    try {
      const res = await fetch("/api/onboarding");
      if (res.status === 401) {
        return { ok: true, authed: false, profile: null };
      }
      const json = await res.json();
      if (!res.ok) {
        return { ok: false, error: json.error ?? "Failed to load." };
      }
      return {
        ok: true,
        authed: true,
        profile: (json.profile as LearningProfile | null) ?? null,
      };
    } catch {
      return { ok: false, error: "Network error while loading." };
    }
  }, []);

  useEffect(() => {
    let active = true;
    load().then((result) => {
      if (!active) return;
      if (!result.ok) {
        setError(result.error);
      } else if (!result.authed) {
        router.push("/login");
        return;
      } else {
        setProfile(result.profile);
      }
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [load, router]);

  function selectOption(questionId: string, optionId: string) {
    setAnswers((prev) => ({ ...prev, [questionId]: optionId }));
  }

  const allAnswered = QUESTIONNAIRE.every((q) => answers[q.id]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!allAnswered) {
      setError("Please answer every question.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Failed to save your answers.");
        return;
      }
      setProfile(json.profile as LearningProfile);
    } catch {
      setError("Network error while saving.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-6 py-16">
      <header>
        <h1 className="text-3xl font-bold tracking-tight">
          How do you learn best?
        </h1>
        <p className="mt-2 text-gray-600 dark:text-gray-300">
          Answer a few quick questions. We use them to profile your optimal
          learning method and personalize your study loop.
        </p>
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

      {!loading && profile && <ProfileSummary profile={profile} />}

      {!loading && !profile && (
        <form onSubmit={handleSubmit} className="flex flex-col gap-8">
          {QUESTIONNAIRE.map((q, index) => (
            <fieldset key={q.id} className="flex flex-col gap-3">
              <legend className="font-medium">
                {index + 1}. {q.prompt}
              </legend>
              <div className="flex flex-col gap-2">
                {q.options.map((opt) => {
                  const checked = answers[q.id] === opt.id;
                  return (
                    <label
                      key={opt.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${
                        checked
                          ? "border-black bg-gray-50 dark:border-white dark:bg-gray-900"
                          : "border-gray-200 dark:border-gray-800"
                      }`}
                    >
                      <input
                        type="radio"
                        name={q.id}
                        value={opt.id}
                        checked={checked}
                        onChange={() => selectOption(q.id, opt.id)}
                        className="h-4 w-4"
                      />
                      <span>{opt.label}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <button
            type="submit"
            disabled={submitting || !allAnswered}
            className="w-fit rounded-lg bg-black px-4 py-2 font-medium text-white disabled:opacity-50 dark:bg-white dark:text-black"
          >
            {submitting ? "Saving…" : "See my learning profile"}
          </button>
        </form>
      )}
    </main>
  );
}
