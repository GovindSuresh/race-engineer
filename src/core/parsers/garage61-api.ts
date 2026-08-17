import type {
  RawGarage61ApiSector,
  RawGarage61Lap,
  RawGarage61Row,
} from "../types/race-data";

/** Every top-level field the published `/api/v1/laps` schema documents. Used
 *  only by `describeGarage61LapShape` to spot schema drift — the parser itself
 *  ignores anything it doesn't recognise rather than failing on it. */
const KNOWN_LAP_FIELDS: ReadonlySet<string> = new Set([
  "id", "lapTime", "lapNumber", "startTime", "run",
  "event", "session", "eventType", "sessionType",
  "clean", "incomplete", "missing", "discontinuity", "offtrack",
  "pitIn", "pitOut", "pitlane", "joker",
  "canViewSetup", "canViewTelemetry", "ghostAvailable",
  "driverRating", "tireCompound", "powerAdjust", "weightPenalty",
  "fuelAdded", "fuelUsed", "fuelLevel", "sectors",
  "precipitation", "fogLevel", "relativeHumidity", "windDir", "windVel",
  "airPressure", "airDensity", "airTemp", "clouds",
  "trackWetness", "trackUsage", "trackTemp",
  "driver", "car", "track", "season",
]);

/** The fields the Stint Analysis genuinely cannot work without. `fuelLevel`
 *  and `fuelUsed` are here because `deriveStints` throws outright when they're
 *  undefined (see transforms/stints.ts) — everything else degrades quietly. */
const LOAD_BEARING_FIELDS = [
  "lapTime", "lapNumber", "startTime", "fuelLevel", "fuelUsed", "driver",
] as const;

function num(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function nonNegativeOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function bool(value: unknown): boolean {
  return value === true;
}

/** Garage61's `driver` is `{id, slug, firstName, lastName}`, but the CSV
 *  export's `Driver` column — and therefore `LapRecord.driverName`, which the
 *  whole planner groups and keys on — is a single display name.
 *
 *  KNOWN DIVERGENCE, verified against the live API. A driver can rename
 *  themselves on Garage61, and the CSV exports that **display name**, which no
 *  API endpoint returns: `/laps` gives first/last name only, `/me` has a
 *  `nickName` that is a third distinct value, and `/teams/{id}` repeats
 *  first/last. The slug is derived from the display name ("G man" -> `g-man`),
 *  so it is the only shared identity, but the original casing is gone.
 *
 *  iRacing is the authoritative name; the Garage61 display name is the one
 *  that drifts. Real example: iRacing "James Paisley-Knight" vs Garage61
 *  "James Knight". That drift is why `mergeGarage61IntoIracing` matches only
 *  some drivers — it keys on (driverName, lapNumber).
 *
 *  Composing first+last is therefore not just prettier than the slug, it is
 *  the value most likely to equal iRacing's `display_name`. For an exact join
 *  there is a better option this doesn't use: `/teams/{id}` exposes each
 *  member's linked `accounts[].id`, which is the iRacing `cust_id`.
 *
 *  Fall back through the identifiers that are always present so a lap can
 *  never end up under an empty driver name. */
export function garage61ApiDriverName(driver: RawGarage61Lap["driver"]): string {
  if (!driver) return "Unknown driver";
  const full = [driver.firstName, driver.lastName]
    .filter((part) => typeof part === "string" && part.trim().length > 0)
    .join(" ")
    .trim();
  return full || driver.nickName?.trim() || driver.slug?.trim() || "Unknown driver";
}

/** Normalises the `sectors` array into the CSV's fixed four slots.
 *
 *  Shape verified against the live API: `[{ sectorTime, incomplete }, …]` with
 *  no index field, so **position is the sector number**. The array is 3 or 4
 *  long depending on the lap; anything past the fourth is dropped to match the
 *  CSV's four columns, and missing trailing sectors stay null.
 *
 *  An `incomplete` sector reports `sectorTime: 0`, which is not a 0.0s
 *  sector — it means the sector was never timed (an out-lap that joined
 *  part-way round, say). It maps to `null`, which is exactly what the CSV
 *  export writes for the same lap: an empty cell. That correspondence is what
 *  lets the two paths produce identical `LapRecord`s. */
export function garage61ApiSectorsToColumns(
  sectors: RawGarage61ApiSector[] | undefined,
): [number | null, number | null, number | null, number | null] {
  const columns: (number | null)[] = [null, null, null, null];
  if (!Array.isArray(sectors)) {
    return columns as [number | null, number | null, number | null, number | null];
  }

  sectors.slice(0, 4).forEach((sector, i) => {
    if (!sector || sector.incomplete === true) return;
    const time = sector.sectorTime;
    if (typeof time === "number" && Number.isFinite(time)) columns[i] = time;
  });

  return columns as [number | null, number | null, number | null, number | null];
}

/** Narrows one API lap to the CSV export's row shape.
 *
 *  This is the whole integration: from here on the API path and the upload
 *  path are the same code — `garage61OnlyToLapRecords` turns either into
 *  `LapRecord[]`, and every transform, chart and table downstream is shared.
 *
 *  Absent fields become 0/false rather than errors. In practice the live API
 *  omits none of them (measured over 1000 laps), but defaulting costs nothing
 *  and `deriveStints` throws outright on an undefined `fuelLevel`/`fuelUsed`,
 *  so this is the difference between a missing field and a crash. See the note
 *  on `RawGarage61Lap`. */
export function garage61ApiLapToRow(lap: RawGarage61Lap): RawGarage61Row {
  const [sector1, sector2, sector3, sector4] = garage61ApiSectorsToColumns(lap.sectors);

  return {
    run: num(lap.run),
    lap: num(lap.lapNumber),
    lapTimeSeconds: num(lap.lapTime),
    startedAt: typeof lap.startTime === "string" ? lap.startTime : "",
    driver: garage61ApiDriverName(lap.driver),
    clean: bool(lap.clean),
    pitIn: bool(lap.pitIn),
    pitOut: bool(lap.pitOut),
    trackTempC: num(lap.trackTemp),
    // Not `num()`: its 0 fallback would read as a green track. Garage61 marks
    // an unrecorded reading with a negative, the same way it does for
    // `trackWetness`, so both absence and -1 become null.
    trackUsagePct: nonNegativeOrNull(lap.trackUsage),
    airTempC: num(lap.airTemp),
    cloudCover: num(lap.clouds),
    airDensity: num(lap.airDensity),
    airPressure: num(lap.airPressure),
    windVelocity: num(lap.windVel),
    windDirection: num(lap.windDir),
    relativeHumidity: num(lap.relativeHumidity),
    fogLevel: num(lap.fogLevel),
    precipitation: num(lap.precipitation),
    trackWetness: num(lap.trackWetness),
    fuelLevel: num(lap.fuelLevel),
    fuelUsed: num(lap.fuelUsed),
    fuelAdded: num(lap.fuelAdded),
    sector1,
    sector2,
    sector3,
    sector4,
  };
}

/** Orders laps the way `deriveStints` requires: ascending in time.
 *
 *  The API documents no ordering for `items`, and lap NUMBER alone is not a
 *  safe sort key — Garage61's own numbering restarts across runs, which is why
 *  the Stint Analysis already refuses to key anything on it (see the note on
 *  `ProcessedDriver.rawTimeByLap`). `startTime` is the real ordering; lap
 *  number only breaks ties within the same timestamp. */
export function sortGarage61ApiLaps(laps: RawGarage61Lap[]): RawGarage61Lap[] {
  return [...laps].sort((a, b) => {
    const timeA = Date.parse(a.startTime ?? "");
    const timeB = Date.parse(b.startTime ?? "");
    const validA = Number.isFinite(timeA);
    const validB = Number.isFinite(timeB);
    if (validA && validB && timeA !== timeB) return timeA - timeB;
    // Laps with no parseable timestamp sort last rather than to the epoch,
    // where they'd silently become the start of the session.
    if (validA !== validB) return validA ? -1 : 1;
    return num(a.lapNumber) - num(b.lapNumber);
  });
}

/** Reads the `{ items: [...] }` envelope `/laps` returns, or a bare array.
 *  Both are needed: Garage61's list endpoints disagree with each other —
 *  `/laps` wraps, while `/tracks`, `/cars` and `/teams` return bare arrays
 *  (verified against the live API) — and a hand-captured fixture of just the
 *  laps works without being re-wrapped. Non-object entries are dropped. */
export function parseGarage61ApiLaps(payload: unknown): RawGarage61Lap[] {
  const items = Array.isArray(payload)
    ? payload
    : (payload as { items?: unknown })?.items;
  if (!Array.isArray(items)) return [];
  return items.filter(
    (item): item is RawGarage61Lap => typeof item === "object" && item !== null,
  );
}

/** Parse → sort → narrow, in one call. What the Stint Analysis actually uses. */
export function garage61ApiLapsToRows(laps: RawGarage61Lap[]): RawGarage61Row[] {
  return sortGarage61ApiLaps(laps).map(garage61ApiLapToRow);
}

export interface Garage61LapShapeReport {
  /** Fields present in the response that the documented schema doesn't list —
   *  Garage61 has added something, and it may be worth mapping. */
  unknownFields: string[];
  /** Load-bearing fields absent from EVERY lap. Not proof of a problem (Go's
   *  `omitempty` hides zeroes), but `fuelLevel` missing across the board means
   *  `deriveStints` is about to produce nonsense fuel figures. */
  absentLoadBearingFields: string[];
  lapCount: number;
  /** The distinct key sets seen across `sectors` entries, e.g. `["number,time"]`
   *  — the fastest way to settle the one part of the schema the docs don't
   *  specify. */
  sectorKeyShapes: string[];
}

/** Diagnostic for the first run against the live API, where the shape can
 *  finally be checked. Deliberately reports rather than throws: absence is
 *  normal under `omitempty`, so failing on it would block a working response.
 *  Call it from the throwaway `npx tsx` probe and from the proxy in dev. */
export function describeGarage61LapShape(laps: RawGarage61Lap[]): Garage61LapShapeReport {
  const unknown = new Set<string>();
  const seen = new Set<string>();
  const sectorKeyShapes = new Set<string>();

  for (const lap of laps) {
    for (const key of Object.keys(lap)) {
      seen.add(key);
      if (!KNOWN_LAP_FIELDS.has(key)) unknown.add(key);
    }
    for (const sector of lap.sectors ?? []) {
      if (sector && typeof sector === "object") {
        sectorKeyShapes.add(Object.keys(sector).sort().join(","));
      }
    }
  }

  return {
    unknownFields: [...unknown].sort(),
    absentLoadBearingFields: LOAD_BEARING_FIELDS.filter((field) => !seen.has(field)),
    lapCount: laps.length,
    sectorKeyShapes: [...sectorKeyShapes].sort(),
  };
}
