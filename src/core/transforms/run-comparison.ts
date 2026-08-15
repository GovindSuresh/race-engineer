import type { Stint } from "../types/race-data";
import { computeAverageFuelBurnRate } from "./fuel";
import { computeStintPaceTrend } from "./stint-pace-trend";

/** One Stint Planner run, reduced to what a comparison needs. The page owns
 *  the run's identity (slot, label) and its filtered stints; everything below
 *  is derived from the stints alone. */
export interface RunComparisonInput {
  slot: number;
  label: string;
  stints: Stint[];
}

/** Headline numbers for one run, all derived from the laps that survived the
 *  current filters — so the table always agrees with what the charts show. */
export interface RunComparison {
  slot: number;
  label: string;
  stintCount: number;
  /** Timed laps counted. Laps with no time (`lapTimeMs <= 0`) are excluded
   *  everywhere here, since averaging a zero would drag every figure down. */
  lapCount: number;
  bestLapTimeMs: number | null;
  medianLapTimeMs: number | null;
  avgLapTimeMs: number | null;
  /** Population standard deviation of lap times, ms.
   *
   *  The point of comparing practice runs is repeatability, not just outright
   *  speed: a quick average you can't reproduce is worth less than a slightly
   *  slower one you can hold for a stint. Averages alone hide that entirely,
   *  which is why this sits beside them rather than in a detail view. */
  lapTimeStdDevMs: number | null;
  /** Litres per lap, lap-count weighted across the run's stints. */
  fuelPerLap: number | null;
  /** Litres added across every stop that started a stint in this run. */
  fuelAddedTotal: number | null;
  /** Mean of the per-stint pace trends (ms/lap, positive = getting slower).
   *  Averaged across stints rather than fitted across the whole run, because
   *  a run-wide fit would read the fuel-load reset at every stop as pace. */
  paceTrendMsPerLap: number | null;
}

function timedLapTimes(stints: Stint[]): number[] {
  return stints.flatMap((stint) =>
    stint.laps.map((lap) => lap.lapTimeMs).filter((ms) => ms > 0),
  );
}

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Quantile by linear interpolation between the two nearest ranks — the same
 *  definition ECharts' own boxplot helper uses, so the table and the chart
 *  can't disagree about where a quartile sits. */
function quantile(sorted: number[], q: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  const position = (sorted.length - 1) * q;
  const base = Math.floor(position);
  const rest = position - base;
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + rest * (next - sorted[base]);
}

export function computeRunComparison(runs: RunComparisonInput[]): RunComparison[] {
  return runs.map((run) => {
    const times = timedLapTimes(run.stints).sort((a, b) => a - b);
    const count = times.length;

    const mean = count > 0 ? times.reduce((a, b) => a + b, 0) / count : null;
    const variance =
      count > 0 && mean !== null
        ? times.reduce((sum, ms) => sum + (ms - mean) ** 2, 0) / count
        : null;

    const burn = computeAverageFuelBurnRate(run.stints);

    // `fuelAddedAtPrevStop` is undefined for a non-Garage61 source, and 0 is a
    // genuine no-fuel stop — so only treat the total as unknown when NO stint
    // reported a figure at all.
    const fuelAdds = run.stints
      .map((stint) => stint.fuelAddedAtPrevStop)
      .filter((litres): litres is number => litres !== undefined);

    const trends = run.stints
      .map((stint) => computeStintPaceTrend(stint))
      .filter((trend): trend is number => trend !== undefined);

    return {
      slot: run.slot,
      label: run.label,
      stintCount: run.stints.length,
      lapCount: count,
      bestLapTimeMs: count > 0 ? times[0] : null,
      medianLapTimeMs: median(times),
      avgLapTimeMs: mean,
      lapTimeStdDevMs: variance === null ? null : Math.sqrt(variance),
      fuelPerLap: burn > 0 ? burn : null,
      fuelAddedTotal: fuelAdds.length > 0 ? fuelAdds.reduce((a, b) => a + b, 0) : null,
      paceTrendMsPerLap:
        trends.length > 0 ? trends.reduce((a, b) => a + b, 0) / trends.length : null,
    };
  });
}

/** Five-number summary plus outliers for one run, ready for an ECharts
 *  boxplot. Whiskers use Tukey's 1.5×IQR rule, so a single scruffy lap stops
 *  stretching the whisker and shows up as the outlier it is — which is the
 *  whole reason to draw a boxplot next to a table of averages. */
export interface RunLapDistribution {
  slot: number;
  label: string;
  /** [min, Q1, median, Q3, max] in ms, the order ECharts' boxplot expects. */
  box: [number, number, number, number, number] | null;
  /** Lap times beyond the whiskers, in ms, paired with their lap numbers so
   *  the tooltip can name the lap rather than just show a dot. */
  outliers: { lapNumber: number; lapTimeMs: number }[];
}

export function computeRunLapDistributions(
  runs: RunComparisonInput[],
): RunLapDistribution[] {
  return runs.map((run) => {
    const timed = run.stints
      .flatMap((stint) => stint.laps)
      .filter((lap) => lap.lapTimeMs > 0)
      .map((lap) => ({ lapNumber: lap.lapNumber, lapTimeMs: lap.lapTimeMs }));

    if (timed.length === 0) {
      return { slot: run.slot, label: run.label, box: null, outliers: [] };
    }

    const sorted = timed.map((lap) => lap.lapTimeMs).sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const median50 = quantile(sorted, 0.5);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;

    const inside = sorted.filter((ms) => ms >= lowerFence && ms <= upperFence);
    const outliers = timed.filter(
      (lap) => lap.lapTimeMs < lowerFence || lap.lapTimeMs > upperFence,
    );

    return {
      slot: run.slot,
      label: run.label,
      box: [
        inside.length > 0 ? inside[0] : sorted[0],
        q1,
        median50,
        q3,
        inside.length > 0 ? inside[inside.length - 1] : sorted[sorted.length - 1],
      ],
      outliers,
    };
  });
}
