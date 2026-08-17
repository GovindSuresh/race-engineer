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
 *  Three exclusions:
 *
 *  1. The stint's first lap, positionally — the out-lap, reliably slower for
 *     reasons unrelated to the trend (cold tyres, pit-exit traffic).
 *  2. Any lap flagged `pitIn`/`pitOut`. A stint ends at the in-lap by
 *     construction, since `deriveStints` splits on those flags, so without this
 *     every stint's final point is a lap spent braking into the pit entry. Not
 *     a small bias: measured over the three practice runs in `ref_data`,
 *     in-laps ran 134-152s against ~123.5s green laps, which REVERSED the
 *     reported slope's sign on five of nine stints (+0.169s/lap read as
 *     degradation where the green laps were improving at -0.054s/lap) and
 *     inflated one by 23x. R² rises across the board once they're excluded,
 *     which is the tell that the in-lap was the fit's dominant residual rather
 *     than part of the trend.
 *
 *     Flag-based rather than positional (`slice(1, -1)`) because the final lap
 *     of a run's LAST stint is an ordinary green lap, not an in-lap, and
 *     trimming it would discard real data. The positional out-lap drop stays
 *     as well: Garage61 only flags a *completed* out-lap, so the flag alone
 *     can't be relied on for it. The `excludePitLaps` user filter is not a
 *     substitute either — it defaults off, and a pace trend should never count
 *     a pit lap whatever the user has chosen to see elsewhere.
 *  3. Invalid (-1) lap times, which is also how the Stint Analysis filters and
 *     hand-picks mark a dropped lap — they zero it rather than remove it, so
 *     pit flags and stint boundaries stay intact.
 *
 *  On an iRacing-only source `pitIn`/`pitOut` are undefined, so (2) is a no-op
 *  there rather than silently emptying the stint.
 *
 *  Returns undefined if fewer than 3 laps remain — not enough points for a
 *  meaningful trend. */
export function computeStintPaceTrend(stint: Stint): number | undefined {
  const laps = stint.laps.slice(1).filter((l) => l.lapTimeMs > 0 && !l.pitIn && !l.pitOut);
  if (laps.length < 3) return undefined;

  // Lap-in-stint, 1-indexed over the laps that SURVIVED the exclusions — an
  // excluded lap closes the gap rather than leaving a hole in the sequence.
  const xs = laps.map((_, i) => i + 1);
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
