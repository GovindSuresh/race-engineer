import type { LapRecord, RawGarage61Row } from "../types/race-data";

/** Promotes a standalone Garage61 upload (the Stint Planner path — no
 *  iRacing merge, no full-field data) directly into LapRecords.
 *
 *  `label` fills `LapRecord.teamName`. Garage61 alone has no team name (or
 *  numeric driver id) at all, so the caller supplies something to identify
 *  this upload by — e.g. the uploaded filename — since Stint Planner
 *  compares up to 4 independent uploads side by side and needs some way to
 *  tell them apart. Fields iRacing would normally supply (custId,
 *  trackPositionAtLap, incident) are simply absent. */
export function garage61OnlyToLapRecords(
  rows: RawGarage61Row[],
  label: string,
): LapRecord[] {
  return rows.map((row) => ({
    lapNumber: row.lap,
    driverName: row.driver,
    teamName: label,
    lapTimeMs: Math.round(row.lapTimeSeconds * 1000),
    isClean: row.clean,
    pitIn: row.pitIn,
    pitOut: row.pitOut,
    fuelUsed: row.fuelUsed,
    fuelLevel: row.fuelLevel,
    fuelAdded: row.fuelAdded,
    sectorTimes: [row.sector1, row.sector2, row.sector3, row.sector4],
    weather: {
      trackTempC: row.trackTempC,
      airTempC: row.airTempC,
      trackWetness: row.trackWetness,
      precipitation: row.precipitation,
      windVelocity: row.windVelocity,
    },
  }));
}
