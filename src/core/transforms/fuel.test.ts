import { describe, expect, it } from "vitest";
import type { LapRecord, Stint } from "../types/race-data";
import { computeAverageFuelBurnRate, computeFuelBurnRate } from "./fuel";

function makeLap(lapNumber: number, fuelUsed?: number): LapRecord {
  return {
    lapNumber,
    driverName: "Test Driver",
    teamName: "Test Team",
    lapTimeMs: 138000,
    fuelUsed,
  };
}

function makeStint(laps: LapRecord[]): Stint {
  return {
    stintNumber: 1,
    driverName: "Test Driver",
    startLap: laps[0].lapNumber,
    endLap: laps[laps.length - 1].lapNumber,
    laps,
    fuelAtStart: 100,
    fuelAtEnd: 50,
    avgLapTimeMs: 0,
    bestLapTimeMs: 0,
  };
}

describe("computeFuelBurnRate", () => {
  it("averages fuelUsed across the stint's laps", () => {
    const stint = makeStint([makeLap(0, 4), makeLap(1, 3.5), makeLap(2, 4.5)]);
    expect(computeFuelBurnRate(stint)).toBeCloseTo(4);
  });

  it("returns 0 when no laps have fuel data (e.g. an opponent's iRacing-only stint)", () => {
    const stint = makeStint([makeLap(0), makeLap(1)]);
    expect(computeFuelBurnRate(stint)).toBe(0);
  });

  it("ignores laps missing fuelUsed rather than treating them as 0", () => {
    const stint = makeStint([makeLap(0, 4), makeLap(1, undefined), makeLap(2, 4)]);
    expect(computeFuelBurnRate(stint)).toBeCloseTo(4);
  });
});

describe("computeAverageFuelBurnRate", () => {
  it("weights by lap count rather than averaging per-stint averages", () => {
    // stint A: 1 lap at 10L/lap. stint B: 3 laps at 4L/lap.
    // Average-of-averages would give (10+4)/2 = 7. Lap-weighted gives
    // (10 + 4 + 4 + 4) / 4 = 5.5, which better reflects the actual fuel used.
    const stintA = makeStint([makeLap(0, 10)]);
    const stintB = makeStint([makeLap(1, 4), makeLap(2, 4), makeLap(3, 4)]);
    expect(computeAverageFuelBurnRate([stintA, stintB])).toBeCloseTo(5.5);
  });
});
