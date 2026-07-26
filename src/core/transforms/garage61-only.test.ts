import { describe, expect, it } from "vitest";
import type { RawGarage61Row } from "../types/race-data";
import { garage61OnlyToLapRecords } from "./garage61-only";

function makeRow(overrides: Partial<RawGarage61Row> = {}): RawGarage61Row {
  return {
    run: 1,
    lap: 0,
    lapTimeSeconds: 138.453,
    startedAt: "2026-01-01T10:00:00Z",
    driver: "Test Driver",
    clean: true,
    pitIn: false,
    pitOut: false,
    trackTempC: 20,
    trackUsagePct: 50,
    airTempC: 19,
    cloudCover: 2,
    airDensity: 1.1,
    airPressure: 96500,
    windVelocity: 5,
    windDirection: 3,
    relativeHumidity: 0.9,
    fogLevel: 0,
    precipitation: 0,
    trackWetness: 10,
    fuelLevel: 90,
    fuelUsed: 3.5,
    fuelAdded: 0,
    sector1: 40,
    sector2: 45,
    sector3: 30,
    sector4: 23.5,
    ...overrides,
  };
}

describe("garage61OnlyToLapRecords", () => {
  it("uses the supplied label as teamName, since Garage61 has no team name of its own", () => {
    const [record] = garage61OnlyToLapRecords([makeRow()], "setup-a.csv");
    expect(record.teamName).toBe("setup-a.csv");
  });

  it("converts lapTimeSeconds to milliseconds", () => {
    const [record] = garage61OnlyToLapRecords([makeRow({ lapTimeSeconds: 138.453 })], "x");
    expect(record.lapTimeMs).toBe(138453);
  });

  it("carries over pit flags, fuel, sectors, and weather", () => {
    const [record] = garage61OnlyToLapRecords(
      [makeRow({ pitIn: true, fuelUsed: 4, fuelLevel: 80 })],
      "x",
    );
    expect(record.pitIn).toBe(true);
    expect(record.fuelUsed).toBe(4);
    expect(record.fuelLevel).toBe(80);
    expect(record.sectorTimes).toEqual([40, 45, 30, 23.5]);
    expect(record.weather?.trackTempC).toBe(20);
  });

  it("has no custId or trackPositionAtLap — Garage61 has no such data", () => {
    const [record] = garage61OnlyToLapRecords([makeRow()], "x");
    expect(record.custId).toBeUndefined();
    expect(record.trackPositionAtLap).toBeUndefined();
  });
});
