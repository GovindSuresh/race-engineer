import type { ConditionsSummary, LapRecord, WeatherSnapshot } from "../types/race-data";

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Summarizes track/weather conditions across a set of laps, from
 *  Garage61's per-lap weather data (`LapRecord.weather`). Returns
 *  `undefined` if none of the laps carry it (iRacing-only laps, or an
 *  empty array) — there's nothing to summarize, not a zeroed-out reading. */
export function computeConditionsSummary(laps: LapRecord[]): ConditionsSummary | undefined {
  const weathers = laps
    .map((l) => l.weather)
    .filter((w): w is WeatherSnapshot => w !== undefined);
  if (weathers.length === 0) return undefined;

  return {
    trackTempMinC: Math.min(...weathers.map((w) => w.trackTempC)),
    trackTempMaxC: Math.max(...weathers.map((w) => w.trackTempC)),
    airTempMinC: Math.min(...weathers.map((w) => w.airTempC)),
    airTempMaxC: Math.max(...weathers.map((w) => w.airTempC)),
    maxTrackWetnessPct: Math.max(...weathers.map((w) => w.trackWetness)),
    avgWindVelocityMs: average(weathers.map((w) => w.windVelocity)),
  };
}
