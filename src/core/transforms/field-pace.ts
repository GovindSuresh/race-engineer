import type {
  FieldPacePoint,
  LapRecord,
  PaceVsFieldPoint,
  RawIracingExport,
  RawIracingLapEntry,
} from "../types/race-data";

// Same tick unit as the parser — see the unit note on RawIracingLapEntry.
function ticksToMs(ticks: number): number {
  return ticks < 0 ? -1 : Math.round(ticks / 10);
}

function median(sortedValues: number[]): number {
  const mid = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[mid - 1] + sortedValues[mid]) / 2
    : sortedValues[mid];
}

export interface ComputeFieldPaceOptions {
  /** Restrict the field to cars in this class (car_class_id) — a fair
   *  comparison in multi-class races, since an LMP2's pace is meaningless
   *  as a yardstick for a GT3. Omit to use the whole field (fine for a
   *  single-class race). */
  carClassId?: number;
  /** A lap number needs at least this many clean samples across the field
   *  before its raw median is trusted at all (avoids a wild median from 2
   *  cars still running late in a race with heavy attrition). Matches the
   *  value validated against real 24h endurance data in the reference
   *  prototype this was ported from. */
  minSamples?: number;
  /** Final value at each lap number is the median of the raw medians in a
   *  window of ±this many lap numbers — smooths out one-off noise (e.g. a
   *  lap where an unusually large chunk of the field happened to pit)
   *  without hiding a genuine, sustained shift in field pace. */
  smoothingWindowLaps?: number;
}

/** Computes the field's own clean-lap pace at every lap number of the race
 *  — see the doc comment on FieldPacePoint for why this exists. Reads
 *  directly from the raw iRacing export rather than parsed LapRecords,
 *  because the pit-lap exclusion needs `lap_events` (e.g. "pitted"), which
 *  parseIracingJson() doesn't currently carry through onto LapRecord (only
 *  the coarser `incident` boolean does) — this mirrors buildRaceSummary(),
 *  which also reads `raw` directly for exactly this kind of "the parsed
 *  domain type doesn't carry a signal this one derivation needs" reason. */
export function computeFieldPace(
  raw: RawIracingExport,
  options: ComputeFieldPaceOptions = {},
): FieldPacePoint[] {
  const { carClassId, minSamples = 5, smoothingWindowLaps = 3 } = options;

  const classByTeamId = new Map<number, number>();
  for (const entry of raw.lapData) {
    classByTeamId.set(entry.finishing_position.team_id, entry.finishing_position.car_class_id);
  }

  const cleanLapTimesByLapNumber = new Map<number, number[]>();
  for (const entry of raw.lapData) {
    for (const [key, value] of Object.entries(entry)) {
      if (!key.startsWith("lap_")) continue;
      const lap = value as RawIracingLapEntry;
      if (lap.lap_number <= 0 || lap.lap_time <= 0) continue;
      if (lap.lap_events.length > 0) continue; // excludes pit in/out laps too
      if (carClassId !== undefined && classByTeamId.get(lap.group_id) !== carClassId) continue;

      if (!cleanLapTimesByLapNumber.has(lap.lap_number)) {
        cleanLapTimesByLapNumber.set(lap.lap_number, []);
      }
      cleanLapTimesByLapNumber.get(lap.lap_number)!.push(ticksToMs(lap.lap_time));
    }
  }

  const rawMedianByLapNumber = new Map<number, { median: number; sampleSize: number }>();
  for (const [lapNumber, times] of cleanLapTimesByLapNumber) {
    if (times.length < minSamples) continue;
    const sorted = [...times].sort((a, b) => a - b);
    rawMedianByLapNumber.set(lapNumber, { median: median(sorted), sampleSize: times.length });
  }

  const lapNumbers = [...rawMedianByLapNumber.keys()].sort((a, b) => a - b);

  return lapNumbers.map((lapNumber, i) => {
    const windowValues = lapNumbers
      .slice(Math.max(0, i - smoothingWindowLaps), i + smoothingWindowLaps + 1)
      .map((n) => rawMedianByLapNumber.get(n)!.median)
      .sort((a, b) => a - b);
    return {
      lapNumber,
      fieldMedianLapTimeMs: median(windowValues),
      sampleSize: rawMedianByLapNumber.get(lapNumber)!.sampleSize,
    };
  });
}

/** Joins our own laps against the field pace computed above, lap number to
 *  lap number, to produce the series a "pace vs field" chart renders.
 *
 *  A pit-affected lap of OURS is excluded from `deltaMs` the same way a
 *  pit-affected lap of the FIELD's is excluded from the median itself
 *  (see computeFieldPace) — for the same reason: an in/out lap being tens
 *  of seconds slower isn't a pace signal, it's a pit stop, and leaving it
 *  in would both misrepresent our pace that lap and (via a wildly-off
 *  outlier) wreck the scale of anything that charts this series. Still
 *  flagged via `pitAffected` rather than just dropped, so a chart can mark
 *  where it happened without plotting a misleading number for it. */
export function computeOurPaceVsField(
  ourTeamLaps: LapRecord[],
  fieldPace: FieldPacePoint[],
): PaceVsFieldPoint[] {
  const fieldPaceByLapNumber = new Map(fieldPace.map((p) => [p.lapNumber, p.fieldMedianLapTimeMs]));

  return [...ourTeamLaps]
    .filter((l) => l.lapTimeMs > 0)
    .sort((a, b) => a.lapNumber - b.lapNumber)
    .map((l) => {
      const pitAffected = l.pitAffected === true || l.pitIn === true || l.pitOut === true;
      const fieldMedianLapTimeMs = fieldPaceByLapNumber.get(l.lapNumber);
      const deltaMs =
        !pitAffected && fieldMedianLapTimeMs !== undefined
          ? l.lapTimeMs - fieldMedianLapTimeMs
          : undefined;
      return {
        lapNumber: l.lapNumber,
        ourLapTimeMs: l.lapTimeMs,
        fieldMedianLapTimeMs,
        deltaMs,
        pitAffected,
      };
    });
}
