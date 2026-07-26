import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { RawIracingExport } from "../types/race-data";
import { parseIracingJson } from "./iracing-json";

const fixture = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__/iracing-sample.json"), "utf-8"),
) as RawIracingExport;

describe("parseIracingJson", () => {
  it("flattens every lap_N key across every entry into one record per lap", () => {
    const records = parseIracingJson(fixture);
    // entry 0: lap_1, lap_2, lap_300 (3) + entry 1: lap_1, lap_2 (2) + entry 2: lap_1, lap_2 (2)
    expect(records).toHaveLength(7);
  });

  it("attributes lap_300 (nested under entry 0) to the driver who actually held that position, not entry 0's own team", () => {
    // This is the core quirk: entry 0's finishing_position is Team Alpha
    // (cust_id 5001), but lap_300 under entry 0 is a snapshot of Team Beta
    // (cust_id 5003), who held track position 1 at that point in the race.
    const records = parseIracingJson(fixture);
    const lap300 = records.find((r) => r.lapNumber === 300);
    expect(lap300?.custId).toBe(5003);
    expect(lap300?.driverName).toBe("Driver B1");
    expect(lap300?.teamName).toBe("Team Beta");
  });

  it("does not misattribute entry 0's own driver (cust_id 5001) to lap 300", () => {
    const records = parseIracingJson(fixture);
    const driverA1Laps = records
      .filter((r) => r.custId === 5001)
      .map((r) => r.lapNumber);
    expect(driverA1Laps).toEqual([1, 2]);
  });

  it("converts lap_time from 1/10000-second ticks to true milliseconds", () => {
    const records = parseIracingJson(fixture);
    const lap1 = records.find((r) => r.custId === 5001 && r.lapNumber === 1);
    // raw lap_time 1384533 ticks -> 138453 ms (138.453s), not 1384533 ms
    expect(lap1?.lapTimeMs).toBe(138453);
  });

  it("preserves -1 as the invalid-lap sentinel rather than converting it to 0", () => {
    const records = parseIracingJson(fixture);
    const invalidLap = records.find((r) => r.custId === 5005 && r.lapNumber === 2);
    expect(invalidLap?.lapTimeMs).toBe(-1);
    expect(invalidLap?.incident).toBe(true);
  });

  it("produces no duplicate (custId, lapNumber) pairs", () => {
    const records = parseIracingJson(fixture);
    const keys = records.map((r) => `${r.custId}:${r.lapNumber}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("sets teamId from group_id, stable across the position-swap laps", () => {
    const records = parseIracingJson(fixture);
    expect(records.find((r) => r.custId === 5001)?.teamId).toBe(9001);
    expect(records.find((r) => r.custId === 5003 && r.lapNumber === 1)?.teamId).toBe(9002);
    // lap 300 belongs to Team Beta (cust 5003) even though nested under
    // entry 0 (Team Alpha) — teamId must follow the actual car, not entry i.
    expect(records.find((r) => r.lapNumber === 300)?.teamId).toBe(9002);
  });

  it("gives the leader a 0ms gap rather than leaving it undefined (iRacing reports null for the leader)", () => {
    const records = parseIracingJson(fixture);
    const leaderLap = records.find((r) => r.custId === 5001 && r.lapNumber === 1);
    expect(leaderLap?.gapToLeaderMs).toBe(0);
    expect(leaderLap?.lapsDownFromLeader).toBeUndefined();
  });

  it("reads a real time gap from interval when interval_units is ms", () => {
    const records = parseIracingJson(fixture);
    const p2Lap = records.find((r) => r.custId === 5003 && r.lapNumber === 1);
    expect(p2Lap?.gapToLeaderMs).toBe(-3200);
    expect(p2Lap?.lapsDownFromLeader).toBeUndefined();
  });

  it("reads a laps-down count instead of a time gap when interval_units is lap", () => {
    const records = parseIracingJson(fixture);
    const lappedCar = records.find((r) => r.custId === 5005 && r.lapNumber === 2);
    expect(lappedCar?.lapsDownFromLeader).toBe(-1);
    expect(lappedCar?.gapToLeaderMs).toBeUndefined();
  });

  it("sets pitAffected from lap_events containing 'pitted', independent of Garage61", () => {
    const raw: RawIracingExport = {
      subsession_id: 1,
      lapData: [
        {
          finishing_position: fixture.lapData[0].finishing_position,
          lap_1: { ...fixture.lapData[0].lap_1, lap_events: ["pitted"] },
        },
      ],
    };
    const records = parseIracingJson(raw);
    expect(records[0].pitAffected).toBe(true);
  });

  it("sets pitAffected false for a lap with no pit-related lap_events", () => {
    const records = parseIracingJson(fixture);
    expect(records.find((r) => r.custId === 5001 && r.lapNumber === 1)?.pitAffected).toBe(false);
  });
});
