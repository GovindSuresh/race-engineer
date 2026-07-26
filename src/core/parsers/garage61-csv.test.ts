import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseGarage61Csv } from "./garage61-csv";

const fixtureCsv = readFileSync(
  join(__dirname, "__fixtures__/garage61-sample.csv"),
  "utf-8",
);

describe("parseGarage61Csv", () => {
  it("parses one row per data line (excluding the header)", () => {
    const rows = parseGarage61Csv(fixtureCsv);
    expect(rows).toHaveLength(8);
  });

  it("parses numeric, string, and boolean fields correctly", () => {
    const [firstRow] = parseGarage61Csv(fixtureCsv);
    expect(firstRow.run).toBe(1);
    expect(firstRow.lap).toBe(0);
    expect(firstRow.lapTimeSeconds).toBeCloseTo(160.5);
    expect(firstRow.startedAt).toBe("2026-01-01T10:00:00Z");
    expect(firstRow.driver).toBe("Test Driver");
    expect(firstRow.clean).toBe(false);
    expect(firstRow.pitIn).toBe(false);
    expect(firstRow.pitOut).toBe(false);
  });

  it("parses blank sector times as null rather than NaN (e.g. lap 0 out-lap)", () => {
    const [firstRow] = parseGarage61Csv(fixtureCsv);
    expect(firstRow.sector1).toBeNull();
    expect(firstRow.sector2).toBeNull();
    expect(firstRow.sector3).toBeCloseTo(88.0);
    expect(firstRow.sector4).toBeCloseTo(72.5);
  });

  it("flags a pit-in lap", () => {
    const rows = parseGarage61Csv(fixtureCsv);
    const pitInLap = rows.find((r) => r.lap === 6);
    expect(pitInLap?.pitIn).toBe(true);
    expect(pitInLap?.pitOut).toBe(false);
  });

  it("flags a pit-out lap and captures fuel added", () => {
    const rows = parseGarage61Csv(fixtureCsv);
    const pitOutLap = rows.find((r) => r.lap === 7);
    expect(pitOutLap?.pitOut).toBe(true);
    expect(pitOutLap?.run).toBe(2);
    expect(pitOutLap?.fuelAdded).toBeCloseTo(26.5);
  });

  it("throws if the CSV is missing an expected column", () => {
    const badCsv = "Run,Lap,Driver\n1,0,Test Driver";
    expect(() => parseGarage61Csv(badCsv)).toThrow(/missing expected column/);
  });
});
