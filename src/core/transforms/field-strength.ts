import type {
  DriverRating,
  FieldStrengthPoint,
  RawIracingExport,
  RawIracingLapEntry,
} from "../types/race-data";

export interface ComputeFieldStrengthOptions {
  /** Restrict to cars in this class (car_class_id) — matches
   *  computeFieldPace's scoping so the two describe the same population, which
   *  is the whole point of this metric (see FieldStrengthPoint). */
  carClassId?: number;
  /** A lap number needs at least this many RATED drivers on track before its
   *  average is reported. Guards the tail of a long race: only cars on the
   *  leaders' lap count record the final laps, so a handful of cars there would
   *  otherwise produce a wild, unrepresentative average. Same default and
   *  reasoning as computeFieldPace. */
  minSamples?: number;
}

/** Average iRating of the drivers actually circulating at each lap number.
 *
 *  Deliberately NOT iRacing's Strength of Field — see FieldStrengthPoint for
 *  why this is a separate, plainly-named metric and why it's the right
 *  companion to a delta-vs-field-median chart.
 *
 *  Reads the raw export rather than parsed LapRecords because it needs EVERY
 *  car's laps, not just our team's (same reason computeFieldPace does).
 *
 *  Note on population: a driver counts as "on track" at lap N if they recorded
 *  a timed lap N, including pit and incident laps — they were out there. That's
 *  a slightly wider population than computeFieldPace's clean-laps-only median,
 *  deliberately: excluding pit laps here would make the line dip every time a
 *  chunk of the field happened to stop, which says nothing about field
 *  strength. */
export function computeFieldStrength(
  raw: RawIracingExport,
  ratingsByCustId: Map<number, DriverRating>,
  options: ComputeFieldStrengthOptions = {},
): FieldStrengthPoint[] {
  const { carClassId, minSamples = 5 } = options;

  const classByTeamId = new Map<number, number>();
  for (const entry of raw.lapData) {
    classByTeamId.set(entry.finishing_position.team_id, entry.finishing_position.car_class_id);
  }

  // A Set per lap number: the same driver can appear more than once at one lap
  // number across lapData entries (the array is indexed by finishing position,
  // not car identity — see RawIracingLapEntry), and double-counting one driver
  // would skew the average.
  const custIdsByLapNumber = new Map<number, Set<number>>();
  for (const entry of raw.lapData) {
    for (const [key, value] of Object.entries(entry)) {
      if (!key.startsWith("lap_")) continue;
      const lap = value as RawIracingLapEntry;
      if (lap.lap_number <= 0 || lap.lap_time <= 0) continue;
      if (carClassId !== undefined && classByTeamId.get(lap.group_id) !== carClassId) continue;

      if (!custIdsByLapNumber.has(lap.lap_number)) {
        custIdsByLapNumber.set(lap.lap_number, new Set());
      }
      custIdsByLapNumber.get(lap.lap_number)!.add(lap.cust_id);
    }
  }

  const points: FieldStrengthPoint[] = [];
  for (const lapNumber of [...custIdsByLapNumber.keys()].sort((a, b) => a - b)) {
    const custIds = custIdsByLapNumber.get(lapNumber)!;
    const ratings: number[] = [];
    for (const custId of custIds) {
      const iRating = ratingsByCustId.get(custId)?.iRatingBefore;
      if (iRating !== undefined) ratings.push(iRating);
    }
    if (ratings.length < minSamples) continue;

    points.push({
      lapNumber,
      averageIRating: Math.round(ratings.reduce((sum, r) => sum + r, 0) / ratings.length),
      sampleSize: ratings.length,
      driversOnTrack: custIds.size,
    });
  }

  return points;
}
