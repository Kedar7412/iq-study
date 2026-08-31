/**
 * Learning-style-aware prompt copy for the active-recall loop.
 *
 * Given a learner's {@link LearningProfile} and the {@link ExamQuestion} being
 * reviewed, produce a short instruction that frames the recall attempt in the
 * modality that suits them best (visualise it, say it aloud, write it out, work
 * it hands-on). This is the "push your brain" nudge that makes the same
 * flashcard feel different for different learners.
 *
 * Pure and deterministic so it can be unit-tested and rendered on the server.
 */

import type { ExamQuestion } from "@/lib/analyze/types";
import type {
  LearningProfile,
  LearningStyle,
} from "@/lib/study/learningProfile";

/** A neutral profile used when a learner has not completed onboarding. */
export function defaultProfile(): LearningProfile {
  return {
    visual: 0.25,
    auditory: 0.25,
    readingWriting: 0.25,
    kinesthetic: 0.25,
    pace: 0.5,
    preferredReviewInterval: 7,
    dominantStyle: "readingWriting",
  };
}

const STYLE_NUDGE: Record<LearningStyle, string> = {
  visual: "Picture it as a diagram or mind-map before you reveal the answer.",
  auditory: "Say your answer out loud, as if explaining it to a friend.",
  readingWriting: "Jot down your answer in your own words, then check it.",
  kinesthetic: "Work through a concrete example or apply it before revealing.",
};

/**
 * Build the adaptive prompt for a question.
 *
 * Combines a modality nudge (from the dominant style) with a light framing of
 * the question type, so conceptual/application items read as "connect the web"
 * rather than plain recall.
 */
export function adaptivePrompt(
  profile: LearningProfile,
  question: ExamQuestion,
): string {
  const nudge = STYLE_NUDGE[profile.dominantStyle];
  const typeFrame =
    question.questionType === "conceptual"
      ? "Connect this to what you already know."
      : question.questionType === "application"
        ? "Focus on how you would use this."
        : "Recall the key fact.";
  return `${typeFrame} ${nudge}`;
}
