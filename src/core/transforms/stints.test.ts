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

  // fuelLevel is a START-of-lap reading (verified across every consecutive
  // lap pair in /ref_data), and on a pit-out lap it predates that stop's
  // refuel — so leaving the box is reading + fuelAdded, and end-of-stint is
  // the last lap's reading minus that lap's own burn.
  it("reads fuelAtStart as the first lap's start-of-lap level plus that lap's refuel", () => {
    const laps = [makeLap({ lapNumber: 0, pitOut: true, fuelLevel: 20, fuelAdded: 80, fuelUsed: 3 })];
    const [stint] = deriveStints(laps);
    expect(stint.fuelAtStart).toBe(100);
    expect(stint.fuelAtEnd).toBe(17); // 20 - 3
  });

  it("takes the final lap's own burn off fuelAtEnd", () => {
    const laps = [
      makeLap({ lapNumber: 0, fuelLevel: 50, fuelUsed: 3 }),
      makeLap({ lapNumber: 1, fuelLevel: 47, fuelUsed: 3 }),
    ];
    const [stint] = deriveStints(laps);
    expect(stint.fuelAtEnd).toBe(44);
  });

  it("leaves fuelAddedAtPrevStop undefined when no lap carries the Garage61 column", () => {
    const laps = [makeLap({ lapNumber: 0 })];
    const [stint] = deriveStints(laps);
    expect(stint.fuelAddedAtPrevStop).toBeUndefined();
  });

  it("takes fuelAddedAtPrevStop from the exact Fuel added column, not a fuel-level delta", () => {
    const laps = [
      makeLap({ lapNumber: 0, pitIn: true, fuelLevel: 8, fuelUsed: 3, fuelAdded: 0 }),
      // The pit-out reading predates the fill, so the old level-delta approach
      // saw only ~3L here. The column says 77L, and 77L is the answer.
      makeLap({ lapNumber: 1, pitOut: true, fuelLevel: 5, fuelUsed: 3, fuelAdded: 77 }),
    ];
    const stints = deriveStints(laps);
    expect(stints[1].fuelAddedAtPrevStop).toBe(77);
  });

  it("reports 0 for a genuine no-fuel service rather than treating it as unknown", () => {
    const laps = [
      makeLap({ lapNumber: 0, pitIn: true, fuelLevel: 30, fuelUsed: 3, fuelAdded: 0 }),
      makeLap({ lapNumber: 1, pitOut: true, fuelLevel: 27, fuelUsed: 3, fuelAdded: 0 }),
    ];
    const stints = deriveStints(laps);
    expect(stints[1].fuelAddedAtPrevStop).toBe(0);
  });

  it("throws if a lap has no Garage61 fuel data (e.g. an iRacing-only full-field car)", () => {
    const laps = [makeLap({ lapNumber: 0, fuelLevel: undefined, fuelUsed: undefined })];
    expect(() => deriveStints(laps)).toThrow(/Garage61 fuel data/);
  });

  // Garage61 doesn't always have every lap — a real Le Mans run was missing the
  // in-lap for its second stop, leaving only the out-lap. Splitting on pitIn
  // alone merged two stints into one that looked entirely plausible while its
  // fuel figures and pace trend spanned a pit stop.
  it("starts a new stint at a pit-out even when that stop's in-lap is missing", () => {
    const laps = [
      makeLap({ lapNumber: 10, pitOut: true, fuelLevel: 97 }),
      makeLap({ lapNumber: 11, fuelLevel: 94 }),
      makeLap({ lapNumber: 17, fuelLevel: 60 }),
      // lap 18, the in-lap, is absent from the data entirely
      makeLap({ lapNumber: 19, pitOut: true, fuelLevel: 96 }),
      makeLap({ lapNumber: 20, fuelLevel: 93 }),
    ];
    const stints = deriveStints(laps);

    expect(stints).toHaveLength(2);
    expect(stints[0].startLap).toBe(10);
    expect(stints[0].endLap).toBe(17);
    expect(stints[1].startLap).toBe(19);
    expect(stints[1].endLap).toBe(20);
  });

  it("numbers stints consecutively when a boundary comes from a pit-out", () => {
    const laps = [
      makeLap({ lapNumber: 0, pitOut: true, fuelLevel: 97 }),
      makeLap({ lapNumber: 1, pitIn: true, fuelLevel: 94 }),
      makeLap({ lapNumber: 2, pitOut: true, fuelLevel: 96 }),
      // in-lap missing again
      makeLap({ lapNumber: 4, pitOut: true, fuelLevel: 95 }),
    ];
    const stints = deriveStints(laps);

    expect(stints.map((s) => s.stintNumber)).toEqual([1, 2, 3]);
  });

  it("does not emit an empty stint for the normal pit-in then pit-out pair", () => {
    const laps = [
      makeLap({ lapNumber: 0, fuelLevel: 97 }),
      makeLap({ lapNumber: 1, pitIn: true, fuelLevel: 94 }),
      makeLap({ lapNumber: 2, pitOut: true, fuelLevel: 96 }),
      makeLap({ lapNumber: 3, fuelLevel: 93 }),
    ];
    const stints = deriveStints(laps);

    expect(stints).toHaveLength(2);
    expect(stints.every((stint) => stint.laps.length > 0)).toBe(true);
    expect(stints[1].startLap).toBe(2);
  });

  // A single lap that entered and left the box — /ref_data has one at 4917s.
  // It's the in-lap, not a stint of its own.
  it("treats a lap flagged both pit-in and pit-out as ending a stint, not opening one", () => {
    const laps = [
      makeLap({ lapNumber: 0, fuelLevel: 97 }),
      makeLap({ lapNumber: 1, pitIn: true, pitOut: true, fuelLevel: 94, lapTimeMs: 4_917_000 }),
      makeLap({ lapNumber: 2, fuelLevel: 96 }),
    ];
    const stints = deriveStints(laps);

    expect(stints).toHaveLength(2);
    expect(stints[0].endLap).toBe(1);
    expect(stints[0].laps).toHaveLength(2);
    expect(stints[1].startLap).toBe(2);
  });
});
