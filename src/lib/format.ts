/** Formats an absolute lap time (ms) for display, motorsport-timing style:
 *  plain decimal seconds under a minute, `M:SS.ss` once a lap runs a minute
 *  or longer (e.g. a GT3 lap at Spa reads "2:16.33", not "136.33s"). Only
 *  for values that represent "how long one lap took" — best/average/median/
 *  top-10% — never for deltas or spreads, where a clock-style reading would
 *  be misleading; use `formatSeconds` for those instead. */
export function formatLapTime(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(2)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(2).padStart(5, "0")}`;
}

/** Formats a duration/spread/delta (ms) as plain decimal seconds — for std
 *  dev, gaps, pace trends, and anything else that's a magnitude rather than
 *  "a point on the clock" (see `formatLapTime` for the latter). */
export function formatSeconds(ms: number): string {
  return `${(ms / 1000).toFixed(2)}s`;
}
