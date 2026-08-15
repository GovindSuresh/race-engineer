import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { deriveStints } from "../transforms/stints";
import { garage61OnlyToLapRecords } from "../transforms/garage61-only";
import { groupG61ApiLapsIntoSessions } from "../transforms/g61-sessions";
import {
  describeGarage61LapShape,
  garage61ApiLapsToRows,
  parseGarage61ApiLaps,
} from "./garage61-api";

/** A real `/laps` response, captured from the live API and then anonymised —
 *  driver names, slugs, and every ULID were substituted, the numbers and the
 *  structure were not.
 *
 *  These tests exist because the parser was originally written against the
 *  published docs alone, and the docs are incomplete in ways that mattered:
 *  `sectors` is documented only as `array<object>`, and the first
 *  implementation guessed its element shape wrong, which silently nulled every
 *  sector time. The point of a captured fixture is that a guess can't survive
 *  it. Regenerate with scripts kept outside the repo if the API changes. */
const fixture: unknown = JSON.parse(
  readFileSync(join(__dirname, "__fixtures__/garage61-api-laps.json"), "utf-8"),
);

describe("garage61 API parser, against a captured live response", () => {
  const laps = parseGarage61ApiLaps(fixture);

  it("reads the { items: [...] } envelope /laps actually returns", () => {
    expect(laps).toHaveLength(7);
  });

  it("finds no field the RawGarage61Lap type doesn't cover", () => {
    expect(describeGarage61LapShape(laps).unknownFields).toEqual([]);
  });

  it("finds every load-bearing field present — the API omits none of them", () => {
    expect(describeGarage61LapShape(laps).absentLoadBearingFields).toEqual([]);
  });

  it("sees exactly one sectors element shape: { incomplete, sectorTime }", () => {
    expect(describeGarage61LapShape(laps).sectorKeyShapes).toEqual(["incomplete,sectorTime"]);
  });

  it("keeps the pit in/out laps that deriveStints splits on", () => {
    const rows = garage61ApiLapsToRows(laps);
    expect(rows.some((row) => row.pitIn)).toBe(true);
    expect(rows.some((row) => row.pitOut)).toBe(true);
  });

  it("keeps unclean laps, which the 'Clean laps only' toggle needs to filter", () => {
    const rows = garage61ApiLapsToRows(laps);
    expect(rows.some((row) => !row.clean)).toBe(true);
  });

  it("maps an incomplete sector to null rather than a zero-second sector", () => {
    const rows = garage61ApiLapsToRows(laps);
    const withNullSector = rows.filter(
      (row) => row.sector1 === null || row.sector2 === null || row.sector3 === null,
    );
    expect(withNullSector.length).toBeGreaterThan(0);
    // Whatever else is true, no sector may come through as a literal 0 — that
    // is what an untimed sector reports, and it is not a 0.0s sector.
    for (const row of rows) {
      for (const sector of [row.sector1, row.sector2, row.sector3, row.sector4]) {
        expect(sector).not.toBe(0);
      }
    }
  });

  it("produces timed laps with the fuel figures deriveStints requires", () => {
    const rows = garage61ApiLapsToRows(laps);
    for (const row of rows) {
      expect(typeof row.fuelLevel).toBe("number");
      expect(typeof row.fuelUsed).toBe("number");
      expect(typeof row.lapTimeSeconds).toBe("number");
    }
  });

  it("carries all the way to stints without throwing", () => {
    const rows = garage61ApiLapsToRows(laps);
    const records = garage61OnlyToLapRecords(rows, "fixture");
    expect(() => deriveStints(records)).not.toThrow();
  });

  it("groups into sessions on the API's own event + session identity", () => {
    const sessions = groupG61ApiLapsIntoSessions(laps);
    // Every lap in the capture carries both fields, so no session key should
    // have fallen back to the one-hour time-gap split.
    expect(sessions.every((session) => session.key.startsWith("id:"))).toBe(true);
    expect(sessions.reduce((total, s) => total + s.lapCount, 0)).toBe(laps.length);
  });
});
