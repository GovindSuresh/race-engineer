import type { LapRecord, Stint } from "../types/race-data";

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function buildStint(
  stintNumber: number,
  laps: LapRecord[],
  previousStintFuelAtEnd: number | undefined,
): Stint {
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

  // fuelLevel is an end-of-lap reading (per Garage61's column semantics),
  // so the fuel level at the moment the stint BEGAN (before driving the
  // first lap) is backed out by adding that lap's own usage back in.
  const fuelAtStart = firstLap.fuelLevel + firstLap.fuelUsed;

  return {
    stintNumber,
    driverName: firstLap.driverName,
    startLap: firstLap.lapNumber,
    endLap: lastLap.lapNumber,
    laps,
    fuelAtStart,
    fuelAtEnd: lastLap.fuelLevel,
    // Derived from the jump between the previous stint's end-of-stint fuel
    // and this stint's back-computed start-of-stint fuel — there's no
    // separate "fuel added" field on LapRecord, so this is the only signal.
    // Clamped to 0: confirmed against real data that measurement noise
    // between the two readings can produce a small negative "delta" when
    // no refuel actually happened, which isn't physically meaningful.
    fuelAddedAtPrevStop:
      previousStintFuelAtEnd !== undefined
        ? Math.max(0, fuelAtStart - previousStintFuelAtEnd)
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
  let previousStintFuelAtEnd: number | undefined;

  for (const lap of laps) {
    currentStintLaps.push(lap);
    if (lap.pitIn) {
      const stint = buildStint(stintNumber++, currentStintLaps, previousStintFuelAtEnd);
      stints.push(stint);
      previousStintFuelAtEnd = stint.fuelAtEnd;
      currentStintLaps = [];
    }
  }
  if (currentStintLaps.length > 0) {
    stints.push(buildStint(stintNumber, currentStintLaps, previousStintFuelAtEnd));
  }

  return stints;
}
