import { describe, expect, it } from "vitest";
import type { LapRecord, WeatherSnapshot } from "../types/race-data";
import { computeConditionsSummary, hasWeatherReading, trackWetnessLabel } from "./conditions";

function weather(overrides: Partial<WeatherSnapshot> = {}): WeatherSnapshot {
  return {
    trackTempC: 20,
    airTempC: 19,
    trackWetness: 0,
    trackUsagePct: 57,
    precipitation: 0,
    windVelocity: 5,
    ...overrides,
  };
}

function makeLap(overrides: Partial<LapRecord> = {}): LapRecord {
  return {
    lapNumber: 1,
    driverName: "Test Driver",
    teamName: "x",
    lapTimeMs: 138453,
    weather: weather(),
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
      makeLap({ weather: weather({ trackTempC: 19.4, airTempC: 18 }) }),
      makeLap({ weather: weather({ trackTempC: 38.9, airTempC: 24 }) }),
    ];
    const summary = computeConditionsSummary(laps)!;
    expect(summary.trackTempMinC).toBe(19.4);
    expect(summary.trackTempMaxC).toBe(38.9);
    expect(summary.airTempMinC).toBe(18);
    expect(summary.airTempMaxC).toBe(24);
  });

  it("also reports mean temperatures, which is what compares one run to another", () => {
    const laps = [
      makeLap({ weather: weather({ trackTempC: 20, airTempC: 18 }) }),
      makeLap({ weather: weather({ trackTempC: 30, airTempC: 22 }) }),
    ];
    const summary = computeConditionsSummary(laps)!;
    expect(summary.trackTempAvgC).toBe(25);
    expect(summary.airTempAvgC).toBe(20);
  });

  it("takes the MAX track wetness, not an average, so a session that gets wet doesn't read as merely damp", () => {
    const laps = [
      makeLap({ weather: weather({ trackWetness: 0 }) }),
      makeLap({ weather: weather({ trackWetness: 50 }) }),
    ];
    expect(computeConditionsSummary(laps)!.maxTrackWetnessPct).toBe(50);
  });

  it("reports track usage as a range, so a run that spans a reset says so", () => {
    const constant = [makeLap(), makeLap()];
    const constantSummary = computeConditionsSummary(constant)!;
    expect(constantSummary.trackUsageMinPct).toBe(57);
    expect(constantSummary.trackUsageMaxPct).toBe(57);

    const varying = [
      makeLap({ weather: weather({ trackUsagePct: 28 }) }),
      makeLap({ weather: weather({ trackUsagePct: 71 }) }),
    ];
    const varyingSummary = computeConditionsSummary(varying)!;
    expect(varyingSummary.trackUsageMinPct).toBe(28);
    expect(varyingSummary.trackUsageMaxPct).toBe(71);
  });

  it("reports null track usage when no lap recorded one, rather than a green track", () => {
    const laps = [makeLap({ weather: weather({ trackUsagePct: null }) })];
    const summary = computeConditionsSummary(laps)!;
    expect(summary.trackUsageMinPct).toBeNull();
    expect(summary.trackUsageMaxPct).toBeNull();
  });

  // Track usage doesn't travel with the weather sample: real laps carry a
  // usage figure beside a blanked-out `trackWetness: -1` and zeroed temps.
  // Gating it on the temperatures threw those readings away and understated
  // the range — the fixture reported 28–57% for laps actually spanning 28–71%.
  it("reads track usage from laps whose weather block is blank", () => {
    const laps = [
      makeLap({ weather: weather({ trackUsagePct: 28 }) }),
      makeLap({
        weather: weather({ trackTempC: 0, airTempC: 0, trackWetness: -1, trackUsagePct: 71 }),
      }),
    ];
    const summary = computeConditionsSummary(laps)!;
    expect(summary.trackUsageMinPct).toBe(28);
    expect(summary.trackUsageMaxPct).toBe(71);
    // ...while the temperatures still ignore that lap entirely.
    expect(summary.lapsWithReading).toBe(1);
    expect(summary.trackTempMinC).toBe(20);
  });

  it("averages wind velocity across the laps", () => {
    const laps = [
      makeLap({ weather: weather({ windVelocity: 4 }) }),
      makeLap({ weather: weather({ windVelocity: 6 }) }),
    ];
    expect(computeConditionsSummary(laps)!.avgWindVelocityMs).toBe(5);
  });

  it("ignores laps without weather data mixed in with laps that have it", () => {
    const laps = [makeLap(), { ...makeLap(), weather: undefined }];
    expect(computeConditionsSummary(laps)).toBeDefined();
  });

  // The regression this guards: Garage61 sends unrecorded weather as
  // `trackWetness: -1` with zeroed temperatures rather than omitting it, so a
  // summary that trusts every lap reports a track that touched 0°C.
  it("excludes laps whose weather is Garage61's not-recorded sentinel", () => {
    const laps = [
      makeLap({ weather: weather({ trackTempC: 24, airTempC: 20 }) }),
      makeLap({ weather: weather({ trackTempC: 0, airTempC: 0, trackWetness: -1 }) }),
    ];
    const summary = computeConditionsSummary(laps)!;
    expect(summary.trackTempMinC).toBe(24);
    expect(summary.maxTrackWetnessPct).toBe(0);
    expect(summary.lapsWithReading).toBe(1);
  });

  it("returns undefined when every lap's weather is a sentinel", () => {
    const laps = [makeLap({ weather: weather({ trackTempC: 0, airTempC: 0, trackWetness: -1 }) })];
    expect(computeConditionsSummary(laps)).toBeUndefined();
  });

  it("counts the laps a summary actually rests on", () => {
    expect(computeConditionsSummary([makeLap(), makeLap(), makeLap()])!.lapsWithReading).toBe(3);
  });
});

describe("hasWeatherReading", () => {
  it("rejects a negative wetness, which cannot be a rescaled ordinal", () => {
    expect(hasWeatherReading(weather({ trackWetness: -1 }))).toBe(false);
  });

  it("rejects the zeroed-temperature blank", () => {
    expect(hasWeatherReading(weather({ trackTempC: 0, airTempC: 0 }))).toBe(false);
  });

  // A genuinely cold session must survive: only BOTH temperatures being
  // exactly zero is the blank, since a 0°C track under 5°C air is real.
  it("keeps a cold but plausible reading", () => {
    expect(hasWeatherReading(weather({ trackTempC: 0, airTempC: 5 }))).toBe(true);
  });
});

describe("trackWetnessLabel", () => {
  // The four values below are every distinct reading in the 461-lap Spa
  // export — the evidence that wetness is the seven-state ordinal rescaled
  // onto 0-100 rather than a continuous percentage.
  it("names the readings seen in real data", () => {
    expect(trackWetnessLabel(0)).toBe("Dry");
    expect(trackWetnessLabel(17)).toBe("Mostly dry");
    expect(trackWetnessLabel(33)).toBe("Very lightly wet");
    expect(trackWetnessLabel(50)).toBe("Lightly wet");
  });

  it("names the remaining states", () => {
    expect(trackWetnessLabel(67)).toBe("Moderately wet");
    expect(trackWetnessLabel(83)).toBe("Very wet");
    expect(trackWetnessLabel(100)).toBe("Extremely wet");
  });

  it("snaps to the nearest state, since the export rounds its steps", () => {
    expect(trackWetnessLabel(16.666)).toBe("Mostly dry");
    expect(trackWetnessLabel(16)).toBe("Mostly dry");
    expect(trackWetnessLabel(18)).toBe("Mostly dry");
  });

  it("clamps rather than returning undefined for an out-of-range value", () => {
    expect(trackWetnessLabel(-5)).toBe("Dry");
    expect(trackWetnessLabel(140)).toBe("Extremely wet");
  });
});
