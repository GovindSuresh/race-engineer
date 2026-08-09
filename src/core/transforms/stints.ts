import type { LapRecord, Stint } from "../types/race-data";

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function buildStint(stintNumber: number, laps: LapRecord[]): Stint {
  const firstLap = laps[0];
  const lastLap = laps[laps.length - 1];

  if (
    firstLap.fuelLevel === undefined ||
    firstLap.fuelUsed === undefined ||
    lastLap.fuelLevel === undefined
  ) {
    throw new Error(
      `Cannot derive stint fuel data: lap ${firstLap.lapNumber} has no Garage61 fuel data. ` +
        `deriveStints() requires laps enriched with Garage61 data (pitIn/pitOut/fuel) — ` +
        `it cannot be used on iRacing-only records for cars without a Garage61 upload.`,
    );
  }

  const validLapTimes = laps.map((l) => l.lapTimeMs).filter((t) => t > 0);

  // fuelLevel is a START-of-lap reading, and on a pit-out lap it predates
  // that stop's refuel — so the fuel on board leaving the box is the first
  // lap's reading PLUS whatever went in on that lap. (Verified against every
  // consecutive lap pair in /ref_data; see the note on LapRecord.fuelLevel.)
  const fuelAtStart = firstLap.fuelLevel + (firstLap.fuelAdded ?? 0);
  // Likewise the last lap's reading is its START, so the stint's end-of-run
  // fuel needs that final lap's burn taken off.
  const fuelAtEnd = lastLap.fuelLevel - (lastLap.fuelUsed ?? 0);

  return {
    stintNumber,
    driverName: firstLap.driverName,
    startLap: firstLap.lapNumber,
    endLap: lastLap.lapNumber,
    laps,
    fuelAtStart,
    fuelAtEnd,
    // Read straight off Garage61's exact "Fuel added" column rather than
    // inferred from the gap between two fuelLevel readings. The old delta
    // approach was silently wrong — because the pit-out lap's reading
    // predates the fill, it reported ~0.2L for a real 77L stop.
    fuelAddedAtPrevStop: laps.some((l) => l.fuelAdded !== undefined)
      ? laps.reduce((sum, l) => sum + (l.fuelAdded ?? 0), 0)
      : undefined,
    avgLapTimeMs: validLapTimes.length > 0 ? average(validLapTimes) : 0,
    bestLapTimeMs: validLapTimes.length > 0 ? Math.min(...validLapTimes) : 0,
  };
}

/** Splits one driver's continuous lap sequence into pit-to-pit stints.
 *
 *  Requires laps enriched with Garage61 data (`pitIn`/`pitOut`/fuel) — the
 *  iRacing JSON alone has no pit-stop signal for arbitrary field cars, so
 *  this only works for the team's own car (Stint Planner's direct G61
 *  upload, or Race Analysis after merging in the optional G61 upload).
 *
 *  `laps` must already be one driver's laps in ascending lapNumber order
 *  (as produced by the parsers). A pit-in lap ends a stint (it's the
 *  stint's final, slower in-lap); the following pit-out lap begins the
 *  next stint (its first, slower out-lap). */
export function deriveStints(laps: LapRecord[]): Stint[] {
  const stints: Stint[] = [];
  let currentStintLaps: LapRecord[] = [];
  let stintNumber = 1;

  for (const lap of laps) {
    currentStintLaps.push(lap);
    if (lap.pitIn) {
      stints.push(buildStint(stintNumber++, currentStintLaps));
      currentStintLaps = [];
    }
  }
  if (currentStintLaps.length > 0) {
    stints.push(buildStint(stintNumber, currentStintLaps));
  }

  return stints;
}
