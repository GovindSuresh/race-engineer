import { describe, expect, it } from "vitest";
import type { LapRecord } from "../types/race-data";
import { computeSmoothedPace } from "./smooth";

function makeLaps(times: Array<[lapNumber: number, lapTimeMs: number]>): LapRecord[] {
  return times.map(([lapNumber, lapTimeMs]) => ({
    lapNumber,
    driverName: "Test Driver",
    teamName: "x",
    lapTimeMs,
  }));
}

describe("computeSmoothedPace", () => {
  it("returns one point per valid lap, in lap order", () => {
    const result = computeSmoothedPace(
      makeLaps([
        [3, 138000],
        [1, 137000],
        [2, 139000],
      ]),
      1,
    );
    expect(result.map((p) => p.lapNumber)).toEqual([1, 2, 3]);
  });

  it("drops laps with no valid time rather than smoothing through them", () => {
    const result = computeSmoothedPace(
      makeLaps([
        [1, 137000],
        [2, -1],
        [3, 139000],
      ]),
      1,
    );
    expect(result.map((p) => p.lapNumber)).toEqual([1, 3]);
  });

  it("returns the lap's own time when the window holds a single lap", () => {
    const result = computeSmoothedPace(makeLaps([[1, 137500]]), 5);
    expect(result).toEqual([{ lapNumber: 1, smoothedLapTimeMs: 137500 }]);
  });

  it("takes the median of the surrounding window", () => {
    // halfWindow 1 → window is [prev, self, next]. Lap 2's window is
    // 137000/139000/141000, median 139000.
    const result = computeSmoothedPace(
      makeLaps([
        [1, 137000],
        [2, 139000],
        [3, 141000],
      ]),
      1,
    );
    expect(result[1]).toEqual({ lapNumber: 2, smoothedLapTimeMs: 139000 });
  });

  it("ignores a single wild outlier — the reason it's a median, not a mean", () => {
    // A 300s traffic lap among 138s laps. The mean of lap 3's window would be
    // dragged to ~170s; the median stays at real pace.
    const laps = makeLaps([
      [1, 138000],
      [2, 138000],
      [3, 300000],
      [4, 138000],
      [5, 138000],
    ]);
    const result = computeSmoothedPace(laps, 2);
    expect(result[2].smoothedLapTimeMs).toBe(138000);
  });

  it("shrinks the window at the edges instead of dropping those laps", () => {
    const laps = makeLaps([
      [1, 100000],
      [2, 200000],
      [3, 300000],
    ]);
    const result = computeSmoothedPace(laps, 5);
    // Every lap still gets a point, all seeing the same (whole) window.
    expect(result).toHaveLength(3);
    expect(result.every((p) => p.smoothedLapTimeMs === 200000)).toBe(true);
  });

  it("returns an empty array for no laps", () => {
    expect(computeSmoothedPace([], 5)).toEqual([]);
  });
});
