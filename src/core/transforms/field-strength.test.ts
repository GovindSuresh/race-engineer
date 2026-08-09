import { describe, expect, it } from "vitest";
import type {
  DriverRating,
  RawIracingExport,
  RawIracingLapDataEntry,
  RawIracingLapEntry,
} from "../types/race-data";
import { computeFieldStrength } from "./field-strength";

function makeLap(overrides: Partial<RawIracingLapEntry> = {}): RawIracingLapEntry {
  return {
    group_id: 100,
    name: "Test Team",
    cust_id: 1001,
    display_name: "Alex Driver",
    lap_number: 1,
    flags: 0,
    incident: false,
    session_time: 1000000,
    lap_time: 1380000,
    team_fastest_lap: false,
    personal_best_lap: false,
    car_number: "1",
    lap_events: [],
    lap_position: 1,
    interval: 0,
    interval_units: "ms",
    fastest_lap: false,
    ai: false,
    ...overrides,
  };
}

/** Builds an export where each entry is one team, with the given laps. */
function makeRawExport(
  teams: Array<{ teamId: number; carClassId: number; laps: RawIracingLapEntry[] }>,
): RawIracingExport {
  const lapData: RawIracingLapDataEntry[] = teams.map((team) => {
    const entry = {
      finishing_position: {
        team_id: team.teamId,
        display_name: `Team ${team.teamId}`,
        car_id: 1,
        car_name: "Test Car",
        car_class_id: team.carClassId,
        car_class_name: "Test Class",
        finish_position: 0,
        finish_position_in_class: 0,
        starting_position: 0,
        best_lap_num: 1,
        best_lap_time: 1380000,
        average_lap: 1380000,
        laps_complete: team.laps.length,
        laps_lead: 0,
        incidents: 0,
        reason_out: "Running",
        new_license_level: -1,
        old_license_level: -1,
        new_sub_level: -1,
        old_sub_level: -1,
        newi_rating: -1,
        oldi_rating: -1,
        driver_results: [],
      },
    } as RawIracingLapDataEntry;
    for (const lap of team.laps) entry[`lap_${lap.lap_number}`] = lap;
    return entry;
  });
  return { subsession_id: 1, lapData };
}

function ratings(entries: Array<[custId: number, iRating: number | undefined]>) {
  const map = new Map<number, DriverRating>();
  for (const [custId, iRating] of entries) {
    map.set(custId, {
      custId,
      driverName: `Driver ${custId}`,
      teamId: 0,
      iRatingBefore: iRating,
    });
  }
  return map;
}

describe("computeFieldStrength", () => {
  it("averages the iRating of drivers on track at each lap", () => {
    const raw = makeRawExport([
      { teamId: 100, carClassId: 1, laps: [makeLap({ cust_id: 1001, group_id: 100 })] },
      { teamId: 200, carClassId: 1, laps: [makeLap({ cust_id: 2001, group_id: 200 })] },
    ]);
    const result = computeFieldStrength(raw, ratings([[1001, 3000], [2001, 2000]]), {
      minSamples: 1,
    });
    expect(result).toEqual([
      { lapNumber: 1, averageIRating: 2500, sampleSize: 2, driversOnTrack: 2 },
    ]);
  });

  it("tracks the field getting stronger as weaker cars retire", () => {
    // Lap 1: both cars. Lap 2: only the strong car is still going.
    const raw = makeRawExport([
      {
        teamId: 100,
        carClassId: 1,
        laps: [
          makeLap({ cust_id: 1001, group_id: 100, lap_number: 1 }),
          makeLap({ cust_id: 1001, group_id: 100, lap_number: 2 }),
        ],
      },
      { teamId: 200, carClassId: 1, laps: [makeLap({ cust_id: 2001, group_id: 200 })] },
    ]);
    const result = computeFieldStrength(raw, ratings([[1001, 4000], [2001, 2000]]), {
      minSamples: 1,
    });
    expect(result.map((p) => p.averageIRating)).toEqual([3000, 4000]);
  });

  it("reflects a driver swap — the same car with a different driver on track", () => {
    // One team, one car: a slow driver for lap 1, a fast one for lap 2.
    const raw = makeRawExport([
      {
        teamId: 100,
        carClassId: 1,
        laps: [
          makeLap({ cust_id: 1001, group_id: 100, lap_number: 1 }),
          makeLap({ cust_id: 1002, group_id: 100, lap_number: 2 }),
        ],
      },
    ]);
    const result = computeFieldStrength(raw, ratings([[1001, 2000], [1002, 4000]]), {
      minSamples: 1,
    });
    expect(result.map((p) => p.averageIRating)).toEqual([2000, 4000]);
  });

  it("drops laps with fewer rated drivers than minSamples — the sparse-tail guard", () => {
    const raw = makeRawExport([
      {
        teamId: 100,
        carClassId: 1,
        laps: [
          makeLap({ cust_id: 1001, group_id: 100, lap_number: 1 }),
          makeLap({ cust_id: 1001, group_id: 100, lap_number: 2 }),
        ],
      },
      { teamId: 200, carClassId: 1, laps: [makeLap({ cust_id: 2001, group_id: 200 })] },
    ]);
    // Lap 1 has 2 drivers, lap 2 has 1 — with minSamples 2 only lap 1 survives.
    const result = computeFieldStrength(raw, ratings([[1001, 3000], [2001, 2000]]), {
      minSamples: 2,
    });
    expect(result.map((p) => p.lapNumber)).toEqual([1]);
  });

  it("scopes to one car class so an LMP2 field doesn't skew a GT3 comparison", () => {
    const raw = makeRawExport([
      { teamId: 100, carClassId: 1, laps: [makeLap({ cust_id: 1001, group_id: 100 })] },
      { teamId: 200, carClassId: 2, laps: [makeLap({ cust_id: 2001, group_id: 200 })] },
    ]);
    const result = computeFieldStrength(raw, ratings([[1001, 3000], [2001, 9000]]), {
      carClassId: 1,
      minSamples: 1,
    });
    expect(result).toEqual([
      { lapNumber: 1, averageIRating: 3000, sampleSize: 1, driversOnTrack: 1 },
    ]);
  });

  it("counts an unrated driver as on track but leaves them out of the average", () => {
    const raw = makeRawExport([
      { teamId: 100, carClassId: 1, laps: [makeLap({ cust_id: 1001, group_id: 100 })] },
      { teamId: 200, carClassId: 1, laps: [makeLap({ cust_id: 2001, group_id: 200 })] },
    ]);
    const result = computeFieldStrength(raw, ratings([[1001, 3000], [2001, undefined]]), {
      minSamples: 1,
    });
    expect(result[0]).toEqual({
      lapNumber: 1,
      averageIRating: 3000,
      sampleSize: 1,
      driversOnTrack: 2,
    });
  });

  it("counts pit and incident laps — a car serving a stop was still out there", () => {
    const raw = makeRawExport([
      {
        teamId: 100,
        carClassId: 1,
        laps: [makeLap({ cust_id: 1001, group_id: 100, lap_events: ["pitted"] })],
      },
    ]);
    const result = computeFieldStrength(raw, ratings([[1001, 3000]]), { minSamples: 1 });
    expect(result).toHaveLength(1);
  });

  it("skips lap 0 and untimed laps", () => {
    const raw = makeRawExport([
      {
        teamId: 100,
        carClassId: 1,
        laps: [
          makeLap({ cust_id: 1001, group_id: 100, lap_number: 0, lap_time: -1 }),
          makeLap({ cust_id: 1001, group_id: 100, lap_number: 1, lap_time: -1 }),
        ],
      },
    ]);
    expect(computeFieldStrength(raw, ratings([[1001, 3000]]), { minSamples: 1 })).toEqual([]);
  });

  it("returns an empty array when no ratings are available at all", () => {
    const raw = makeRawExport([
      { teamId: 100, carClassId: 1, laps: [makeLap({ cust_id: 1001, group_id: 100 })] },
    ]);
    expect(computeFieldStrength(raw, new Map(), { minSamples: 1 })).toEqual([]);
  });
});
