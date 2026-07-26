import { describe, expect, it } from "vitest";
import type { LapRecord } from "../types/race-data";
import { computeDriverPaceStats } from "./pace";

function makeLap(overrides: Partial<LapRecord>): LapRecord {
  return {
    lapNumber: 0,
    driverName: "Test Driver",
    teamName: "Test Team",
    lapTimeMs: 140000,
    ...overrides,
  };
}

describe("computeDriverPaceStats", () => {
  it("computes best/average/median over valid laps only, excluding -1 sentinels", () => {
    const laps = [
      makeLap({ lapNumber: 0, lapTimeMs: -1 }),
      makeLap({ lapNumber: 1, lapTimeMs: 140000 }),
      makeLap({ lapNumber: 2, lapTimeMs: 136000 }),
      makeLap({ lapNumber: 3, lapTimeMs: 138000 }),
    ];
    const stats = computeDriverPaceStats(laps);
    expect(stats.lapsCompleted).toBe(3);
    expect(stats.bestLapTimeMs).toBe(136000);
    expect(stats.averageLapTimeMs).toBeCloseTo(138000);
    expect(stats.medianLapTimeMs).toBe(138000);
  });

  it("computes population standard deviation as a consistency measure", () => {
    const laps = [
      makeLap({ lapNumber: 0, lapTimeMs: 138000 }),
      makeLap({ lapNumber: 1, lapTimeMs: 138000 }),
    ];
    // identical lap times -> zero spread
    expect(computeDriverPaceStats(laps).stdDevMs).toBe(0);
  });

  it("computes top10PctAvgMs as the average of at least the single fastest lap", () => {
    const laps = Array.from({ length: 5 }, (_, i) =>
      makeLap({ lapNumber: i, lapTimeMs: 140000 + i * 1000 }),
    );
    const stats = computeDriverPaceStats(laps);
    // 10% of 5 laps rounds up to 1 lap -> just the fastest (140000)
    expect(stats.top10PctAvgMs).toBe(140000);
  });

  it("counts incidents from the iRacing incident flag", () => {
    const laps = [
      makeLap({ lapNumber: 0, incident: true }),
      makeLap({ lapNumber: 1, incident: false }),
      makeLap({ lapNumber: 2, incident: true }),
    ];
    expect(computeDriverPaceStats(laps).incidentCount).toBe(2);
  });

  it("derives stints when laps carry Garage61 fuel data", () => {
    const laps = [
      makeLap({ lapNumber: 0, pitOut: true, fuelLevel: 97, fuelUsed: 3 }),
      makeLap({ lapNumber: 1, pitIn: true, fuelLevel: 94, fuelUsed: 3 }),
    ];
    expect(computeDriverPaceStats(laps).stints).toHaveLength(1);
  });

  it("returns an empty stints array (not an error) for iRacing-only laps with no Garage61 data", () => {
    const laps = [makeLap({ lapNumber: 0 }), makeLap({ lapNumber: 1 })];
    expect(computeDriverPaceStats(laps).stints).toEqual([]);
  });

  it("derives stints from just the enriched subset when a driver's laps are only partially covered by Garage61 (e.g. a second stint from a different export)", () => {
    const laps = [
      // stint 1: fully enriched
      makeLap({ lapNumber: 0, pitOut: true, fuelLevel: 97, fuelUsed: 3 }),
      makeLap({ lapNumber: 1, pitIn: true, fuelLevel: 94, fuelUsed: 3 }),
      // a later, separate real stint with NO Garage61 data at all
      makeLap({ lapNumber: 50 }),
      makeLap({ lapNumber: 51 }),
    ];
    const stats = computeDriverPaceStats(laps);
    expect(stats.stints).toHaveLength(1);
    expect(stats.stints[0].startLap).toBe(0);
    expect(stats.stints[0].endLap).toBe(1);
    // the pace stats themselves still cover ALL valid laps, not just the enriched ones
    expect(stats.lapsCompleted).toBe(4);
  });

  it("handles a driver with zero valid laps (e.g. DNS) without producing NaN", () => {
    const laps = [makeLap({ lapNumber: 0, lapTimeMs: -1 })];
    const stats = computeDriverPaceStats(laps);
    expect(stats.lapsCompleted).toBe(0);
    expect(stats.averageLapTimeMs).toBe(0);
    expect(stats.stdDevMs).toBe(0);
    expect(Number.isNaN(stats.averageLapTimeMs)).toBe(false);
  });
});
