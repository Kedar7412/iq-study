import { describe, expect, it } from "vitest";
import {
  DEFAULT_EASE_FACTOR,
  MIN_EASE_FACTOR,
  initialReviewState,
  scheduleReview,
} from "../scheduler";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

describe("scheduleReview (SM-2)", () => {
  it("advances interval and repetitions on a high grade", () => {
    const first = scheduleReview(initialReviewState(), 5, NOW);
    expect(first.repetitions).toBe(1);
    expect(first.interval).toBe(1);
    expect(first.dueDate).toBe(NOW + 1 * DAY);
    // Ease factor should not drop below default on a perfect grade.
    expect(first.easeFactor).toBeGreaterThanOrEqual(DEFAULT_EASE_FACTOR);

    const second = scheduleReview(first, 5, NOW);
    expect(second.repetitions).toBe(2);
    expect(second.interval).toBe(6);

    const third = scheduleReview(second, 5, NOW);
    expect(third.repetitions).toBe(3);
    // interval = round(previous interval * easeFactor) > 6
    expect(third.interval).toBeGreaterThan(6);
  });

  it("grows the interval over successive successful reviews", () => {
    let state = initialReviewState();
    const intervals: number[] = [];
    for (let i = 0; i < 5; i += 1) {
      const result = scheduleReview(state, 4, NOW);
      intervals.push(result.interval);
      state = result;
    }
    // Strictly non-decreasing, and later intervals clearly larger than early.
    expect(intervals[intervals.length - 1]).toBeGreaterThan(intervals[1]);
    for (let i = 1; i < intervals.length; i += 1) {
      expect(intervals[i]).toBeGreaterThanOrEqual(intervals[i - 1]);
    }
  });

  it("resets repetitions and interval on a failing grade", () => {
    // Build up a streak first.
    let state = initialReviewState();
    state = scheduleReview(state, 5, NOW);
    state = scheduleReview(state, 5, NOW);
    state = scheduleReview(state, 5, NOW);
    expect(state.repetitions).toBeGreaterThanOrEqual(3);

    const failed = scheduleReview(state, 1, NOW);
    expect(failed.repetitions).toBe(0);
    expect(failed.interval).toBe(1);
    expect(failed.dueDate).toBe(NOW + 1 * DAY);
    expect(failed.lastGrade).toBe(1);
  });

  it("floors the ease factor at the SM-2 minimum after repeated low grades", () => {
    let state = initialReviewState();
    for (let i = 0; i < 10; i += 1) {
      state = scheduleReview(state, 0, NOW);
    }
    expect(state.easeFactor).toBeGreaterThanOrEqual(MIN_EASE_FACTOR);
    expect(state.easeFactor).toBeCloseTo(MIN_EASE_FACTOR, 5);
  });
});
