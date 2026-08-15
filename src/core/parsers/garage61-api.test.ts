import { describe, expect, it } from "vitest";
import type { RawGarage61Lap } from "../types/race-data";
import { garage61OnlyToLapRecords } from "../transforms/garage61-only";
import {
  describeGarage61LapShape,
  garage61ApiDriverName,
  garage61ApiLapToRow,
  garage61ApiLapsToRows,
  garage61ApiSectorsToColumns,
  parseGarage61ApiLaps,
  sortGarage61ApiLaps,
} from "./garage61-api";

/** A lap as the API documents it. Invented names and ids throughout — never
 *  real Garage61 data. */
function makeLap(overrides: Partial<RawGarage61Lap> = {}): RawGarage61Lap {
  return {
    id: "lap-aaa",
    lapTime: 138.453,
    lapNumber: 12,
    startTime: "2026-03-04T18:00:00Z",
    run: 2,
    event: "evt-alpha",
    session: 3,
    sessionType: 1,
    clean: true,
    pitIn: false,
    pitOut: false,
    fuelLevel: 90,
    fuelUsed: 3.5,
    fuelAdded: 0,
    sectors: [{ sectorTime: 40, incomplete: false }],
    trackTemp: 30,
    trackUsage: 55,
    airTemp: 22,
    clouds: 2,
    airDensity: 1.1,
    airPressure: 96500,
    windVel: 5,
    windDir: 3,
    relativeHumidity: 0.55,
    fogLevel: 0,
    precipitation: 0,
    trackWetness: 0,
    driver: { slug: "sam-vance", firstName: "Sam", lastName: "Vance" },
    car: { id: 77, name: "Invented GT3" },
    track: { id: 401, name: "Testburg", variant: "Grand Prix" },
    ...overrides,
  };
}

describe("garage61ApiDriverName", () => {
  it("composes the CSV's single display name from firstName + lastName", () => {
    expect(garage61ApiDriverName({ firstName: "Sam", lastName: "Vance" })).toBe("Sam Vance");
  });

  it("falls back through nickName then slug so a lap is never filed under an empty name", () => {
    expect(garage61ApiDriverName({ nickName: "Vance", slug: "sam-vance" })).toBe("Vance");
    expect(garage61ApiDriverName({ slug: "sam-vance" })).toBe("sam-vance");
    expect(garage61ApiDriverName(null)).toBe("Unknown driver");
    expect(garage61ApiDriverName(undefined)).toBe("Unknown driver");
  });

  it("does not produce a stray space when only one name part is present", () => {
    expect(garage61ApiDriverName({ firstName: "Sam" })).toBe("Sam");
    expect(garage61ApiDriverName({ lastName: "Vance" })).toBe("Vance");
  });
});

describe("garage61ApiSectorsToColumns", () => {
  it("maps sectors positionally, since entries carry no index", () => {
    expect(
      garage61ApiSectorsToColumns([
        { sectorTime: 40, incomplete: false },
        { sectorTime: 45, incomplete: false },
        { sectorTime: 30, incomplete: false },
        { sectorTime: 23.5, incomplete: false },
      ]),
    ).toEqual([40, 45, 30, 23.5]);
  });

  it("leaves trailing columns null on a three-sector lap", () => {
    expect(
      garage61ApiSectorsToColumns([
        { sectorTime: 40, incomplete: false },
        { sectorTime: 45, incomplete: false },
        { sectorTime: 30, incomplete: false },
      ]),
    ).toEqual([40, 45, 30, null]);
  });

  // The important one. An untimed sector reports `sectorTime: 0`, and reading
  // that as a 0.0s sector would invent a lap segment that never happened — and
  // disagree with the CSV path, which leaves the cell empty for the same lap.
  it("reads an incomplete sector as null, not as a zero-second sector", () => {
    expect(
      garage61ApiSectorsToColumns([
        { sectorTime: 0, incomplete: true },
        { sectorTime: 0, incomplete: true },
        { sectorTime: 0, incomplete: true },
        { sectorTime: 1.5, incomplete: false },
      ]),
    ).toEqual([null, null, null, 1.5]);
  });

  it("returns four nulls for a missing or empty sectors array", () => {
    expect(garage61ApiSectorsToColumns(undefined)).toEqual([null, null, null, null]);
    expect(garage61ApiSectorsToColumns([])).toEqual([null, null, null, null]);
  });

  it("drops sectors beyond the fourth rather than overflowing the tuple", () => {
    const columns = garage61ApiSectorsToColumns([
      { sectorTime: 10 },
      { sectorTime: 11 },
      { sectorTime: 12 },
      { sectorTime: 13 },
      { sectorTime: 14 },
    ]);
    expect(columns).toHaveLength(4);
    expect(columns).toEqual([10, 11, 12, 13]);
  });
});

describe("garage61ApiLapToRow", () => {
  it("maps the API's field names onto the CSV export's row shape", () => {
    const row = garage61ApiLapToRow(makeLap());
    expect(row.lap).toBe(12);
    expect(row.lapTimeSeconds).toBeCloseTo(138.453);
    expect(row.driver).toBe("Sam Vance");
    expect(row.trackTempC).toBe(30);
    expect(row.cloudCover).toBe(2);
    expect(row.windVelocity).toBe(5);
    expect(row.trackUsagePct).toBe(55);
  });

  // The exception to the "absent means 0" rule below: 0 is a REAL track-usage
  // reading (a green, unrubbered track), so falling back to it would state a
  // consequential track state that was never measured. Garage61 marks an
  // unrecorded reading with a negative, exactly as it does for trackWetness.
  it("maps an absent or negative track usage to null, not 0", () => {
    expect(garage61ApiLapToRow({ lapNumber: 4 }).trackUsagePct).toBeNull();
    expect(garage61ApiLapToRow({ lapNumber: 4, trackUsage: -1 }).trackUsagePct).toBeNull();
    expect(garage61ApiLapToRow({ lapNumber: 4, trackUsage: 0 }).trackUsagePct).toBe(0);
  });

  // Garage61's API is a Go service, and Go's `omitempty` drops zero numbers
  // and `false` booleans from the JSON entirely — so absence is the normal
  // encoding of "0 litres" / "not a pit lap", not an error to reject.
  it("treats absent numbers as 0 and absent booleans as false", () => {
    const row = garage61ApiLapToRow({ lapNumber: 4, startTime: "2026-03-04T18:00:00Z" });
    expect(row.fuelAdded).toBe(0);
    expect(row.fuelUsed).toBe(0);
    expect(row.fuelLevel).toBe(0);
    expect(row.pitIn).toBe(false);
    expect(row.pitOut).toBe(false);
    expect(row.clean).toBe(false);
  });

  it("ignores non-finite numbers rather than letting NaN reach the transforms", () => {
    const row = garage61ApiLapToRow(makeLap({ lapTime: Number.NaN, trackTemp: Number.NaN }));
    expect(row.lapTimeSeconds).toBe(0);
    expect(row.trackTempC).toBe(0);
  });

  it("feeds garage61OnlyToLapRecords unchanged — the CSV path and the API path converge here", () => {
    const [record] = garage61OnlyToLapRecords([garage61ApiLapToRow(makeLap())], "Session A");
    expect(record.lapTimeMs).toBe(138453);
    expect(record.teamName).toBe("Session A");
    expect(record.driverName).toBe("Sam Vance");
    expect(record.fuelLevel).toBe(90);
    expect(record.weather?.trackTempC).toBe(30);
  });
});

describe("sortGarage61ApiLaps", () => {
  it("orders by startTime, which deriveStints requires and the API does not promise", () => {
    const sorted = sortGarage61ApiLaps([
      makeLap({ lapNumber: 3, startTime: "2026-03-04T18:04:00Z" }),
      makeLap({ lapNumber: 1, startTime: "2026-03-04T18:00:00Z" }),
      makeLap({ lapNumber: 2, startTime: "2026-03-04T18:02:00Z" }),
    ]);
    expect(sorted.map((lap) => lap.lapNumber)).toEqual([1, 2, 3]);
  });

  it("breaks ties on lap number", () => {
    const sorted = sortGarage61ApiLaps([
      makeLap({ lapNumber: 9, startTime: "2026-03-04T18:00:00Z" }),
      makeLap({ lapNumber: 8, startTime: "2026-03-04T18:00:00Z" }),
    ]);
    expect(sorted.map((lap) => lap.lapNumber)).toEqual([8, 9]);
  });

  it("sorts unparseable timestamps last, not to the epoch", () => {
    const sorted = sortGarage61ApiLaps([
      makeLap({ lapNumber: 5, startTime: undefined }),
      makeLap({ lapNumber: 1, startTime: "2026-03-04T18:00:00Z" }),
    ]);
    expect(sorted.map((lap) => lap.lapNumber)).toEqual([1, 5]);
  });

  it("does not mutate its input", () => {
    const laps = [
      makeLap({ lapNumber: 2, startTime: "2026-03-04T18:02:00Z" }),
      makeLap({ lapNumber: 1, startTime: "2026-03-04T18:00:00Z" }),
    ];
    sortGarage61ApiLaps(laps);
    expect(laps.map((lap) => lap.lapNumber)).toEqual([2, 1]);
  });
});

describe("parseGarage61ApiLaps", () => {
  it("reads the { items } envelope every Garage61 list endpoint returns", () => {
    expect(parseGarage61ApiLaps({ items: [makeLap()], total: 1 })).toHaveLength(1);
  });

  it("accepts a bare array, so a captured fixture needs no re-wrapping", () => {
    expect(parseGarage61ApiLaps([makeLap(), makeLap()])).toHaveLength(2);
  });

  it("returns [] for anything else instead of throwing", () => {
    expect(parseGarage61ApiLaps(null)).toEqual([]);
    expect(parseGarage61ApiLaps({})).toEqual([]);
    expect(parseGarage61ApiLaps({ items: "nope" })).toEqual([]);
  });

  it("drops non-object entries", () => {
    expect(parseGarage61ApiLaps({ items: [makeLap(), null, 7] })).toHaveLength(1);
  });
});

describe("garage61ApiLapsToRows", () => {
  it("sorts and narrows in one pass", () => {
    const rows = garage61ApiLapsToRows([
      makeLap({ lapNumber: 2, startTime: "2026-03-04T18:02:00Z" }),
      makeLap({ lapNumber: 1, startTime: "2026-03-04T18:00:00Z" }),
    ]);
    expect(rows.map((row) => row.lap)).toEqual([1, 2]);
  });
});

describe("describeGarage61LapShape", () => {
  it("names fields the documented schema doesn't list, so drift is visible", () => {
    const report = describeGarage61LapShape([
      { ...makeLap(), somethingNew: 1 } as RawGarage61Lap,
    ]);
    expect(report.unknownFields).toEqual(["somethingNew"]);
  });

  it("reports the sectors key shape — the one part of the schema the docs omit", () => {
    const report = describeGarage61LapShape([
      makeLap({ sectors: [{ sectorTime: 40, incomplete: false }] }),
    ]);
    expect(report.sectorKeyShapes).toEqual(["incomplete,sectorTime"]);
  });

  it("flags load-bearing fields absent from every lap, e.g. the fuel deriveStints needs", () => {
    const report = describeGarage61LapShape([{ lapNumber: 1 }]);
    expect(report.absentLoadBearingFields).toContain("fuelLevel");
    expect(report.absentLoadBearingFields).toContain("fuelUsed");
  });

  it("stays quiet on a fully documented lap", () => {
    const report = describeGarage61LapShape([makeLap()]);
    expect(report.unknownFields).toEqual([]);
    expect(report.absentLoadBearingFields).toEqual([]);
    expect(report.lapCount).toBe(1);
  });
});
