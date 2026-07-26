import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { LapRecord, RaceSummary, RawIracingExport, TeamRaceResult } from "../types/race-data";
import { parseIracingJson } from "../parsers/iracing-json";
import { buildRaceSummary } from "./race-summary";
import { computeRaceKpis } from "./race-kpis";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "../parsers/__fixtures__/iracing-sample.json"), "utf-8"),
) as RawIracingExport;

// Team Alpha = 9001 (300 laps, best 136.0s), Team Beta = 9002 (299 laps),
// Team Gamma = 9003 (250 laps) — see race-summary.test.ts for the full layout.

describe("computeRaceKpis", () => {
  it("derives finish position, laps-down, and best lap from a RaceSummary built with no Garage61 data", () => {
    const allLaps = parseIracingJson(fixture);
    const summary = buildRaceSummary(fixture, allLaps, 9002);
    const kpis = computeRaceKpis(summary);

    expect(kpis.finishPosition).toBe(2);
    expect(kpis.fieldSize).toBe(3);
    expect(kpis.finishPositionInClass).toBe(2);
    expect(kpis.classSize).toBe(3);
    expect(kpis.lapsCompleted).toBe(299);
    expect(kpis.lapsDownFromLeader).toBe(1); // Team Alpha completed 300
    expect(kpis.bestLapDriverName).toBe("Driver B1");
    expect(kpis.bestLapTimeMs).toBeCloseTo(140000, 0); // 1400000 ticks / 10
    expect(kpis.totalIncidents).toBe(6);
  });

  it("leaves pitStopCount/totalFuelUsedLiters undefined when no lap carries Garage61 data", () => {
    const allLaps = parseIracingJson(fixture);
    const summary = buildRaceSummary(fixture, allLaps, 9001);
    const kpis = computeRaceKpis(summary);

    expect(kpis.pitStopCount).toBeUndefined();
    expect(kpis.totalFuelUsedLiters).toBeUndefined();
  });

  function makeDriverStats(overrides: Partial<TeamRaceResult["drivers"][number]> = {}) {
    return {
      driverName: "Test Driver",
      lapsCompleted: 10,
      bestLapTimeMs: 140000,
      averageLapTimeMs: 142000,
      medianLapTimeMs: 141500,
      stdDevMs: 500,
      top10PctAvgMs: 140200,
      incidentCount: 0,
      stints: [],
      ...overrides,
    };
  }

  it("counts pit stops and sums fuel used once Garage61 data has been merged into ourTeamLaps", () => {
    const ourTeamLaps: LapRecord[] = [
      { lapNumber: 1, driverName: "Test Driver", teamId: 1, teamName: "Test Team", lapTimeMs: 140000, fuelUsed: 3.2, pitIn: false },
      { lapNumber: 2, driverName: "Test Driver", teamId: 1, teamName: "Test Team", lapTimeMs: 141000, fuelUsed: 3.4, pitIn: true },
      { lapNumber: 3, driverName: "Test Driver", teamId: 1, teamName: "Test Team", lapTimeMs: 145000, fuelUsed: 4.0, pitIn: false },
    ];
    const ourTeam: TeamRaceResult = {
      teamName: "Test Team",
      teamId: 1,
      carName: "Mock GT3",
      carClassName: "GT3",
      finishPosition: 0,
      finishPositionInClass: 0,
      startingPosition: 0,
      lapsCompleted: 3,
      lapsLed: 0,
      totalIncidents: 0,
      reasonOut: "Running",
      drivers: [makeDriverStats()],
    };
    const summary: RaceSummary = {
      subsessionId: 1,
      raceLengthLaps: 3,
      ourTeam,
      fieldResults: [],
      ourTeamLaps,
      gapTrend: [],
      paceVsField: [],
      positionStints: [],
      weatherTimeline: [],
    };

    const kpis = computeRaceKpis(summary);
    expect(kpis.pitStopCount).toBe(1);
    expect(kpis.totalFuelUsedLiters).toBeCloseTo(10.6, 5);
  });
});
