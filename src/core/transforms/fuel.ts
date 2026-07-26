import type { Stint } from "../types/race-data";

function averageFuelUsedPerLap(laps: Stint["laps"]): number {
  const usages = laps
    .map((l) => l.fuelUsed)
    .filter((u): u is number => u !== undefined);
  if (usages.length === 0) return 0;
  return usages.reduce((a, b) => a + b, 0) / usages.length;
}

/** Average fuel burn rate (litres/lap) for a single stint, from each lap's
 *  own recorded fuel usage (Garage61 data — requires the laps to carry
 *  `fuelUsed`; returns 0 if none do). Strategy calculations (stops needed,
 *  pit windows) are a separate, not-yet-built feature — this only computes
 *  the burn rate itself. */
export function computeFuelBurnRate(stint: Stint): number {
  return averageFuelUsedPerLap(stint.laps);
}

/** Average fuel burn rate (litres/lap) across multiple stints, weighted by
 *  lap count (not an average-of-per-stint-averages, which would bias short
 *  stints as heavily as long ones). Useful for a more stable race-wide
 *  estimate than any single stint alone. */
export function computeAverageFuelBurnRate(stints: Stint[]): number {
  return averageFuelUsedPerLap(stints.flatMap((s) => s.laps));
}
