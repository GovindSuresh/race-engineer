import { describe, expect, it } from "vitest";
import type { LapRecord, Stint } from "../types/race-data";
import { computeStintPaceTrend } from "./stint-pace-trend";

function makeLap(lapNumber: number, lapTimeMs: number): LapRecord {
  return {
    lapNumber,
    driverName: "Test Driver",
    teamName: "Test Team",
    lapTimeMs,
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

describe("computeStintPaceTrend", () => {
  it("returns a positive slope when lap times rise steadily", () => {
    // out-lap (excluded) then a perfectly linear +500ms/lap trend
    const laps = [
      makeLap(0, 145000),
      makeLap(1, 138000),
      makeLap(2, 138500),
      makeLap(3, 139000),
      makeLap(4, 139500),
    ];
    const slope = computeStintPaceTrend(makeStint(laps));
    expect(slope).toBeCloseTo(500, 0);
  });

  it("returns a negative slope when lap times fall steadily", () => {
    const laps = [
      makeLap(0, 145000),
      makeLap(1, 140000),
      makeLap(2, 139500),
      makeLap(3, 139000),
      makeLap(4, 138500),
    ];
    const slope = computeStintPaceTrend(makeStint(laps));
    expect(slope).toBeCloseTo(-500, 0);
  });

  it("excludes the out-lap (first lap) from the fit", () => {
    // out-lap is a huge outlier; a fit including it would show a steep
    // negative slope even though laps 1-4 are actually flat.
    const laps = [
      makeLap(0, 220000),
      makeLap(1, 138000),
      makeLap(2, 138000),
      makeLap(3, 138000),
      makeLap(4, 138000),
    ];
    const slope = computeStintPaceTrend(makeStint(laps));
    expect(slope).toBeCloseTo(0, 0);
  });

  it("excludes invalid (-1) lap times from the fit", () => {
    const laps = [
      makeLap(0, 145000),
      makeLap(1, 138000),
      makeLap(2, -1),
      makeLap(3, 139000),
      makeLap(4, 140000),
    ];
    const slope = computeStintPaceTrend(makeStint(laps));
    expect(slope).toBeCloseTo(1000, 0);
  });

  it("returns undefined when fewer than 3 laps remain after exclusions", () => {
    const laps = [makeLap(0, 145000), makeLap(1, 138000), makeLap(2, 139000)];
    expect(computeStintPaceTrend(makeStint(laps))).toBeUndefined();
  });
});
