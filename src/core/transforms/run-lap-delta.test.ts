import { describe, expect, it } from "vitest";
import type { LapRecord } from "../types/race-data";
import { computeRunLapDeltas, type RunLapDeltaInput } from "./run-lap-delta";

function makeLap(
  lapNumber: number,
  lapTimeMs: number,
  pit?: { pitIn?: boolean; pitOut?: boolean; pitAffected?: boolean },
): LapRecord {
  return {
    lapNumber,
    driverName: "Ada Vance",
    teamName: "Test Team",
    lapTimeMs,
    ...pit,
  };
}

function makeRun(key: string, slot: number, laps: LapRecord[]): RunLapDeltaInput {
  return { key, slot, label: `Run ${slot + 1}`, laps };
}

describe("computeRunLapDeltas", () => {
  it("measures each run against the median of the runs at that same lap", () => {
    const result = computeRunLapDeltas([
      makeRun("a", 0, [makeLap(1, 120000), makeLap(2, 121000)]),
      makeRun("b", 1, [makeLap(1, 122000), makeLap(2, 123000)]),
      makeRun("c", 2, [makeLap(1, 124000), makeLap(2, 125000)]),
    ]);

    expect(result.baseline).toEqual([
      { lapNumber: 1, medianLapTimeMs: 122000, runCount: 3 },
      { lapNumber: 2, medianLapTimeMs: 123000, runCount: 3 },
    ]);
    expect(result.series.map((s) => s.points.map((p) => p.deltaMs))).toEqual([
      [-2000, -2000],
      [0, 0],
      [2000, 2000],
    ]);
  });

  it("cancels a trend the runs share, leaving only the gap between them", () => {
    // Both runs slow by 1s/lap as fuel-corrected pace drops away; run B is a
    // flat 0.5s behind throughout. The shared trend must not appear in either
    // delta — that is the entire reason the baseline is per-lap.
    const a = [1, 2, 3, 4].map((n) => makeLap(n, 120000 + n * 1000));
    const b = [1, 2, 3, 4].map((n) => makeLap(n, 120500 + n * 1000));

    const result = computeRunLapDeltas([makeRun("a", 0, a), makeRun("b", 1, b)]);

    expect(result.series[0].points.map((p) => p.deltaMs)).toEqual([-250, -250, -250, -250]);
    expect(result.series[1].points.map((p) => p.deltaMs)).toEqual([250, 250, 250, 250]);
  });

  it("drops laps where only one run has a time, rather than plotting them at zero", () => {
    const result = computeRunLapDeltas([
      makeRun("a", 0, [makeLap(1, 120000), makeLap(2, 121000), makeLap(3, 122000)]),
      makeRun("b", 1, [makeLap(1, 122000)]),
    ]);

    expect(result.baseline.map((b) => b.lapNumber)).toEqual([1]);
    expect(result.series[0].points.map((p) => p.lapNumber)).toEqual([1]);
    expect(result.maxLap).toBe(1);
  });

  it("excludes pit laps, which would otherwise drag the baseline and the axis", () => {
    const result = computeRunLapDeltas([
      makeRun("a", 0, [makeLap(1, 120000), makeLap(2, 134000, { pitIn: true })]),
      makeRun("b", 1, [makeLap(1, 122000), makeLap(2, 121000)]),
    ]);

    // Lap 2 now has only one usable time, so it carries no baseline at all.
    expect(result.baseline.map((b) => b.lapNumber)).toEqual([1]);
    expect(result.series.flatMap((s) => s.points.map((p) => p.lapNumber))).toEqual([1, 1]);
  });

  it("honours pitAffected, the flag an iRacing-sourced lap carries instead", () => {
    const result = computeRunLapDeltas([
      makeRun("a", 0, [makeLap(1, 120000, { pitAffected: true }), makeLap(2, 121000)]),
      makeRun("b", 1, [makeLap(1, 122000), makeLap(2, 123000)]),
    ]);

    expect(result.baseline.map((b) => b.lapNumber)).toEqual([2]);
  });

  it("ignores laps the filters zeroed", () => {
    const result = computeRunLapDeltas([
      makeRun("a", 0, [makeLap(1, -1), makeLap(2, 121000)]),
      makeRun("b", 1, [makeLap(1, 122000), makeLap(2, 123000)]),
    ]);

    expect(result.baseline.map((b) => b.lapNumber)).toEqual([2]);
  });

  it("omits a run that never overlapped anything, rather than emitting an empty line", () => {
    const result = computeRunLapDeltas([
      makeRun("a", 0, [makeLap(1, 120000), makeLap(2, 121000)]),
      makeRun("b", 1, [makeLap(1, 122000), makeLap(2, 123000)]),
      makeRun("c", 2, [makeLap(90, 130000)]),
    ]);

    expect(result.series.map((s) => s.key)).toEqual(["a", "b"]);
  });

  it("returns nothing comparable when only one run is loaded", () => {
    const result = computeRunLapDeltas([
      makeRun("a", 0, [makeLap(1, 120000), makeLap(2, 121000)]),
    ]);

    expect(result.series).toEqual([]);
    expect(result.baseline).toEqual([]);
    expect(result.maxLap).toBe(0);
  });

  it("takes the median of an even number of runs as the midpoint of the middle pair", () => {
    const result = computeRunLapDeltas([
      makeRun("a", 0, [makeLap(1, 120000)]),
      makeRun("b", 1, [makeLap(1, 121000)]),
      makeRun("c", 2, [makeLap(1, 123000)]),
      makeRun("d", 3, [makeLap(1, 140000)]),
    ]);

    // 140s is a scruffy lap: the median sits at 122s where a mean would be
    // 126s, which would push every other run's delta negative.
    expect(result.baseline[0].medianLapTimeMs).toBe(122000);
    expect(result.series.map((s) => s.points[0].deltaMs)).toEqual([-2000, -1000, 1000, 18000]);
  });
});
