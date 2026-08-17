import { describe, expect, it } from "vitest";
import type { LapRecord, Stint } from "../types/race-data";
import { computeComparison, computeLapDistributions } from "./comparison";
import type { ComparisonUnit } from "./comparison-units";

function lap(lapNumber: number, lapTimeMs: number, fuelUsed?: number): LapRecord {
  return {
    lapNumber,
    driverName: "Ada Vance",
    teamName: "Run 1",
    lapTimeMs,
    isClean: true,
    pitIn: false,
    pitOut: false,
    fuelUsed,
  } as LapRecord;
}

function stint(stintNumber: number, laps: LapRecord[], fuelAdded?: number): Stint {
  const timed = laps.filter((l) => l.lapTimeMs > 0);
  return {
    stintNumber,
    driverName: "Ada Vance",
    startLap: laps[0]?.lapNumber ?? 0,
    endLap: laps[laps.length - 1]?.lapNumber ?? 0,
    laps,
    fuelAtStart: 100,
    fuelAtEnd: 50,
    fuelAddedAtPrevStop: fuelAdded,
    avgLapTimeMs: timed.reduce((a, l) => a + l.lapTimeMs, 0) / (timed.length || 1),
    bestLapTimeMs: Math.min(...timed.map((l) => l.lapTimeMs)),
  };
}

/** The identity half of a `ComparisonUnit`. Every figure under test is derived
 *  from `stints` alone, so these fields only need to be distinct. */
function id(slot: number, name: string): Omit<ComparisonUnit, "stints"> {
  return { key: `run${slot}`, name, detail: name, runSlot: slot, stintIndex: 0 };
}

describe("computeComparison", () => {
  it("summarises a run from its stints", () => {
    const [run] = computeComparison([
      {
        ...id(0, "Run 1"),
        stints: [stint(1, [lap(1, 100_000), lap(2, 102_000), lap(3, 104_000)], 50)],
      },
    ]);

    expect(run.stintCount).toBe(1);
    expect(run.lapCount).toBe(3);
    expect(run.bestLapTimeMs).toBe(100_000);
    expect(run.medianLapTimeMs).toBe(102_000);
    expect(run.avgLapTimeMs).toBe(102_000);
    expect(run.fuelAddedTotal).toBe(50);
  });

  it("excludes untimed laps rather than averaging a zero", () => {
    const [run] = computeComparison([
      { ...id(0, "Run 1"), stints: [stint(1, [lap(1, 100_000), lap(2, 0), lap(3, 104_000)])] },
    ]);

    expect(run.lapCount).toBe(2);
    expect(run.avgLapTimeMs).toBe(102_000);
    expect(run.bestLapTimeMs).toBe(100_000);
  });

  it("measures spread, so a consistent run is distinguishable from a lucky one", () => {
    const [steady, erratic] = computeComparison([
      {
        ...id(0, "steady"),
        stints: [stint(1, [lap(1, 100_000), lap(2, 100_000), lap(3, 100_000)])],
      },
      {
        ...id(1, "erratic"),
        stints: [stint(1, [lap(1, 95_000), lap(2, 100_000), lap(3, 105_000)])],
      },
    ]);

    // Same mean, very different runs — the number that shows it is the spread.
    expect(steady.avgLapTimeMs).toBe(erratic.avgLapTimeMs);
    expect(steady.lapTimeStdDevMs).toBe(0);
    expect(erratic.lapTimeStdDevMs).toBeGreaterThan(4000);
  });

  it("returns nulls for a run with no timed laps rather than NaN", () => {
    const [run] = computeComparison([
      { ...id(0, "Run 1"), stints: [stint(1, [lap(1, 0)])] },
    ]);

    expect(run.lapCount).toBe(0);
    expect(run.avgLapTimeMs).toBeNull();
    expect(run.bestLapTimeMs).toBeNull();
    expect(run.lapTimeStdDevMs).toBeNull();
  });

  it("treats a no-fuel stop as 0 but an absent column as unknown", () => {
    const [withZero, withNothing] = computeComparison([
      { ...id(0, "tyres only"), stints: [stint(1, [lap(1, 100_000)], 0)] },
      { ...id(1, "no g61 fuel data"), stints: [stint(1, [lap(1, 100_000)], undefined)] },
    ]);

    expect(withZero.fuelAddedTotal).toBe(0);
    expect(withNothing.fuelAddedTotal).toBeNull();
  });

  it("weights burn rate by lap, not by stint", () => {
    const [run] = computeComparison([
      {
        ...id(0, "Run 1"),
        stints: [
          stint(1, [lap(1, 100_000, 3), lap(2, 100_000, 3), lap(3, 100_000, 3)]),
          stint(2, [lap(4, 100_000, 5)]),
        ],
      },
    ]);

    // (3+3+3+5)/4 = 3.5, not the (3+5)/2 = 4 an average-of-averages would give.
    expect(run.fuelPerLap).toBeCloseTo(3.5, 5);
  });

  it("summarises the conditions the run was set in", () => {
    const withWeather = (lapNumber: number, trackTempC: number): LapRecord => ({
      ...lap(lapNumber, 100_000),
      weather: {
        trackTempC,
        airTempC: 20,
        trackWetness: 0,
        trackUsagePct: 71,
        precipitation: 0,
        windVelocity: 3,
      },
    });

    const [run] = computeComparison([
      { ...id(0, "Run 1"), stints: [stint(1, [withWeather(1, 28), withWeather(2, 32)])] },
    ]);

    expect(run.conditions?.trackTempAvgC).toBe(30);
    expect(run.conditions?.trackUsageMaxPct).toBe(71);
  });

  it("reports a single-stint unit's own pace trend, not a mean of several", () => {
    // What stint mode relies on: a unit holding one stint makes the
    // mean-of-per-stint-trends a mean over one value, so the column becomes
    // that stint's own fit. A run-level unit averaging two opposite trends
    // would report ~0 and hide both.
    const improving = stint(1, [1, 2, 3, 4].map((n) => lap(n, 104_000 - n * 1000)));
    const dropping = stint(2, [5, 6, 7, 8].map((n) => lap(n, 96_000 + n * 1000)));

    const [asStint] = computeComparison([{ ...id(0, "Stint 1"), stints: [improving] }]);
    const [asRun] = computeComparison([
      { ...id(0, "Run 1"), stints: [improving, dropping] },
    ]);

    expect(asStint.paceTrendMsPerLap).toBeCloseTo(-1000, 5);
    expect(asRun.paceTrendMsPerLap).toBeCloseTo(0, 5);
  });

  it("reports null conditions for a run with no weather data, rather than zeroes", () => {
    const [run] = computeComparison([
      { ...id(0, "Run 1"), stints: [stint(1, [lap(1, 100_000), lap(2, 100_000)])] },
    ]);

    expect(run.conditions).toBeNull();
  });
});

describe("computeLapDistributions", () => {
  it("produces the five-number summary ECharts' boxplot expects", () => {
    const laps = [10, 12, 14, 16, 18].map((s, i) => lap(i + 1, s * 1000));
    const [dist] = computeLapDistributions([
      { ...id(0, "Run 1"), stints: [stint(1, laps)] },
    ]);

    expect(dist.box).not.toBeNull();
    const [min, q1, med, q3, max] = dist.box!;
    expect(min).toBe(10_000);
    expect(q1).toBe(12_000);
    expect(med).toBe(14_000);
    expect(q3).toBe(16_000);
    expect(max).toBe(18_000);
    expect(dist.outliers).toEqual([]);
  });

  it("pulls a wild lap out as an outlier instead of stretching the whisker", () => {
    const laps = [
      ...[100, 100.5, 101, 101.5, 102, 102.5, 103, 103.5].map((s, i) => lap(i + 1, s * 1000)),
      lap(99, 180_000), // a lap ruined by traffic
    ];
    const [dist] = computeLapDistributions([
      { ...id(0, "Run 1"), stints: [stint(1, laps)] },
    ]);

    expect(dist.outliers.map((o) => o.lapNumber)).toEqual([99]);
    // The whisker stops at the last real lap, not at the 180s one.
    expect(dist.box![4]).toBe(103_500);
  });

  it("returns a null box for a run with no timed laps", () => {
    const [dist] = computeLapDistributions([
      { ...id(0, "Run 1"), stints: [stint(1, [lap(1, 0)])] },
    ]);

    expect(dist.box).toBeNull();
    expect(dist.outliers).toEqual([]);
  });
});
