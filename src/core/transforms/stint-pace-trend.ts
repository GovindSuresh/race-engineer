import type { Stint } from "../types/race-data";

/** Computes the stint's pace trend as the slope (ms per lap-in-stint) of
 *  lap time vs. position within the stint, via ordinary least squares. A
 *  positive slope means laps are getting slower as the stint goes on.
 *
 *  NOTE: this is a lap-time trend, not a tyre-degradation measurement —
 *  the slope can just as easily reflect fuel burn-off (lighter = faster),
 *  traffic, driver fatigue, or track evolution. Don't attribute causally
 *  without corroborating signal.
 *
 *  Excludes the stint's first lap (the out-lap): it's reliably slower for
 *  reasons unrelated to the trend (cold tyres, pit-exit traffic), which
 *  would bias it. Also excludes invalid (-1) lap times. Returns undefined
 *  if fewer than 3 laps remain — not enough points for a meaningful trend. */
export function computeStintPaceTrend(stint: Stint): number | undefined {
  const laps = stint.laps.slice(1).filter((l) => l.lapTimeMs > 0);
  if (laps.length < 3) return undefined;

  const xs = laps.map((_, i) => i + 1); // lap-in-stint, 1-indexed after dropping the out-lap
  const ys = laps.map((l) => l.lapTimeMs);

  const n = xs.length;
  const meanX = xs.reduce((a, b) => a + b, 0) / n;
  const meanY = ys.reduce((a, b) => a + b, 0) / n;

  let numerator = 0;
  let denominator = 0;
  for (let i = 0; i < n; i++) {
    numerator += (xs[i] - meanX) * (ys[i] - meanY);
    denominator += (xs[i] - meanX) ** 2;
  }

  if (denominator === 0) return undefined;
  return numerator / denominator;
}
