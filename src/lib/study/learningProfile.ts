/**
 * Onboarding questionnaire and learning-style profiling.
 *
 * A fixed questionnaire probes four VARK-style sensory dimensions
 * (visual / auditory / reading-writing / kinesthetic) plus two behavioural
 * signals (pace and preferred review interval). {@link scoreProfile} is a pure,
 * deterministic function so it is trivially unit-testable and produces the same
 * profile for the same answers every time.
 *
 * The resulting {@link LearningProfile} later personalizes the adaptive study
 * loop (which modality to emphasise, how aggressively to pace, and the default
 * spaced-repetition interval).
 */

import { z } from "zod";

/** The four VARK-style sensory learning dimensions. */
export type LearningStyle =
  | "visual"
  | "auditory"
  | "readingWriting"
  | "kinesthetic";

/** All sensory styles in a stable order (used for deterministic tie-breaks). */
export const LEARNING_STYLES: readonly LearningStyle[] = [
  "visual",
  "auditory",
  "readingWriting",
  "kinesthetic",
] as const;

/** How a single answer contributes to the profile. */
export interface QuestionOption {
  /** Stable option id, submitted by the client. */
  id: string;
  /** Human-readable option label. */
  label: string;
  /** Sensory style this option favours, if any. */
  style?: LearningStyle;
  /**
   * Pace signal: negative = prefers slow/thorough, positive = prefers fast.
   * Summed across answers then normalized to 0-1.
   */
  pace?: number;
  /**
   * Review-frequency signal: negative = spaced-out reviews, positive =
   * frequent reviews. Summed then mapped to a day interval.
   */
  review?: number;
}

/** A single questionnaire item. */
export interface Question {
  /** Stable question id, used as the key in the answers map. */
  id: string;
  /** The prompt shown to the learner. */
  prompt: string;
  /** Mutually exclusive answer options. */
  options: QuestionOption[];
}

/**
 * Fixed onboarding questionnaire (10 questions).
 *
 * Questions 1-8 each map an option to a sensory style; several also carry pace
 * and review signals. Questions 9-10 focus purely on pace and review cadence.
 */
export const QUESTIONNAIRE: readonly Question[] = [
  {
    id: "q1",
    prompt: "When learning something new, what helps you most?",
    options: [
      { id: "q1a", label: "Diagrams, charts, and color-coded notes", style: "visual" },
      { id: "q1b", label: "Listening to an explanation or discussion", style: "auditory" },
      { id: "q1c", label: "Reading a clear written explanation", style: "readingWriting" },
      { id: "q1d", label: "Trying it hands-on right away", style: "kinesthetic" },
    ],
  },
  {
    id: "q2",
    prompt: "You remember a concept best after you have...",
    options: [
      { id: "q2a", label: "Pictured it as a mind map or graph", style: "visual" },
      { id: "q2b", label: "Talked it through out loud", style: "auditory" },
      { id: "q2c", label: "Written a summary in your own words", style: "readingWriting" },
      { id: "q2d", label: "Worked through practice problems", style: "kinesthetic" },
    ],
  },
  {
    id: "q3",
    prompt: "Which study resource do you reach for first?",
    options: [
      { id: "q3a", label: "An infographic or video with visuals", style: "visual" },
      { id: "q3b", label: "A recorded lecture or podcast", style: "auditory" },
      { id: "q3c", label: "A textbook chapter or article", style: "readingWriting" },
      { id: "q3d", label: "An interactive simulation or lab", style: "kinesthetic" },
    ],
  },
  {
    id: "q4",
    prompt: "When giving directions, you tend to...",
    options: [
      { id: "q4a", label: "Draw or picture a map", style: "visual" },
      { id: "q4b", label: "Explain them out loud step by step", style: "auditory" },
      { id: "q4c", label: "Write them down as a list", style: "readingWriting" },
      { id: "q4d", label: "Walk the route or gesture the turns", style: "kinesthetic" },
    ],
  },
  {
    id: "q5",
    prompt: "A concept finally clicks for you when...",
    options: [
      { id: "q5a", label: "You see how the pieces connect visually", style: "visual" },
      { id: "q5b", label: "Someone explains it in conversation", style: "auditory" },
      { id: "q5c", label: "You re-read and annotate the material", style: "readingWriting" },
      { id: "q5d", label: "You apply it to a real example", style: "kinesthetic" },
    ],
  },
  {
    id: "q6",
    prompt: "During a lecture you are most engaged when...",
    options: [
      { id: "q6a", label: "Slides are full of visuals and diagrams", style: "visual" },
      { id: "q6b", label: "The speaker is a great storyteller", style: "auditory" },
      { id: "q6c", label: "There is a detailed handout to follow", style: "readingWriting" },
      { id: "q6d", label: "There are demos or activities to join", style: "kinesthetic" },
    ],
  },
  {
    id: "q7",
    prompt: "To revise before an exam you prefer to...",
    options: [
      { id: "q7a", label: "Make flashcards with images and colors", style: "visual", review: 1 },
      { id: "q7b", label: "Explain topics aloud to a friend", style: "auditory" },
      { id: "q7c", label: "Rewrite your notes into summaries", style: "readingWriting", review: -1 },
      { id: "q7d", label: "Do timed practice questions", style: "kinesthetic", pace: 1 },
    ],
  },
  {
    id: "q8",
    prompt: "You understand feedback best when it is...",
    options: [
      { id: "q8a", label: "Shown with annotated examples", style: "visual" },
      { id: "q8b", label: "Given verbally in a chat", style: "auditory" },
      { id: "q8c", label: "Written out in detail", style: "readingWriting", pace: -1 },
      { id: "q8d", label: "Demonstrated by redoing the task", style: "kinesthetic", pace: 1 },
    ],
  },
  {
    id: "q9",
    prompt: "What is your ideal study pace?",
    options: [
      { id: "q9a", label: "Slow and thorough, one topic at a time", pace: -2 },
      { id: "q9b", label: "Steady and balanced", pace: 0 },
      { id: "q9c", label: "Fast, cover a lot then loop back", pace: 2 },
    ],
  },
  {
    id: "q10",
    prompt: "How often do you like to review what you have learned?",
    options: [
      { id: "q10a", label: "Every day in short bursts", review: 2 },
      { id: "q10b", label: "A few times a week", review: 0 },
      { id: "q10c", label: "Less often, in longer deep sessions", review: -2 },
    ],
  },
];

/** Map from question id to the chosen option id. */
export type QuestionnaireAnswers = Record<string, string>;

/**
 * Zod schema for questionnaire answers: a non-empty object mapping question ids
 * to option ids. Deeper validation (that ids exist) happens in
 * {@link scoreProfile} via {@link validateAnswers}.
 */
export const answersSchema = z.record(z.string(), z.string());

/** Computed learning-style profile. All sensory dims are normalized to 0-1. */
export interface LearningProfile {
  /** Preference for visual material (0-1). */
  visual: number;
  /** Preference for auditory material (0-1). */
  auditory: number;
  /** Preference for reading/writing material (0-1). */
  readingWriting: number;
  /** Preference for hands-on/kinesthetic material (0-1). */
  kinesthetic: number;
  /** Learning pace, 0 (slow/thorough) to 1 (fast). */
  pace: number;
  /** Suggested spaced-repetition interval in days. */
  preferredReviewInterval: number;
  /** The single strongest sensory style. */
  dominantStyle: LearningStyle;
}

/** Look up a question by id. */
function findQuestion(id: string): Question | undefined {
  return QUESTIONNAIRE.find((q) => q.id === id);
}

/**
 * Validate that the submission answers every questionnaire item and that each
 * answer references a real question and option. Returns the list of resolved
 * {@link QuestionOption}s in questionnaire order. Throws on invalid input so
 * callers (route handlers) can return a 400.
 *
 * A partial submission is rejected: a profile derived from a subset of answers
 * is skewed (e.g. a single visual answer yields `visual: 1`) and then drives
 * every downstream adaptation, so we require the complete set before scoring.
 */
export function validateAnswers(
  answers: QuestionnaireAnswers,
): QuestionOption[] {
  // Reject any answer that references an unknown question or option first, so
  // the error is specific rather than a generic "incomplete" message.
  for (const [questionId, optionId] of Object.entries(answers)) {
    const question = findQuestion(questionId);
    if (!question) {
      throw new Error(`Unknown question id: ${questionId}`);
    }
    if (!question.options.some((o) => o.id === optionId)) {
      throw new Error(
        `Unknown option "${optionId}" for question "${questionId}"`,
      );
    }
  }

  // Require an answer for every questionnaire item.
  const missing = QUESTIONNAIRE.filter((q) => !answers[q.id]).map((q) => q.id);
  if (missing.length > 0) {
    throw new Error(
      `Please answer every question. Missing: ${missing.join(", ")}`,
    );
  }

  // Resolve in questionnaire order for a stable, deterministic result.
  return QUESTIONNAIRE.map((question) => {
    const optionId = answers[question.id]!;
    return question.options.find((o) => o.id === optionId)!;
  });
}

/** Clamp a number into [min, max]. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Round to 3 decimals for stable, readable stored values. */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/**
 * Score questionnaire answers into a normalized {@link LearningProfile}.
 *
 * Pure and deterministic: the sensory dimensions are the fraction of
 * style-bearing answers that fell into each style (so they sum to ~1 across the
 * four dims); `pace` is the summed pace signal squashed to 0-1; and
 * `preferredReviewInterval` maps the summed review signal onto a 1-14 day range
 * (more frequent review -> shorter interval).
 *
 * `dominantStyle` is the highest-scoring sensory dimension, with ties broken by
 * the fixed {@link LEARNING_STYLES} order for determinism.
 */
export function scoreProfile(answers: QuestionnaireAnswers): LearningProfile {
  const options = validateAnswers(answers);

  const counts: Record<LearningStyle, number> = {
    visual: 0,
    auditory: 0,
    readingWriting: 0,
    kinesthetic: 0,
  };
  let styleTotal = 0;
  let paceSignal = 0;
  let reviewSignal = 0;

  for (const option of options) {
    if (option.style) {
      counts[option.style] += 1;
      styleTotal += 1;
    }
    if (typeof option.pace === "number") paceSignal += option.pace;
    if (typeof option.review === "number") reviewSignal += option.review;
  }

  // Normalize sensory dims as fractions of style-bearing answers.
  const dims: Record<LearningStyle, number> = {
    visual: 0,
    auditory: 0,
    readingWriting: 0,
    kinesthetic: 0,
  };
  for (const style of LEARNING_STYLES) {
    dims[style] = styleTotal > 0 ? round3(counts[style] / styleTotal) : 0;
  }

  // Dominant style: highest count, ties broken by fixed order.
  let dominantStyle: LearningStyle = LEARNING_STYLES[0];
  for (const style of LEARNING_STYLES) {
    if (counts[style] > counts[dominantStyle]) {
      dominantStyle = style;
    }
  }

  // Pace: squash summed signal (roughly -4..4) into 0-1 around a 0.5 midpoint.
  const pace = round3(clamp(0.5 + paceSignal / 8, 0, 1));

  // Review interval: base 7 days, shifted by the review signal. More frequent
  // review (positive signal) shortens the interval; clamp to 1-14 days.
  const preferredReviewInterval = clamp(
    Math.round(7 - reviewSignal * 1.5),
    1,
    14,
  );

  return {
    visual: dims.visual,
    auditory: dims.auditory,
    readingWriting: dims.readingWriting,
    kinesthetic: dims.kinesthetic,
    pace,
    preferredReviewInterval,
    dominantStyle,
  };
}
