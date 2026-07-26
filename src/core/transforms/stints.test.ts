import { describe, expect, it } from "vitest";
import type { LapRecord } from "../types/race-data";
import { deriveStints } from "./stints";

function makeLap(overrides: Partial<LapRecord>): LapRecord {
  return {
    lapNumber: 0,
    driverName: "Test Driver",
    teamName: "Test Team",
    lapTimeMs: 138000,
    fuelLevel: 50,
    fuelUsed: 3,
    pitIn: false,
    pitOut: false,
    ...overrides,
  };
}

describe("deriveStints", () => {
  it("splits laps into stints at each pit-in, starting a new stint on the following pit-out", () => {
    const laps = [
      makeLap({ lapNumber: 0, pitOut: true, fuelLevel: 97 }),
      makeLap({ lapNumber: 1, fuelLevel: 94 }),
      makeLap({ lapNumber: 2, pitIn: true, fuelLevel: 91 }),
      makeLap({ lapNumber: 3, pitOut: true, fuelLevel: 96 }),
      makeLap({ lapNumber: 4, fuelLevel: 93 }),
    ];
    const stints = deriveStints(laps);
    expect(stints).toHaveLength(2);
    expect(stints[0].startLap).toBe(0);
    expect(stints[0].endLap).toBe(2);
    expect(stints[1].startLap).toBe(3);
    expect(stints[1].endLap).toBe(4);
  });

  it("numbers stints sequentially starting at 1", () => {
    const laps = [
      makeLap({ lapNumber: 0, pitIn: true }),
      makeLap({ lapNumber: 1, pitOut: true }),
    ];
    const stints = deriveStints(laps);
    expect(stints[0].stintNumber).toBe(1);
    expect(stints[1].stintNumber).toBe(2);
  });

  it("computes avg and best lap time over valid (>0) lap times only", () => {
    const laps = [
      makeLap({ lapNumber: 0, lapTimeMs: -1 }), // e.g. an out-lap iRacing marked invalid
      makeLap({ lapNumber: 1, lapTimeMs: 140000 }),
      makeLap({ lapNumber: 2, lapTimeMs: 136000 }),
    ];
    const [stint] = deriveStints(laps);
    expect(stint.bestLapTimeMs).toBe(136000);
    expect(stint.avgLapTimeMs).toBe(138000); // (140000 + 136000) / 2
  });

  it("backs out fuelAtStart from the first lap's end-of-lap reading + that lap's usage", () => {
    const laps = [makeLap({ lapNumber: 0, fuelLevel: 97, fuelUsed: 3 })];
    const [stint] = deriveStints(laps);
    expect(stint.fuelAtStart).toBe(100);
    expect(stint.fuelAtEnd).toBe(97);
  });

  it("leaves fuelAddedAtPrevStop undefined for the first stint of the race", () => {
    const laps = [makeLap({ lapNumber: 0 })];
    const [stint] = deriveStints(laps);
    expect(stint.fuelAddedAtPrevStop).toBeUndefined();
  });

  it("computes fuelAddedAtPrevStop as the jump between stints' fuel readings", () => {
    const laps = [
      makeLap({ lapNumber: 0, pitIn: true, fuelLevel: 5, fuelUsed: 3 }), // ends stint 1 with 5L left
      makeLap({ lapNumber: 1, pitOut: true, fuelLevel: 97, fuelUsed: 3 }), // stint 2 starts with 97+3=100L
    ];
    const stints = deriveStints(laps);
    expect(stints[1].fuelAddedAtPrevStop).toBe(95); // 100 - 5
  });

  it("clamps a small negative fuel delta (measurement noise) to 0 rather than reporting negative fuel added", () => {
    const laps = [
      makeLap({ lapNumber: 0, pitIn: true, fuelLevel: 10, fuelUsed: 3 }), // ends stint 1 with 10L
      makeLap({ lapNumber: 1, pitOut: true, fuelLevel: 6, fuelUsed: 3 }), // stint 2 "starts" with 9L (< 10L, no real refuel)
    ];
    const stints = deriveStints(laps);
    expect(stints[1].fuelAddedAtPrevStop).toBe(0);
  });

  it("throws if a lap has no Garage61 fuel data (e.g. an iRacing-only full-field car)", () => {
    const laps = [makeLap({ lapNumber: 0, fuelLevel: undefined, fuelUsed: undefined })];
    expect(() => deriveStints(laps)).toThrow(/Garage61 fuel data/);
  });
});
