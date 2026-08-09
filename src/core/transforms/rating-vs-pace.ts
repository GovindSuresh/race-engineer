import type {
  DriverRating,
  FieldPacePoint,
  RatingVsPacePoint,
  RawIracingExport,
  RawIracingLapEntry,
} from "../types/race-data";

// Same tick unit as the parser — see the unit note on RawIracingLapEntry.
function ticksToMs(ticks: number): number {
  return Math.round(ticks / 10);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface ComputeRatingVsPaceOptions {
  carClassId?: number;
  /** A driver needs at least this many clean laps before their median delta is
   *  reported. A driver who did three laps and parked has a median that says
   *  nothing about their pace, and would sit as a misleading outlier on the
   *  scatter. */
  minLaps?: number;
}

/** Places every driver in the field on two axes: how highly rated they were,
 *  and how their pace actually came out — the basis of the "who punched above
 *  their rating" scatter. See RatingVsPacePoint.
 *
 *  Pace is each driver's MEDIAN delta to the field median at the lap numbers
 *  they actually drove. Using the field median as the reference (rather than an
 *  absolute lap time) is what makes drivers comparable across a 24h race: a
 *  driver who only ran at 3am in the wet is measured against what the field did
 *  at 3am in the wet.
 *
 *  Reads the raw export because it needs every car's laps and `lap_events` for
 *  the clean-lap filter — same reason as computeFieldPace, whose output is
 *  passed in here rather than recomputed. */
export function computeRatingVsPace(
  raw: RawIracingExport,
  fieldPace: FieldPacePoint[],
  ratingsByCustId: Map<number, DriverRating>,
  ourTeamId: number,
  options: ComputeRatingVsPaceOptions = {},
): RatingVsPacePoint[] {
  const { carClassId, minLaps = 10 } = options;

  const fieldMedianByLap = new Map(fieldPace.map((p) => [p.lapNumber, p.fieldMedianLapTimeMs]));

  const classByTeamId = new Map<number, number>();
  const teamNameById = new Map<number, string>();
  for (const entry of raw.lapData) {
    const fp = entry.finishing_position;
    classByTeamId.set(fp.team_id, fp.car_class_id);
    teamNameById.set(fp.team_id, fp.display_name);
  }

  interface Accumulator {
    driverName: string;
    teamId: number;
    deltas: number[];
    // Deduplicates: the same driver/lap can appear under more than one lapData
    // entry, since the array is indexed by finishing position, not car identity.
    seenLaps: Set<number>;
  }
  const byCustId = new Map<number, Accumulator>();

  for (const entry of raw.lapData) {
    for (const [key, value] of Object.entries(entry)) {
      if (!key.startsWith("lap_")) continue;
      const lap = value as RawIracingLapEntry;
      if (lap.lap_number <= 0 || lap.lap_time <= 0) continue;
      if (lap.lap_events.length > 0) continue; // clean laps only, matching the field median
      if (carClassId !== undefined && classByTeamId.get(lap.group_id) !== carClassId) continue;

      const fieldMedianMs = fieldMedianByLap.get(lap.lap_number);
      if (fieldMedianMs === undefined) continue;

      let acc = byCustId.get(lap.cust_id);
      if (!acc) {
        acc = {
          driverName: lap.display_name,
          teamId: lap.group_id,
          deltas: [],
          seenLaps: new Set(),
        };
        byCustId.set(lap.cust_id, acc);
      }
      if (acc.seenLaps.has(lap.lap_number)) continue;
      acc.seenLaps.add(lap.lap_number);
      acc.deltas.push(ticksToMs(lap.lap_time) - fieldMedianMs);
    }
  }

  const points: RatingVsPacePoint[] = [];
  for (const [custId, acc] of byCustId) {
    if (acc.deltas.length < minLaps) continue;
    const iRating = ratingsByCustId.get(custId)?.iRatingBefore;
    if (iRating === undefined) continue;

    points.push({
      custId,
      driverName: acc.driverName,
      teamId: acc.teamId,
      teamName: teamNameById.get(acc.teamId) ?? acc.driverName,
      iRating,
      medianDeltaMs: median(acc.deltas),
      lapsCounted: acc.deltas.length,
      isOurTeam: acc.teamId === ourTeamId,
    });
  }

  return points.sort((a, b) => a.iRating - b.iRating);
}

/** Least-squares fit of median delta against iRating, for the trend line the
 *  scatter is read against: a driver below the line beat what their rating
 *  predicted. Returns undefined when there aren't enough points, or when every
 *  driver shares one rating (a vertical fit has no meaningful slope).
 *
 *  `msPerIRatingPoint` is expected to be negative in a normal field — higher
 *  rating, quicker relative pace. */
export function fitRatingPaceTrend(
  points: RatingVsPacePoint[],
): { msPerIRatingPoint: number; interceptMs: number } | undefined {
  if (points.length < 3) return undefined;

  const n = points.length;
  const meanX = points.reduce((s, p) => s + p.iRating, 0) / n;
  const meanY = points.reduce((s, p) => s + p.medianDeltaMs, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (const p of points) {
    numerator += (p.iRating - meanX) * (p.medianDeltaMs - meanY);
    denominator += (p.iRating - meanX) ** 2;
  }
  if (denominator === 0) return undefined;

  const slope = numerator / denominator;
  return { msPerIRatingPoint: slope, interceptMs: meanY - slope * meanX };
}
