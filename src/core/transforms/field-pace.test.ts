import { describe, expect, it } from "vitest";
import type {
  LapRecord,
  RawIracingExport,
  RawIracingFinishingPosition,
  RawIracingLapDataEntry,
  RawIracingLapEntry,
} from "../types/race-data";
import { computeFieldPace, computeOurPaceVsField } from "./field-pace";

function makeFinishingPosition(
  overrides: Partial<RawIracingFinishingPosition> = {},
): RawIracingFinishingPosition {
  return {
    team_id: 1,
    display_name: "Test Team",
    car_id: 1,
    car_name: "Mock GT3",
    car_class_id: 10,
    car_class_name: "GT3",
    finish_position: 0,
    finish_position_in_class: 0,
    starting_position: 0,
    best_lap_num: 1,
    best_lap_time: 1000000,
    average_lap: 1000000,
    laps_complete: 10,
    laps_lead: 0,
    incidents: 0,
    reason_out: "Running",
    new_license_level: 5,
    old_license_level: 5,
    new_sub_level: 450,
    old_sub_level: 450,
    newi_rating: 3000,
    oldi_rating: 3000,
    driver_results: [],
    ...overrides,
  };
}

function makeLapEntry(overrides: Partial<RawIracingLapEntry> = {}): RawIracingLapEntry {
  return {
    group_id: 1,
    name: "Test Team",
    cust_id: 1,
    display_name: "Test Driver",
    lap_number: 1,
    flags: 0,
    incident: false,
    session_time: 1000000,
    lap_time: 1000000, // 100.0000s
    team_fastest_lap: false,
    personal_best_lap: false,
    car_number: "1",
    lap_events: [],
    lap_position: 1,
    interval: null,
    interval_units: null,
    fastest_lap: false,
    ai: false,
    ...overrides,
  };
}

/** Builds a one-lapData-entry-per-team raw export, each with a single
 *  lap_N key — enough control to test computeFieldPace's filtering without
 *  needing a full multi-lap fixture. */
function makeRawExport(
  teams: Array<{ teamId: number; carClassId?: number; lap: Partial<RawIracingLapEntry> }>,
): RawIracingExport {
  return {
    subsession_id: 1,
    lapData: teams.map(({ teamId, carClassId, lap }) => {
      const entry: RawIracingLapDataEntry = {
        finishing_position: makeFinishingPosition({ team_id: teamId, car_class_id: carClassId ?? 10 }),
      };
      entry[`lap_${lap.lap_number ?? 1}`] = makeLapEntry({ group_id: teamId, ...lap });
      return entry;
    }),
  };
}

describe("computeFieldPace", () => {
  it("computes the median clean lap time across the field at a lap number", () => {
    const raw = makeRawExport([
      { teamId: 1, lap: { lap_number: 1, lap_time: 1000000 } }, // 100.0s
      { teamId: 2, lap: { lap_number: 1, lap_time: 1050000 } }, // 105.0s
      { teamId: 3, lap: { lap_number: 1, lap_time: 1100000 } }, // 110.0s
    ]);
    const field = computeFieldPace(raw, { minSamples: 3 });
    expect(field).toEqual([{ lapNumber: 1, fieldMedianLapTimeMs: 105000, sampleSize: 3 }]);
  });

  it("excludes a lap flagged with any lap_events (e.g. a pit lap) from the median", () => {
    const raw = makeRawExport([
      { teamId: 1, lap: { lap_number: 1, lap_time: 1000000 } },
      { teamId: 2, lap: { lap_number: 1, lap_time: 1050000 } },
      { teamId: 3, lap: { lap_number: 1, lap_time: 9000000, lap_events: ["pitted"] } }, // in/out lap, way slower
    ]);
    const field = computeFieldPace(raw, { minSamples: 2 });
    // Team 3's pit lap is excluded, so only 2 samples remain and the median is between them.
    expect(field).toEqual([{ lapNumber: 1, fieldMedianLapTimeMs: 1025000 / 10, sampleSize: 2 }]);
  });

  it("drops a lap number entirely when fewer than minSamples cars have a clean lap there", () => {
    const raw = makeRawExport([
      { teamId: 1, lap: { lap_number: 1, lap_time: 1000000 } },
      { teamId: 2, lap: { lap_number: 1, lap_time: 1050000 } },
    ]);
    const field = computeFieldPace(raw, { minSamples: 3 });
    expect(field).toEqual([]);
  });

  it("restricts the field to a given car class when carClassId is provided", () => {
    const raw = makeRawExport([
      { teamId: 1, carClassId: 10, lap: { lap_number: 1, lap_time: 1000000 } },
      { teamId: 2, carClassId: 10, lap: { lap_number: 1, lap_time: 1050000 } },
      { teamId: 3, carClassId: 20, lap: { lap_number: 1, lap_time: 700000 } }, // faster class, would skew if not excluded
    ]);
    const field = computeFieldPace(raw, { carClassId: 10, minSamples: 2 });
    expect(field).toEqual([{ lapNumber: 1, fieldMedianLapTimeMs: 1025000 / 10, sampleSize: 2 }]);
  });

  it("smooths a one-lap outlier median using the surrounding lap numbers", () => {
    const raw: RawIracingExport = {
      subsession_id: 1,
      lapData: [
        {
          finishing_position: makeFinishingPosition({ team_id: 1 }),
          lap_1: makeLapEntry({ group_id: 1, lap_number: 1, lap_time: 1000000 }),
          lap_2: makeLapEntry({ group_id: 1, lap_number: 2, lap_time: 1000000 }),
          lap_3: makeLapEntry({ group_id: 1, lap_number: 3, lap_time: 5000000 }), // one-off outlier
          lap_4: makeLapEntry({ group_id: 1, lap_number: 4, lap_time: 1000000 }),
          lap_5: makeLapEntry({ group_id: 1, lap_number: 5, lap_time: 1000000 }),
        },
        {
          finishing_position: makeFinishingPosition({ team_id: 2 }),
          lap_1: makeLapEntry({ group_id: 2, lap_number: 1, lap_time: 1000000 }),
          lap_2: makeLapEntry({ group_id: 2, lap_number: 2, lap_time: 1000000 }),
          lap_3: makeLapEntry({ group_id: 2, lap_number: 3, lap_time: 1000000 }),
          lap_4: makeLapEntry({ group_id: 2, lap_number: 4, lap_time: 1000000 }),
          lap_5: makeLapEntry({ group_id: 2, lap_number: 5, lap_time: 1000000 }),
        },
      ],
    };
    const field = computeFieldPace(raw, { minSamples: 2, smoothingWindowLaps: 2 });
    const lap3 = field.find((p) => p.lapNumber === 3);
    // Raw median at lap 3 is 300s (outlier), but smoothed against laps 1,2,4,5 (all 100s) it settles back to 100s.
    expect(lap3?.fieldMedianLapTimeMs).toBe(100000);
  });
});

describe("computeOurPaceVsField", () => {
  const fieldPace = [
    { lapNumber: 1, fieldMedianLapTimeMs: 100000, sampleSize: 5 },
    { lapNumber: 2, fieldMedianLapTimeMs: 101000, sampleSize: 5 },
  ];

  function makeLap(overrides: Partial<LapRecord> = {}): LapRecord {
    return {
      lapNumber: 1,
      driverName: "Test Driver",
      teamName: "Test Team",
      lapTimeMs: 100000,
      ...overrides,
    };
  }

  it("computes a positive delta when our lap was slower than the field", () => {
    const [point] = computeOurPaceVsField([makeLap({ lapTimeMs: 102000 })], fieldPace);
    expect(point.deltaMs).toBe(2000);
  });

  it("computes a negative delta when our lap was faster than the field", () => {
    const [point] = computeOurPaceVsField([makeLap({ lapTimeMs: 98000 })], fieldPace);
    expect(point.deltaMs).toBe(-2000);
  });

  it("leaves fieldMedianLapTimeMs/deltaMs undefined for a lap number the field pace has no data for", () => {
    const [point] = computeOurPaceVsField([makeLap({ lapNumber: 99, lapTimeMs: 100000 })], fieldPace);
    expect(point.fieldMedianLapTimeMs).toBeUndefined();
    expect(point.deltaMs).toBeUndefined();
  });

  it("excludes invalid laps (lapTimeMs <= 0)", () => {
    const points = computeOurPaceVsField([makeLap({ lapTimeMs: -1 })], fieldPace);
    expect(points).toEqual([]);
  });

  it("flags pitAffected and excludes deltaMs for a lap iRacing itself flagged as pit-related", () => {
    const [point] = computeOurPaceVsField(
      [makeLap({ lapTimeMs: 145000, pitAffected: true })],
      fieldPace,
    );
    expect(point.pitAffected).toBe(true);
    expect(point.deltaMs).toBeUndefined();
    // fieldMedianLapTimeMs is still reported — only the (misleading) delta is suppressed.
    expect(point.fieldMedianLapTimeMs).toBe(100000);
  });

  it("flags pitAffected from Garage61's pitIn/pitOut too, when present without the iRacing-sourced flag", () => {
    const [pitInPoint] = computeOurPaceVsField([makeLap({ pitIn: true })], fieldPace);
    const [pitOutPoint] = computeOurPaceVsField([makeLap({ pitOut: true })], fieldPace);
    expect(pitInPoint.pitAffected).toBe(true);
    expect(pitInPoint.deltaMs).toBeUndefined();
    expect(pitOutPoint.pitAffected).toBe(true);
    expect(pitOutPoint.deltaMs).toBeUndefined();
  });

  it("does not flag pitAffected for an ordinary green-flag lap", () => {
    const [point] = computeOurPaceVsField([makeLap()], fieldPace);
    expect(point.pitAffected).toBe(false);
  });
});
