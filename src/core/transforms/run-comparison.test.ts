import { describe, expect, it } from "vitest";
import type { LapRecord, Stint } from "../types/race-data";
import { computeRunComparison, computeRunLapDistributions } from "./run-comparison";

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

describe("computeRunComparison", () => {
  it("summarises a run from its stints", () => {
    const [run] = computeRunComparison([
      {
        slot: 0,
        label: "Run 1",
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
    const [run] = computeRunComparison([
      { slot: 0, label: "Run 1", stints: [stint(1, [lap(1, 100_000), lap(2, 0), lap(3, 104_000)])] },
    ]);

    expect(run.lapCount).toBe(2);
    expect(run.avgLapTimeMs).toBe(102_000);
    expect(run.bestLapTimeMs).toBe(100_000);
  });

  it("measures spread, so a consistent run is distinguishable from a lucky one", () => {
    const [steady, erratic] = computeRunComparison([
      {
        slot: 0,
        label: "steady",
        stints: [stint(1, [lap(1, 100_000), lap(2, 100_000), lap(3, 100_000)])],
      },
      {
        slot: 1,
        label: "erratic",
        stints: [stint(1, [lap(1, 95_000), lap(2, 100_000), lap(3, 105_000)])],
      },
    ]);

    // Same mean, very different runs — the number that shows it is the spread.
    expect(steady.avgLapTimeMs).toBe(erratic.avgLapTimeMs);
    expect(steady.lapTimeStdDevMs).toBe(0);
    expect(erratic.lapTimeStdDevMs).toBeGreaterThan(4000);
  });

  it("returns nulls for a run with no timed laps rather than NaN", () => {
    const [run] = computeRunComparison([
      { slot: 0, label: "Run 1", stints: [stint(1, [lap(1, 0)])] },
    ]);

    expect(run.lapCount).toBe(0);
    expect(run.avgLapTimeMs).toBeNull();
    expect(run.bestLapTimeMs).toBeNull();
    expect(run.lapTimeStdDevMs).toBeNull();
  });

  it("treats a no-fuel stop as 0 but an absent column as unknown", () => {
    const [withZero, withNothing] = computeRunComparison([
      { slot: 0, label: "tyres only", stints: [stint(1, [lap(1, 100_000)], 0)] },
      { slot: 1, label: "no g61 fuel data", stints: [stint(1, [lap(1, 100_000)], undefined)] },
    ]);

    expect(withZero.fuelAddedTotal).toBe(0);
    expect(withNothing.fuelAddedTotal).toBeNull();
  });

  it("weights burn rate by lap, not by stint", () => {
    const [run] = computeRunComparison([
      {
        slot: 0,
        label: "Run 1",
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

    const [run] = computeRunComparison([
      { slot: 0, label: "Run 1", stints: [stint(1, [withWeather(1, 28), withWeather(2, 32)])] },
    ]);

    expect(run.conditions?.trackTempAvgC).toBe(30);
    expect(run.conditions?.trackUsageMaxPct).toBe(71);
  });

  it("reports null conditions for a run with no weather data, rather than zeroes", () => {
    const [run] = computeRunComparison([
      { slot: 0, label: "Run 1", stints: [stint(1, [lap(1, 100_000), lap(2, 100_000)])] },
    ]);

    expect(run.conditions).toBeNull();
  });
});

describe("computeRunLapDistributions", () => {
  it("produces the five-number summary ECharts' boxplot expects", () => {
    const laps = [10, 12, 14, 16, 18].map((s, i) => lap(i + 1, s * 1000));
    const [dist] = computeRunLapDistributions([
      { slot: 0, label: "Run 1", stints: [stint(1, laps)] },
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
    const [dist] = computeRunLapDistributions([
      { slot: 0, label: "Run 1", stints: [stint(1, laps)] },
    ]);

    expect(dist.outliers.map((o) => o.lapNumber)).toEqual([99]);
    // The whisker stops at the last real lap, not at the 180s one.
    expect(dist.box![4]).toBe(103_500);
  });

  it("returns a null box for a run with no timed laps", () => {
    const [dist] = computeRunLapDistributions([
      { slot: 0, label: "Run 1", stints: [stint(1, [lap(1, 0)])] },
    ]);

    expect(dist.box).toBeNull();
    expect(dist.outliers).toEqual([]);
  });
});
