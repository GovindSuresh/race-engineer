import { describe, expect, it } from "vitest";
import type { LapRecord } from "../types/race-data";
import { computeConditionsSummary } from "./conditions";

function makeLap(overrides: Partial<LapRecord> = {}): LapRecord {
  return {
    lapNumber: 1,
    driverName: "Test Driver",
    teamName: "x",
    lapTimeMs: 138453,
    weather: {
      trackTempC: 20,
      airTempC: 19,
      trackWetness: 0,
      precipitation: 0,
      windVelocity: 5,
    },
    ...overrides,
  };
}

describe("computeConditionsSummary", () => {
  it("returns undefined when no laps carry weather data", () => {
    expect(computeConditionsSummary([{ ...makeLap(), weather: undefined }])).toBeUndefined();
    expect(computeConditionsSummary([])).toBeUndefined();
  });

  it("takes min/max track and air temp across the laps", () => {
    const laps = [
      makeLap({ weather: { trackTempC: 19.4, airTempC: 18, trackWetness: 0, precipitation: 0, windVelocity: 4 } }),
      makeLap({ weather: { trackTempC: 38.9, airTempC: 24, trackWetness: 0, precipitation: 0, windVelocity: 6 } }),
    ];
    const summary = computeConditionsSummary(laps)!;
    expect(summary.trackTempMinC).toBe(19.4);
    expect(summary.trackTempMaxC).toBe(38.9);
    expect(summary.airTempMinC).toBe(18);
    expect(summary.airTempMaxC).toBe(24);
  });

  it("takes the MAX track wetness, not an average, so a session that gets wet doesn't read as merely damp", () => {
    const laps = [
      makeLap({ weather: { trackTempC: 20, airTempC: 19, trackWetness: 0, precipitation: 0, windVelocity: 5 } }),
      makeLap({ weather: { trackTempC: 20, airTempC: 19, trackWetness: 50, precipitation: 0, windVelocity: 5 } }),
    ];
    expect(computeConditionsSummary(laps)!.maxTrackWetnessPct).toBe(50);
  });

  it("averages wind velocity across the laps", () => {
    const laps = [
      makeLap({ weather: { trackTempC: 20, airTempC: 19, trackWetness: 0, precipitation: 0, windVelocity: 4 } }),
      makeLap({ weather: { trackTempC: 20, airTempC: 19, trackWetness: 0, precipitation: 0, windVelocity: 6 } }),
    ];
    expect(computeConditionsSummary(laps)!.avgWindVelocityMs).toBe(5);
  });

  it("ignores laps without weather data mixed in with laps that have it", () => {
    const laps = [makeLap(), { ...makeLap(), weather: undefined }];
    expect(computeConditionsSummary(laps)).toBeDefined();
  });
});
