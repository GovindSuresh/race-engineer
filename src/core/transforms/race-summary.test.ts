import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RawIracingExport } from "../types/race-data";
import { parseIracingJson } from "../parsers/iracing-json";
import { buildRaceSummary } from "./race-summary";

const fixture = JSON.parse(
  readFileSync(
    join(__dirname, "../parsers/__fixtures__/iracing-sample.json"),
    "utf-8",
  ),
) as RawIracingExport;

// Team Alpha = 9001 (cust 5001), Team Beta = 9002 (cust 5003), Team Gamma = 9003 (cust 5005)

describe("buildRaceSummary", () => {
  it("builds ourTeam from the given ourTeamId's finishing_position", () => {
    const allLaps = parseIracingJson(fixture);
    const summary = buildRaceSummary(fixture, allLaps, 9002);
    expect(summary.ourTeam.teamName).toBe("Team Beta");
    expect(summary.ourTeam.finishPosition).toBe(1);
    expect(summary.ourTeam.drivers).toHaveLength(1);
    expect(summary.ourTeam.drivers[0].driverName).toBe("Driver B1");
  });

  it("puts every other team in fieldResults, excluding ourTeam", () => {
    const allLaps = parseIracingJson(fixture);
    const summary = buildRaceSummary(fixture, allLaps, 9002);
    expect(summary.fieldResults.map((t) => t.teamName).sort()).toEqual([
      "Team Alpha",
      "Team Gamma",
    ]);
  });

  it("throws a clear error when ourTeamId doesn't match any team", () => {
    const allLaps = parseIracingJson(fixture);
    expect(() => buildRaceSummary(fixture, allLaps, 999999)).toThrow(/999999/);
  });

  it("follows the gap trend across a position swap — Team Beta's lap 300 is nested under entry 0 (Team Alpha) in the raw file", () => {
    const allLaps = parseIracingJson(fixture);
    const summary = buildRaceSummary(fixture, allLaps, 9002);
    const lapNumbers = summary.gapTrend.map((p) => p.lapNumber);
    expect(lapNumbers).toEqual([1, 2, 300]);
    // at lap 300, Team Beta IS the leader (trackPosition 1, per the fixture)
    const lap300 = summary.gapTrend.find((p) => p.lapNumber === 300);
    expect(lap300?.trackPosition).toBe(1);
    expect(lap300?.gapToLeaderMs).toBe(0);
  });

  it("reports Team Alpha's gap trend as 0 the whole way (they're the leader throughout in this fixture)", () => {
    const allLaps = parseIracingJson(fixture);
    const summary = buildRaceSummary(fixture, allLaps, 9001);
    expect(summary.gapTrend.every((p) => p.gapToLeaderMs === 0)).toBe(true);
  });

  it("computes raceLengthLaps as the highest lap number seen across the field", () => {
    const allLaps = parseIracingJson(fixture);
    const summary = buildRaceSummary(fixture, allLaps, 9001);
    expect(summary.raceLengthLaps).toBe(300);
  });

  it("returns an empty weatherTimeline when no laps carry Garage61 weather data", () => {
    const allLaps = parseIracingJson(fixture);
    const summary = buildRaceSummary(fixture, allLaps, 9001);
    expect(summary.weatherTimeline).toEqual([]);
  });
});
