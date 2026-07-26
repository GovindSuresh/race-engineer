import type { DriverPaceStats, LapRecord, Stint } from "../types/race-data";
import { deriveStints } from "./stints";

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

function median(sortedValues: number[]): number {
  if (sortedValues.length === 0) return 0;
  const mid = Math.floor(sortedValues.length / 2);
  return sortedValues.length % 2 === 0
    ? (sortedValues[mid - 1] + sortedValues[mid]) / 2
    : sortedValues[mid];
}

// Population standard deviation (divides by n, not n-1) — we're describing
// the spread of this driver's own observed laps, not estimating a
// population from a sample.
function stdDev(values: number[], mean: number): number {
  if (values.length === 0) return 0;
  return Math.sqrt(average(values.map((v) => (v - mean) ** 2)));
}

function hasGarage61FuelData(lap: LapRecord): boolean {
  return lap.fuelLevel !== undefined && lap.fuelUsed !== undefined;
}

/** Computes pace/consistency stats for one driver across all their laps in
 *  the race. `laps` must be one driver's laps (any order — sorted by lap
 *  number internally). Only valid (lapTimeMs > 0) laps count toward the
 *  pace stats. Stints can only be derived from laps carrying Garage61
 *  fuel/pit data (the team's own car) — for full-field opponents without
 *  any of it, `stints` is simply [].
 *
 *  Confirmed against real data: a driver's laps aren't necessarily ALL
 *  enriched even when SOME are — e.g. a driver who did two separate stints
 *  where the Garage61 export only covers one of them (a second real stint
 *  recorded in a different session/export). Requiring every lap to be
 *  enriched would zero out stint data for the whole driver in that case;
 *  instead we derive stints from just the enriched subset. Known
 *  limitation: if an unenriched gap falls in the MIDDLE of what would
 *  otherwise be one stint (swallowing a pit event), the stint on either
 *  side of the gap could be incorrectly merged — deriveStints only looks
 *  at pitIn/pitOut flags, not lap-number continuity. Not handled here;
 *  hasn't been observed in real data yet. */
export function computeDriverPaceStats(laps: LapRecord[]): DriverPaceStats {
  const sortedLaps = [...laps].sort((a, b) => a.lapNumber - b.lapNumber);
  const sortedTimes = sortedLaps
    .map((l) => l.lapTimeMs)
    .filter((t) => t > 0)
    .sort((a, b) => a - b);

  const averageLapTimeMs = average(sortedTimes);
  const top10PctCount = Math.max(1, Math.ceil(sortedTimes.length * 0.1));

  const enrichedLaps = sortedLaps.filter(hasGarage61FuelData);
  const stints: Stint[] = enrichedLaps.length > 0 ? deriveStints(enrichedLaps) : [];

  return {
    driverName: sortedLaps[0]?.driverName ?? "",
    custId: sortedLaps[0]?.custId,
    lapsCompleted: sortedTimes.length,
    bestLapTimeMs: sortedTimes[0] ?? 0,
    averageLapTimeMs,
    medianLapTimeMs: median(sortedTimes),
    stdDevMs: stdDev(sortedTimes, averageLapTimeMs),
    top10PctAvgMs: average(sortedTimes.slice(0, top10PctCount)),
    incidentCount: sortedLaps.filter((l) => l.incident).length,
    stints,
  };
}
