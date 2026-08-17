import { describe, expect, it } from "vitest";
import type { LapRecord, Stint } from "../types/race-data";
import type { ComparisonUnit } from "./comparison-units";
import { computeLapDeltas } from "./lap-delta";

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

function makeStint(stintNumber: number, laps: LapRecord[]): Stint {
  const timed = laps.filter((l) => l.lapTimeMs > 0);
  return {
    stintNumber,
    driverName: "Ada Vance",
    startLap: laps[0]?.lapNumber ?? 0,
    endLap: laps[laps.length - 1]?.lapNumber ?? 0,
    laps,
    fuelAtStart: 100,
    fuelAtEnd: 50,
    avgLapTimeMs: timed.reduce((a, l) => a + l.lapTimeMs, 0) / (timed.length || 1),
    bestLapTimeMs: timed.length > 0 ? Math.min(...timed.map((l) => l.lapTimeMs)) : 0,
  };
}

/** A whole-run unit: one stint holding every lap, which is what runs mode
 *  produces for a session driven straight through. */
function makeRun(key: string, slot: number, laps: LapRecord[]): ComparisonUnit {
  return {
    key,
    name: `Run ${slot + 1}`,
    detail: "",
    runSlot: slot,
    stintIndex: 0,
    stints: [makeStint(1, laps)],
  };
}

/** A stint unit, as stints mode produces: one stint, its own shade index. */
function makeStintUnit(key: string, slot: number, index: number, laps: LapRecord[]): ComparisonUnit {
  return {
    key,
    name: `Stint ${index + 1}`,
    detail: "",
    runSlot: slot,
    stintIndex: index,
    stints: [makeStint(index + 1, laps)],
  };
}

describe("computeLapDeltas, aligned on lap number", () => {
  it("measures each run against the median of the runs at that same lap", () => {
    const result = computeLapDeltas(
      [
        makeRun("a", 0, [makeLap(1, 120000), makeLap(2, 121000)]),
        makeRun("b", 1, [makeLap(1, 122000), makeLap(2, 123000)]),
        makeRun("c", 2, [makeLap(1, 124000), makeLap(2, 125000)]),
      ],
      "lapNumber",
    );

    expect(result.baseline).toEqual([
      { x: 1, medianLapTimeMs: 122000, unitCount: 3 },
      { x: 2, medianLapTimeMs: 123000, unitCount: 3 },
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

    const result = computeLapDeltas([makeRun("a", 0, a), makeRun("b", 1, b)], "lapNumber");

    expect(result.series[0].points.map((p) => p.deltaMs)).toEqual([-250, -250, -250, -250]);
    expect(result.series[1].points.map((p) => p.deltaMs)).toEqual([250, 250, 250, 250]);
  });

  it("drops laps where only one run has a time, rather than plotting them at zero", () => {
    const result = computeLapDeltas(
      [
        makeRun("a", 0, [makeLap(1, 120000), makeLap(2, 121000), makeLap(3, 122000)]),
        makeRun("b", 1, [makeLap(1, 122000)]),
      ],
      "lapNumber",
    );

    expect(result.baseline.map((b) => b.x)).toEqual([1]);
    expect(result.series[0].points.map((p) => p.x)).toEqual([1]);
    expect(result.maxX).toBe(1);
  });

  it("excludes pit laps, which would otherwise drag the baseline and the axis", () => {
    const result = computeLapDeltas(
      [
        makeRun("a", 0, [makeLap(1, 120000), makeLap(2, 134000, { pitIn: true })]),
        makeRun("b", 1, [makeLap(1, 122000), makeLap(2, 121000)]),
      ],
      "lapNumber",
    );

    // Lap 2 now has only one usable time, so it carries no baseline at all.
    expect(result.baseline.map((b) => b.x)).toEqual([1]);
    expect(result.series.flatMap((s) => s.points.map((p) => p.x))).toEqual([1, 1]);
  });

  it("honours pitAffected, the flag an iRacing-sourced lap carries instead", () => {
    const result = computeLapDeltas(
      [
        makeRun("a", 0, [makeLap(1, 120000, { pitAffected: true }), makeLap(2, 121000)]),
        makeRun("b", 1, [makeLap(1, 122000), makeLap(2, 123000)]),
      ],
      "lapNumber",
    );

    expect(result.baseline.map((b) => b.x)).toEqual([2]);
  });

  it("ignores laps the filters zeroed", () => {
    const result = computeLapDeltas(
      [
        makeRun("a", 0, [makeLap(1, -1), makeLap(2, 121000)]),
        makeRun("b", 1, [makeLap(1, 122000), makeLap(2, 123000)]),
      ],
      "lapNumber",
    );

    expect(result.baseline.map((b) => b.x)).toEqual([2]);
  });

  it("omits a run that never overlapped anything, rather than emitting an empty line", () => {
    const result = computeLapDeltas(
      [
        makeRun("a", 0, [makeLap(1, 120000), makeLap(2, 121000)]),
        makeRun("b", 1, [makeLap(1, 122000), makeLap(2, 123000)]),
        makeRun("c", 2, [makeLap(90, 130000)]),
      ],
      "lapNumber",
    );

    expect(result.series.map((s) => s.key)).toEqual(["a", "b"]);
  });

  it("returns nothing comparable when only one run is loaded", () => {
    const result = computeLapDeltas(
      [makeRun("a", 0, [makeLap(1, 120000), makeLap(2, 121000)])],
      "lapNumber",
    );

    expect(result.series).toEqual([]);
    expect(result.baseline).toEqual([]);
    expect(result.maxX).toBe(0);
  });

  it("takes the median of an even number of runs as the midpoint of the middle pair", () => {
    const result = computeLapDeltas(
      [
        makeRun("a", 0, [makeLap(1, 120000)]),
        makeRun("b", 1, [makeLap(1, 121000)]),
        makeRun("c", 2, [makeLap(1, 123000)]),
        makeRun("d", 3, [makeLap(1, 140000)]),
      ],
      "lapNumber",
    );

    // 140s is a scruffy lap: the median sits at 122s where a mean would be
    // 126s, which would push every other run's delta negative.
    expect(result.baseline[0].medianLapTimeMs).toBe(122000);
    expect(result.series.map((s) => s.points[0].deltaMs)).toEqual([-2000, -1000, 1000, 18000]);
  });
});

describe("computeLapDeltas, aligned on lap in stint", () => {
  it("compares stints whose lap numbers never overlap", () => {
    // The case the whole alignment exists for. One session: stint 1 is laps
    // 1-3, stint 2 is laps 11-13 after a stop. Under "lapNumber" there is no
    // lap where both have a time, so the chart is empty.
    const first = makeStintUnit("s1", 0, 0, [
      makeLap(1, 120000),
      makeLap(2, 121000),
      makeLap(3, 122000),
    ]);
    const second = makeStintUnit("s2", 0, 1, [
      makeLap(11, 121000),
      makeLap(12, 122000),
      makeLap(13, 123000),
    ]);

    expect(computeLapDeltas([first, second], "lapNumber").series).toEqual([]);

    const result = computeLapDeltas([first, second], "lapInStint");
    expect(result.baseline.map((b) => b.x)).toEqual([1, 2, 3]);
    // Stint 2 is a flat second slower at every equivalent point in the stint.
    expect(result.series[0].points.map((p) => p.deltaMs)).toEqual([-500, -500, -500]);
    expect(result.series[1].points.map((p) => p.deltaMs)).toEqual([500, 500, 500]);
  });

  it("still drops a stint's out-lap, which sits at position 1", () => {
    const first = makeStintUnit("s1", 0, 0, [makeLap(1, 120000), makeLap(2, 121000)]);
    const second = makeStintUnit("s2", 0, 1, [
      makeLap(11, 160000, { pitOut: true }),
      makeLap(12, 123000),
    ]);

    const result = computeLapDeltas([first, second], "lapInStint");

    // Position 1 has only stint 1's time left, so it carries no baseline —
    // the 160s out-lap never reaches the axis.
    expect(result.baseline.map((b) => b.x)).toEqual([2]);
    expect(result.baseline[0].medianLapTimeMs).toBe(122000);
  });

  it("leaves the longer stint unbaselined past the shorter one's end", () => {
    const short = makeStintUnit("s1", 0, 0, [makeLap(1, 120000), makeLap(2, 121000)]);
    const long = makeStintUnit("s2", 0, 1, [
      makeLap(11, 122000),
      makeLap(12, 123000),
      makeLap(13, 124000),
      makeLap(14, 125000),
    ]);

    const result = computeLapDeltas([short, long], "lapInStint");

    expect(result.baseline.map((b) => b.x)).toEqual([1, 2]);
    expect(result.maxX).toBe(2);
    expect(result.series[1].points.map((p) => p.x)).toEqual([1, 2]);
  });

  it("counts position over the laps as driven, so a zeroed lap leaves a hole", () => {
    // A filter dropped stint 1's second lap. Position must NOT slide forward:
    // lap 3 is still position 3, so it stays lined up with the other stint's
    // third lap rather than being compared against its second.
    const first = makeStintUnit("s1", 0, 0, [
      makeLap(1, 120000),
      makeLap(2, 0),
      makeLap(3, 130000),
    ]);
    const second = makeStintUnit("s2", 0, 1, [
      makeLap(11, 122000),
      makeLap(12, 123000),
      makeLap(13, 124000),
    ]);

    const result = computeLapDeltas([first, second], "lapInStint");

    expect(result.baseline.map((b) => b.x)).toEqual([1, 3]);
    expect(result.series[0].points.map((p) => p.lapTimeMs)).toEqual([120000, 130000]);
  });

  it("compares stints from different runs, which is the point of the chip grid", () => {
    const runOne = makeStintUnit("r0s2", 0, 1, [makeLap(8, 120000), makeLap(9, 120000)]);
    const runThree = makeStintUnit("r2s1", 2, 0, [makeLap(1, 121000), makeLap(2, 121000)]);

    const result = computeLapDeltas([runOne, runThree], "lapInStint");

    expect(result.series.map((s) => s.runSlot)).toEqual([0, 2]);
    expect(result.series.map((s) => s.stintIndex)).toEqual([1, 0]);
    expect(result.series[0].points.map((p) => p.deltaMs)).toEqual([-500, -500]);
  });
});
