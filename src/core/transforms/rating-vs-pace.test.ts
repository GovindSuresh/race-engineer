import { describe, expect, it } from "vitest";
import type {
  DriverRating,
  FieldPacePoint,
  RatingVsPacePoint,
  RawIracingExport,
  RawIracingLapDataEntry,
  RawIracingLapEntry,
} from "../types/race-data";
import { computeRatingVsPace, fitRatingPaceTrend } from "./rating-vs-pace";

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
    lap_time: 1380000, // 138.000s in ticks
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

function makeRawExport(
  teams: Array<{ teamId: number; teamName?: string; carClassId: number; laps: RawIracingLapEntry[] }>,
): RawIracingExport {
  const lapData: RawIracingLapDataEntry[] = teams.map((team) => {
    const entry = {
      finishing_position: {
        team_id: team.teamId,
        display_name: team.teamName ?? `Team ${team.teamId}`,
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

/** N laps for one driver, all at the same lap time. */
function lapsFor(
  custId: number,
  teamId: number,
  count: number,
  lapTimeTicks: number,
): RawIracingLapEntry[] {
  return Array.from({ length: count }, (_, i) =>
    makeLap({
      cust_id: custId,
      group_id: teamId,
      display_name: `Driver ${custId}`,
      lap_number: i + 1,
      lap_time: lapTimeTicks,
    }),
  );
}

/** Field median of 138.000s at every lap number up to `count`. */
function flatFieldPace(count: number, medianMs = 138000): FieldPacePoint[] {
  return Array.from({ length: count }, (_, i) => ({
    lapNumber: i + 1,
    fieldMedianLapTimeMs: medianMs,
    sampleSize: 10,
  }));
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

describe("computeRatingVsPace", () => {
  it("computes each driver's median delta to the field median", () => {
    // 137.000s laps against a 138.000s field median -> -1000ms.
    const raw = makeRawExport([
      { teamId: 100, carClassId: 1, laps: lapsFor(1001, 100, 12, 1370000) },
    ]);
    const result = computeRatingVsPace(raw, flatFieldPace(12), ratings([[1001, 3000]]), 999);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      custId: 1001,
      iRating: 3000,
      medianDeltaMs: -1000,
      lapsCounted: 12,
      isOurTeam: false,
    });
  });

  it("flags drivers on the team the dashboard is focused on", () => {
    const raw = makeRawExport([
      { teamId: 100, carClassId: 1, laps: lapsFor(1001, 100, 12, 1380000) },
      { teamId: 200, carClassId: 1, laps: lapsFor(2001, 200, 12, 1380000) },
    ]);
    const result = computeRatingVsPace(
      raw,
      flatFieldPace(12),
      ratings([[1001, 3000], [2001, 2000]]),
      100,
    );
    expect(result.find((p) => p.custId === 1001)?.isOurTeam).toBe(true);
    expect(result.find((p) => p.custId === 2001)?.isOurTeam).toBe(false);
  });

  it("drops drivers with fewer than minLaps clean laps", () => {
    const raw = makeRawExport([
      { teamId: 100, carClassId: 1, laps: lapsFor(1001, 100, 3, 1380000) },
    ]);
    const result = computeRatingVsPace(raw, flatFieldPace(3), ratings([[1001, 3000]]), 999);
    expect(result).toEqual([]);
  });

  it("drops drivers with no known iRating rather than treating it as zero", () => {
    const raw = makeRawExport([
      { teamId: 100, carClassId: 1, laps: lapsFor(1001, 100, 12, 1380000) },
    ]);
    const result = computeRatingVsPace(raw, flatFieldPace(12), ratings([[1001, undefined]]), 999);
    expect(result).toEqual([]);
  });

  it("excludes pit and incident laps from the median", () => {
    // 11 clean 137s laps plus one 200s pit lap; the pit lap must not count.
    const laps = lapsFor(1001, 100, 11, 1370000);
    laps.push(
      makeLap({
        cust_id: 1001,
        group_id: 100,
        lap_number: 12,
        lap_time: 2000000,
        lap_events: ["pitted"],
      }),
    );
    const raw = makeRawExport([{ teamId: 100, carClassId: 1, laps }]);
    const result = computeRatingVsPace(raw, flatFieldPace(12), ratings([[1001, 3000]]), 999, {
      minLaps: 5,
    });
    expect(result[0].lapsCounted).toBe(11);
    expect(result[0].medianDeltaMs).toBe(-1000);
  });

  it("scopes to one car class", () => {
    const raw = makeRawExport([
      { teamId: 100, carClassId: 1, laps: lapsFor(1001, 100, 12, 1380000) },
      { teamId: 200, carClassId: 2, laps: lapsFor(2001, 200, 12, 1380000) },
    ]);
    const result = computeRatingVsPace(
      raw,
      flatFieldPace(12),
      ratings([[1001, 3000], [2001, 2000]]),
      999,
      { carClassId: 1 },
    );
    expect(result.map((p) => p.custId)).toEqual([1001]);
  });

  it("ignores laps the field has no median for", () => {
    const raw = makeRawExport([
      { teamId: 100, carClassId: 1, laps: lapsFor(1001, 100, 20, 1380000) },
    ]);
    // Field median only covers the first 12 laps.
    const result = computeRatingVsPace(raw, flatFieldPace(12), ratings([[1001, 3000]]), 999);
    expect(result[0].lapsCounted).toBe(12);
  });

  it("returns points sorted by iRating, so the scatter reads left to right", () => {
    const raw = makeRawExport([
      { teamId: 100, carClassId: 1, laps: lapsFor(1001, 100, 12, 1380000) },
      { teamId: 200, carClassId: 1, laps: lapsFor(2001, 200, 12, 1380000) },
      { teamId: 300, carClassId: 1, laps: lapsFor(3001, 300, 12, 1380000) },
    ]);
    const result = computeRatingVsPace(
      raw,
      flatFieldPace(12),
      ratings([[1001, 3000], [2001, 1500], [3001, 4500]]),
      999,
    );
    expect(result.map((p) => p.iRating)).toEqual([1500, 3000, 4500]);
  });
});

describe("fitRatingPaceTrend", () => {
  function point(iRating: number, medianDeltaMs: number): RatingVsPacePoint {
    return {
      custId: iRating,
      driverName: "d",
      teamId: 1,
      teamName: "t",
      iRating,
      medianDeltaMs,
      lapsCounted: 20,
      isOurTeam: false,
    };
  }

  it("fits a negative slope when higher-rated drivers are quicker", () => {
    // +1000ms at 2000 iR down to -1000ms at 4000 iR -> -1ms per iRating point.
    const trend = fitRatingPaceTrend([
      point(2000, 1000),
      point(3000, 0),
      point(4000, -1000),
    ])!;
    expect(trend.msPerIRatingPoint).toBeCloseTo(-1, 6);
    // At 3000 iR the fit should predict 0ms.
    expect(trend.interceptMs + trend.msPerIRatingPoint * 3000).toBeCloseTo(0, 6);
  });

  it("returns undefined below three points", () => {
    expect(fitRatingPaceTrend([point(2000, 0), point(3000, 0)])).toBeUndefined();
  });

  it("returns undefined when every driver shares one rating", () => {
    expect(
      fitRatingPaceTrend([point(3000, 100), point(3000, 0), point(3000, -100)]),
    ).toBeUndefined();
  });
});
