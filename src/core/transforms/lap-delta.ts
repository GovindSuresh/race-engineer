import type { LapRecord } from "../types/race-data";
import type { ComparisonUnit } from "./comparison-units";

/** Fewest units that must have a usable lap at an x before a baseline is
 *  computed there. Two is the floor by definition: one unit's median is its
 *  own lap time, which would draw a flat zero line and assert a comparison
 *  that never happened. */
const MIN_UNITS_FOR_BASELINE = 2;

/** What puts two laps at the same x, so they can be compared.
 *
 *  `lapNumber` is the session's own lap count — right for whole runs, which
 *  were driven over the same stretch of a session.
 *
 *  `lapInStint` is the lap's 1-indexed position within its own stint, and is
 *  the only thing that makes a stint comparison possible at all: stints occupy
 *  DISJOINT lap-number ranges, so under `lapNumber` no two stints ever share an
 *  x, no x ever reaches the two-unit floor, and the result is empty. It is also
 *  the more honest axis for the question being asked — position in stint holds
 *  fuel load and tyre age roughly constant across the units, which is exactly
 *  what a setup comparison wants controlled for. */
export type DeltaAlign = "lapNumber" | "lapInStint";

export interface LapDeltaPoint {
  /** Lap number, or position in stint — see `DeltaAlign`. */
  x: number;
  lapTimeMs: number;
  /** lapTimeMs - the baseline median at this x. Positive = this unit was
   *  slower than the others at the same point. */
  deltaMs: number;
}

export interface LapDeltaSeries {
  key: string;
  name: string;
  runSlot: number;
  stintIndex: number;
  /** Ascending by x, and sparse: a point only appears where the baseline
   *  exists, so the chart must not connect across gaps. */
  points: LapDeltaPoint[];
}

export interface LapDeltaBaselinePoint {
  x: number;
  medianLapTimeMs: number;
  /** How many units the median was taken over — always >=
   *  MIN_UNITS_FOR_BASELINE, and worth showing, since a 2-unit median is the
   *  midpoint of a pair rather than a consensus. */
  unitCount: number;
}

export interface LapDeltas {
  /** Series with no comparable lap at all are omitted, so this can be shorter
   *  than the input. Compare lengths to detect a unit that never overlapped. */
  series: LapDeltaSeries[];
  baseline: LapDeltaBaselinePoint[];
  /** Highest x carrying a baseline, for pinning the axis. 0 when nothing could
   *  be compared. */
  maxX: number;
}

/** Every counting lap of a unit paired with its x under the given alignment.
 *
 *  Position is counted over the stint's laps as they were driven, INCLUDING
 *  ones the filters zeroed — dropping a lap must leave a hole in the sequence
 *  rather than sliding every later lap forward, or two units whose filters hit
 *  different laps would be compared at positions that don't correspond. (This
 *  is the opposite of `computeStintPaceTrend`, which closes the gap because it
 *  fits a slope over one stint in isolation and has nothing to align to.) */
function alignedLaps(unit: ComparisonUnit, align: DeltaAlign): { x: number; lap: LapRecord }[] {
  if (align === "lapNumber") {
    return unit.stints.flatMap((stint) =>
      stint.laps.map((lap) => ({ x: lap.lapNumber, lap })),
    );
  }
  return unit.stints.flatMap((stint) =>
    stint.laps.map((lap, index) => ({ x: index + 1, lap })),
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Each unit's lap times as a delta to the median of the OTHER units at the
 *  same x — a per-x baseline, not a single constant.
 *
 *  That distinction is the whole point of the transform. Subtracting one global
 *  constant translates every series by the same amount, which is a relabelled
 *  y-axis and not a new view: the lines keep exactly the shape they have on the
 *  absolute lap-time chart. Recomputing the baseline at each x instead
 *  cancels whatever the units did in common — fuel burning off, the track
 *  rubbering in, a cold opening stint — and leaves only the difference between
 *  them, which is the thing a setup comparison is actually asking about.
 *
 *  Median rather than mean, for the same reason the boxplot beside it uses
 *  quartiles: practice lap distributions have a long right tail (traffic, a
 *  moment at a chicane), and a mean baseline moves towards whichever unit had
 *  the scruffy lap, shifting every OTHER unit's delta as a side effect.
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
 *  An x where fewer than two units have a comparable time carries no baseline
 *  and no points — a run alone on track at lap 40 has nothing to be compared
 *  to, and drawing it at zero would claim it matched a field that wasn't
 *  there. Under `lapNumber` that floor is also what makes a stint comparison
 *  come back empty, which is why `lapInStint` exists. */
export function computeLapDeltas(units: ComparisonUnit[], align: DeltaAlign): LapDeltas {
  // x -> unit key -> lap time. Note that a Garage61 session whose `run` column
  // restarts can carry two laps with the same number in one unit, in which
  // case the later one wins — the same collapse the lap-time chart's
  // `rowsByLap` already accepts, and unavoidable while x is a lap number.
  const timesByX = new Map<number, Map<string, number>>();

  for (const unit of units) {
    for (const { x, lap } of alignedLaps(unit, align)) {
      if (lap.lapTimeMs <= 0) continue;
      if (lap.pitAffected === true || lap.pitIn === true || lap.pitOut === true) continue;
      let atX = timesByX.get(x);
      if (!atX) {
        atX = new Map();
        timesByX.set(x, atX);
      }
      atX.set(unit.key, lap.lapTimeMs);
    }
  }

  const baseline: LapDeltaBaselinePoint[] = [];
  for (const [x, atX] of timesByX) {
    if (atX.size < MIN_UNITS_FOR_BASELINE) continue;
    baseline.push({ x, medianLapTimeMs: median([...atX.values()]), unitCount: atX.size });
  }
  baseline.sort((a, b) => a.x - b.x);

  const series: LapDeltaSeries[] = [];
  for (const unit of units) {
    const points: LapDeltaPoint[] = [];
    for (const { x, medianLapTimeMs } of baseline) {
      const lapTimeMs = timesByX.get(x)?.get(unit.key);
      if (lapTimeMs === undefined) continue;
      points.push({ x, lapTimeMs, deltaMs: lapTimeMs - medianLapTimeMs });
    }
    if (points.length > 0) {
      series.push({
        key: unit.key,
        name: unit.name,
        runSlot: unit.runSlot,
        stintIndex: unit.stintIndex,
        points,
      });
    }
  }

  return {
    series,
    baseline,
    maxX: baseline.length > 0 ? baseline[baseline.length - 1].x : 0,
  };
}
