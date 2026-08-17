import type { LapRecord } from "../types/race-data";

/** Fewest runs that must have a usable lap at a lap number before a baseline
 *  is computed there. Two is the floor by definition: one run's median is its
 *  own lap time, which would draw a flat zero line and assert a comparison
 *  that never happened. */
const MIN_RUNS_FOR_BASELINE = 2;

/** One Stint Analysis series entering the comparison — a run, or one driver
 *  within a driver-swap run, matching how the lap-time chart splits them. */
export interface RunLapDeltaInput {
  /** Stable identity for this series, unique across the whole comparison.
   *  Used as the map key, so two series must never share one. */
  key: string;
  slot: number;
  label: string;
  /** The run's counting laps. Laps the filters or hand-picks dropped arrive
   *  here zeroed rather than removed (the app-wide "not a timed lap"
   *  convention), so they fall out with the `lapTimeMs > 0` test. */
  laps: LapRecord[];
}

export interface RunLapDeltaPoint {
  lapNumber: number;
  lapTimeMs: number;
  /** lapTimeMs - the baseline median at this lap number. Positive = this run
   *  was slower than the others at the same point in the session. */
  deltaMs: number;
}

export interface RunLapDeltaSeries {
  key: string;
  slot: number;
  label: string;
  /** Ascending by lap number, and sparse: a lap only appears where the
   *  baseline exists, so the chart must not connect across gaps. */
  points: RunLapDeltaPoint[];
}

export interface RunLapDeltaBaselinePoint {
  lapNumber: number;
  medianLapTimeMs: number;
  /** How many runs the median was taken over — always >= MIN_RUNS_FOR_BASELINE,
   *  and worth showing, since a 2-run median is the midpoint of a pair rather
   *  than a consensus. */
  runCount: number;
}

export interface RunLapDeltas {
  /** Series with no comparable lap at all are omitted, so this can be shorter
   *  than the input. Compare lengths to detect a run that never overlapped. */
  series: RunLapDeltaSeries[];
  baseline: RunLapDeltaBaselinePoint[];
  /** Highest lap number carrying a baseline, for pinning the x-axis. 0 when
   *  nothing could be compared. */
  maxLap: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Each run's lap times as a delta to the median of the OTHER runs at the same
 *  lap number — a per-lap baseline, not a single constant.
 *
 *  That distinction is the whole point of the transform. Subtracting one global
 *  constant translates every series by the same amount, which is a relabelled
 *  y-axis and not a new view: the lines keep exactly the shape they have on the
 *  absolute lap-time chart. Recomputing the baseline at each lap instead
 *  cancels whatever the runs did in common — fuel burning off, the track
 *  rubbering in, a cold opening stint — and leaves only the difference between
 *  them, which is the thing a setup comparison is actually asking about.
 *
 *  Median rather than mean, for the same reason the boxplot beside it uses
 *  quartiles: practice lap distributions have a long right tail (traffic, a
 *  moment at a chicane), and a mean baseline moves towards whichever run had
 *  the scruffy lap, shifting every OTHER run's delta as a side effect.
 *
 *  Pit in/out laps are excluded outright rather than plotted, following
 *  `computeOurPaceVsField`: they run tens of seconds slow for reasons that
 *  aren't pace, so including them both distorts the baseline and stretches the
 *  y-axis until the ±0.5s the chart exists to show is invisible. They leave a
 *  gap in the line instead.
 *
 *  That exclusion is UNCONDITIONAL and deliberately overrides the user's
 *  `excludePitLaps` filter, which defaults off — leaving it to the toggle would
 *  mean the chart is unreadable until someone happens to find the switch. So of
 *  the lap selection, everything else reaches here (dropped laps arrive zeroed
 *  and fall out above) but "No pit laps" is a no-op on this chart alone. The
 *  panel copy states this, since it differs from the absolute lap-time chart,
 *  which does still draw in-lap spikes with the toggle off.
 *
 *  Laps where fewer than two runs have a comparable time carry no baseline and
 *  no points — a run alone on track at lap 40 has nothing to be compared to,
 *  and drawing it at zero would claim it matched a field that wasn't there. */
export function computeRunLapDeltas(runs: RunLapDeltaInput[]): RunLapDeltas {
  // lap number -> series key -> lap time. Keyed by lap NUMBER, which is what
  // puts the runs on a shared axis; note that a Garage61 session whose `run`
  // column restarts can carry two laps with the same number in one series, in
  // which case the later one wins — the same collapse the lap-time chart's
  // `rowsByLap` already accepts, and unavoidable while x is a lap number.
  const timesByLap = new Map<number, Map<string, number>>();

  for (const run of runs) {
    for (const lap of run.laps) {
      if (lap.lapTimeMs <= 0) continue;
      if (lap.pitAffected === true || lap.pitIn === true || lap.pitOut === true) continue;
      let atLap = timesByLap.get(lap.lapNumber);
      if (!atLap) {
        atLap = new Map();
        timesByLap.set(lap.lapNumber, atLap);
      }
      atLap.set(run.key, lap.lapTimeMs);
    }
  }

  const baseline: RunLapDeltaBaselinePoint[] = [];
  const medianByLap = new Map<number, number>();

  for (const [lapNumber, atLap] of timesByLap) {
    if (atLap.size < MIN_RUNS_FOR_BASELINE) continue;
    const medianLapTimeMs = median([...atLap.values()]);
    medianByLap.set(lapNumber, medianLapTimeMs);
    baseline.push({ lapNumber, medianLapTimeMs, runCount: atLap.size });
  }
  baseline.sort((a, b) => a.lapNumber - b.lapNumber);

  const series: RunLapDeltaSeries[] = [];
  for (const run of runs) {
    const points: RunLapDeltaPoint[] = [];
    for (const { lapNumber, medianLapTimeMs } of baseline) {
      const lapTimeMs = timesByLap.get(lapNumber)?.get(run.key);
      if (lapTimeMs === undefined) continue;
      points.push({ lapNumber, lapTimeMs, deltaMs: lapTimeMs - medianLapTimeMs });
    }
    if (points.length > 0) {
      series.push({ key: run.key, slot: run.slot, label: run.label, points });
    }
  }

  return {
    series,
    baseline,
    maxLap: baseline.length > 0 ? baseline[baseline.length - 1].lapNumber : 0,
  };
}
