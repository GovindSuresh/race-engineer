import type { LapRecord, RawGarage61Row } from "../types/race-data";

export interface MergeResult {
  merged: LapRecord[];
  /** Garage61 rows whose (driver, lap) had no matching iRacing LapRecord —
   *  most likely a Garage61 profile nickname that doesn't match the
   *  driver's iRacing display_name (confirmed against real data: 2 of 6
   *  drivers in a sample race didn't match exactly). Surfaced here rather
   *  than silently dropped so the UI can flag "N laps couldn't be matched". */
  unmatchedGarage61Rows: RawGarage61Row[];
}

/** Enriches iRacing-derived LapRecords with fuel/weather/sector data from
 *  an optional Garage61 CSV export. Keyed on (driverName, lapNumber) per
 *  the spec — exact string match only, since Garage61 has no numeric
 *  driver id to fall back on. Does not touch `lapTimeMs`: that's iRacing's
 *  reconstructed value (including its -1-for-invalid-lap semantics) and
 *  stays authoritative even when a lap is enriched with Garage61 fields. */
export function mergeGarage61IntoIracing(
  iracingLaps: LapRecord[],
  garage61Rows: RawGarage61Row[],
): MergeResult {
  const garage61ByDriverAndLap = new Map<string, RawGarage61Row>();
  for (const row of garage61Rows) {
    garage61ByDriverAndLap.set(`${row.driver}:${row.lap}`, row);
  }

  const matchedKeys = new Set<string>();

  const merged = iracingLaps.map((lap) => {
    const key = `${lap.driverName}:${lap.lapNumber}`;
    const row = garage61ByDriverAndLap.get(key);
    if (!row) return lap;

    matchedKeys.add(key);
    return {
      ...lap,
      isClean: row.clean,
      pitIn: row.pitIn,
      pitOut: row.pitOut,
      fuelUsed: row.fuelUsed,
      fuelLevel: row.fuelLevel,
      fuelAdded: row.fuelAdded,
      sectorTimes: [row.sector1, row.sector2, row.sector3, row.sector4] as LapRecord["sectorTimes"],
      weather: {
        trackTempC: row.trackTempC,
        airTempC: row.airTempC,
        trackWetness: row.trackWetness,
        trackUsagePct: row.trackUsagePct,
        precipitation: row.precipitation,
        windVelocity: row.windVelocity,
      },
    };
  });

  const unmatchedGarage61Rows = garage61Rows.filter(
    (row) => !matchedKeys.has(`${row.driver}:${row.lap}`),
  );

  return { merged, unmatchedGarage61Rows };
}
