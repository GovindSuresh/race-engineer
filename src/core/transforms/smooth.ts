import type { LapRecord, SmoothedPacePoint } from "../types/race-data";

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Smooths a car's own lap times into a trend line — the reference line drawn
 *  over the per-lap scatter on the race timeline.
 *
 *  Uses a rolling MEDIAN, not a mean: a single traffic-ruined or off-track lap
 *  would drag a mean noticeably, while the median ignores it. That matters
 *  here because the whole point of the line is to answer "what was our real
 *  pace around this point of the race", separate from lap-to-lap noise, and
 *  the raw laps are already on screen as scatter for anyone who wants them.
 *
 *  `halfWindow` laps either side are included, so the window is
 *  `2 * halfWindow + 1` wide and shrinks naturally at the start/end of the
 *  race rather than dropping those laps.
 *
 *  Only laps with a valid time (`lapTimeMs > 0`) participate — which is also
 *  how the Stint Planner's lap-exclusion feature and the clean-laps filter
 *  keep excluded laps out of the trend, since both mark laps invalid. */
export function computeSmoothedPace(laps: LapRecord[], halfWindow = 5): SmoothedPacePoint[] {
  const valid = laps
    .filter((l) => l.lapTimeMs > 0)
    .sort((a, b) => a.lapNumber - b.lapNumber);

  return valid.map((lap, i) => {
    const window = valid
      .slice(Math.max(0, i - halfWindow), i + halfWindow + 1)
      .map((l) => l.lapTimeMs);
    return {
      lapNumber: lap.lapNumber,
      smoothedLapTimeMs: median(window),
    };
  });
}
