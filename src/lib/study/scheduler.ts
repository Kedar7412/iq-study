/**
 * Pure SM-2 spaced-repetition scheduler.
 *
 * Implements the classic SuperMemo-2 algorithm: given a review card's current
 * state ({@link ReviewState}) and a self-assessed recall grade (0-5), compute
 * the updated state (easeFactor / interval / repetitions) and the next due
 * date.
 *
 * Kept free of any I/O, dates-from-now defaults aside, so it is trivially
 * deterministic and unit-testable. Callers (the session engine / API routes)
 * own persistence; this module only does the math.
 */

/** Minimum ease factor per the SM-2 specification. */
export const MIN_EASE_FACTOR = 1.3;

/** Default ease factor for a brand-new card. */
export const DEFAULT_EASE_FACTOR = 2.5;

/** A recall grade: 0 (total blackout) to 5 (perfect recall). */
export type RecallGrade = 0 | 1 | 2 | 3 | 4 | 5;

/** The passing threshold: grades >= 3 count as a successful recall. */
export const PASSING_GRADE = 3;

/** The mutable SM-2 state carried by a review card. */
export interface ReviewState {
  /** Ease factor (>= {@link MIN_EASE_FACTOR}); scales successive intervals. */
  easeFactor: number;
  /** Current inter-review interval in days. */
  interval: number;
  /** Number of consecutive successful (grade >= 3) reviews. */
  repetitions: number;
}

/** The result of scheduling a review. */
export interface ScheduleResult extends ReviewState {
  /** The grade that produced this state. */
  lastGrade: RecallGrade;
  /** Next due date (epoch ms). */
  dueDate: number;
}

/** A fresh SM-2 state for a card that has never been reviewed. */
export function initialReviewState(): ReviewState {
  return {
    easeFactor: DEFAULT_EASE_FACTOR,
    interval: 0,
    repetitions: 0,
  };
}

/** Round a float to 2 decimals for stable, readable stored ease factors. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Apply the SM-2 algorithm to a review.
 *
 * - A failing grade (< 3) resets `repetitions` to 0 and `interval` to 1 day so
 *   the card is seen again the next day.
 * - A passing grade (>= 3) advances the card: the first success schedules it in
 *   1 day, the second in 6 days, and thereafter `interval = round(interval *
 *   easeFactor)`.
 * - The ease factor is always nudged by the SM-2 formula and floored at
 *   {@link MIN_EASE_FACTOR}.
 *
 * @param state Current SM-2 state.
 * @param grade Self-assessed recall grade (0-5).
 * @param now Reference time for computing the due date (epoch ms). Defaults to
 *   `Date.now()`; injectable for deterministic tests.
 */
export function scheduleReview(
  state: ReviewState,
  grade: RecallGrade,
  now: number = Date.now(),
): ScheduleResult {
  // SM-2 ease-factor update, floored at the minimum.
  const nextEase = round2(
    Math.max(
      MIN_EASE_FACTOR,
      state.easeFactor + (0.1 - (5 - grade) * (0.08 + (5 - grade) * 0.02)),
    ),
  );

  let repetitions: number;
  let interval: number;

  if (grade < PASSING_GRADE) {
    // Failed recall: restart the repetition streak, review again tomorrow.
    repetitions = 0;
    interval = 1;
  } else {
    repetitions = state.repetitions + 1;
    if (repetitions === 1) {
      interval = 1;
    } else if (repetitions === 2) {
      interval = 6;
    } else {
      interval = Math.round(state.interval * nextEase);
    }
  }

  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const dueDate = now + interval * MS_PER_DAY;

  return {
    easeFactor: nextEase,
    interval,
    repetitions,
    lastGrade: grade,
    dueDate,
  };
}
