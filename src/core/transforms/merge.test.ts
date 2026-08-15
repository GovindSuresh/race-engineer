import { describe, expect, it } from "vitest";
import type { LapRecord, RawGarage61Row } from "../types/race-data";
import { mergeGarage61IntoIracing } from "./merge";

function makeLapRecord(overrides: Partial<LapRecord> = {}): LapRecord {
  return {
    lapNumber: 1,
    driverName: "Test Driver",
    custId: 5001,
    teamName: "Test Team",
    lapTimeMs: 138453,
    trackPositionAtLap: 1,
    incident: false,
    ...overrides,
  };
}

function makeGarage61Row(overrides: Partial<RawGarage61Row> = {}): RawGarage61Row {
  return {
    run: 1,
    lap: 1,
    lapTimeSeconds: 138.5,
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

describe("mergeGarage61IntoIracing", () => {
  it("enriches a matching (driver, lap) with fuel/weather/sector/clean/pit fields", () => {
    const { merged } = mergeGarage61IntoIracing([makeLapRecord()], [makeGarage61Row()]);
    expect(merged[0].fuelUsed).toBe(3.5);
    expect(merged[0].fuelLevel).toBe(90);
    expect(merged[0].isClean).toBe(true);
    expect(merged[0].pitIn).toBe(false);
    expect(merged[0].sectorTimes).toEqual([40, 45, 30, 23.5]);
    expect(merged[0].weather).toEqual({
      trackTempC: 20,
      airTempC: 19,
      trackWetness: 10,
      trackUsagePct: 50,
      precipitation: 0,
      windVelocity: 5,
    });
  });

  it("does not touch lapTimeMs — iRacing's reconstructed value stays authoritative", () => {
    const { merged } = mergeGarage61IntoIracing(
      [makeLapRecord({ lapTimeMs: -1 })],
      [makeGarage61Row({ lapTimeSeconds: 160.5 })],
    );
    expect(merged[0].lapTimeMs).toBe(-1);
  });

  it("does not mutate the input LapRecord objects", () => {
    const original = makeLapRecord();
    mergeGarage61IntoIracing([original], [makeGarage61Row()]);
    expect(original.fuelUsed).toBeUndefined();
  });

  it("leaves an iRacing record with no matching Garage61 row unchanged", () => {
    const { merged } = mergeGarage61IntoIracing(
      [makeLapRecord({ driverName: "Other Driver" })],
      [makeGarage61Row()],
    );
    expect(merged[0].fuelUsed).toBeUndefined();
  });

  it("surfaces a Garage61 row whose driver name doesn't match any iRacing record (e.g. a Garage61 nickname)", () => {
    const { unmatchedGarage61Rows } = mergeGarage61IntoIracing(
      [makeLapRecord({ driverName: "Test Driver" })],
      [makeGarage61Row({ driver: "Nickname Not In iRacing" })],
    );
    expect(unmatchedGarage61Rows).toHaveLength(1);
    expect(unmatchedGarage61Rows[0].driver).toBe("Nickname Not In iRacing");
  });

  it("surfaces a Garage61 row whose lap number doesn't match any iRacing record (e.g. a boundary lap)", () => {
    const { unmatchedGarage61Rows } = mergeGarage61IntoIracing(
      [makeLapRecord({ lapNumber: 5 })],
      [makeGarage61Row({ lap: 6 })],
    );
    expect(unmatchedGarage61Rows).toHaveLength(1);
    expect(unmatchedGarage61Rows[0].lap).toBe(6);
  });
});
