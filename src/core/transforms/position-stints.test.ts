import { describe, expect, it } from "vitest";
import type { LapRecord } from "../types/race-data";
import { computePositionStints } from "./position-stints";

function makeLap(overrides: Partial<LapRecord> = {}): LapRecord {
  return {
    lapNumber: 1,
    driverName: "Test Driver",
    teamName: "Test Team",
    lapTimeMs: 100000,
    trackPositionAtLap: 5,
    ...overrides,
  };
}

describe("computePositionStints", () => {
  it("returns a single stint spanning the whole race when there are no pit stops", () => {
    const laps = [1, 2, 3].map((n) => makeLap({ lapNumber: n, trackPositionAtLap: 5 }));
    const stints = computePositionStints(laps);
    expect(stints).toEqual([
      {
        stintNumber: 1,
        driverName: "Test Driver",
        startLap: 1,
        endLap: 3,
        positionAtStart: 5,
        positionAtEnd: 5,
        netPositionChange: 0,
      },
    ]);
  });

  it("splits into two stints across a standard two-lap pit run (in-lap + out-lap)", () => {
    const laps = [
      makeLap({ lapNumber: 1, trackPositionAtLap: 8 }),
      makeLap({ lapNumber: 2, trackPositionAtLap: 6 }),
      makeLap({ lapNumber: 3, trackPositionAtLap: 5, pitAffected: true }), // in-lap
      makeLap({ lapNumber: 4, trackPositionAtLap: 9, pitAffected: true }), // out-lap, dropped places
      makeLap({ lapNumber: 5, trackPositionAtLap: 7 }),
      makeLap({ lapNumber: 6, trackPositionAtLap: 4 }), // gained it all back and then some
    ];
    const stints = computePositionStints(laps);
    expect(stints).toEqual([
      {
        stintNumber: 1,
        driverName: "Test Driver",
        startLap: 1,
        endLap: 3,
        positionAtStart: 8,
        positionAtEnd: 5,
        netPositionChange: 3,
      },
      {
        stintNumber: 2,
        driverName: "Test Driver",
        startLap: 4,
        endLap: 6,
        positionAtStart: 9,
        positionAtEnd: 4,
        netPositionChange: 5,
      },
    ]);
  });

  it("reports a negative netPositionChange when we lost places over a stint", () => {
    const laps = [
      makeLap({ lapNumber: 1, trackPositionAtLap: 3 }),
      makeLap({ lapNumber: 2, trackPositionAtLap: 7 }),
    ];
    const stints = computePositionStints(laps);
    expect(stints[0].netPositionChange).toBe(-4);
  });

  it("treats a single-lap pit run as a shared boundary lap between two stints", () => {
    const laps = [
      makeLap({ lapNumber: 1, trackPositionAtLap: 8 }),
      makeLap({ lapNumber: 2, trackPositionAtLap: 6, pitAffected: true }),
      makeLap({ lapNumber: 3, trackPositionAtLap: 5 }),
    ];
    const stints = computePositionStints(laps);
    expect(stints).toHaveLength(2);
    expect(stints[0]).toMatchObject({ startLap: 1, endLap: 2, positionAtEnd: 6 });
    expect(stints[1]).toMatchObject({ startLap: 2, endLap: 3, positionAtStart: 6 });
  });

  it("detects a pit-affected lap from Garage61's pitIn/pitOut too, not just the iRacing pitAffected flag", () => {
    const laps = [
      makeLap({ lapNumber: 1, trackPositionAtLap: 8 }),
      makeLap({ lapNumber: 2, trackPositionAtLap: 6, pitIn: true }),
      makeLap({ lapNumber: 3, trackPositionAtLap: 9, pitOut: true }),
      makeLap({ lapNumber: 4, trackPositionAtLap: 7 }),
    ];
    const stints = computePositionStints(laps);
    expect(stints).toHaveLength(2);
    expect(stints[1].startLap).toBe(3);
  });

  it("attributes each stint's driver from its first lap, following a driver swap at a stop", () => {
    const laps = [
      makeLap({ lapNumber: 1, driverName: "Driver A", trackPositionAtLap: 8 }),
      makeLap({ lapNumber: 2, driverName: "Driver A", trackPositionAtLap: 6, pitAffected: true }),
      makeLap({ lapNumber: 3, driverName: "Driver B", trackPositionAtLap: 10, pitAffected: true }),
      makeLap({ lapNumber: 4, driverName: "Driver B", trackPositionAtLap: 9 }),
    ];
    const stints = computePositionStints(laps);
    expect(stints[0].driverName).toBe("Driver A");
    expect(stints[1].driverName).toBe("Driver B");
  });

  it("returns an empty array when no laps have a track position (e.g. Garage61-only data)", () => {
    const laps = [makeLap({ trackPositionAtLap: undefined })];
    expect(computePositionStints(laps)).toEqual([]);
  });
});
