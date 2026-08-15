import type { ConditionsSummary, LapRecord, WeatherSnapshot } from "../types/race-data";

function average(values: number[]): number {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** iRacing's seven track-wetness states, in order.
 *
 *  Wetness is ordinal, not continuous. Garage61 rescales the seven states
 *  onto 0-100, so a reading is `state × 100/6`: 0, 16.7, 33.3, 50, 66.7,
 *  83.3, 100 — and the 461-lap Spa export contains only 0, 17, 33 and 50,
 *  exactly those steps rounded. Showing "50%" implies a measurement that
 *  doesn't exist; "lightly wet" is the actual reading. */
const WETNESS_STATES = [
  "Dry",
  "Mostly dry",
  "Very lightly wet",
  "Lightly wet",
  "Moderately wet",
  "Very wet",
  "Extremely wet",
] as const;

const WETNESS_STEP = 100 / (WETNESS_STATES.length - 1);

/** Names a `trackWetness` reading. Snaps to the nearest state rather than
 *  requiring an exact step, since the export rounds (17, not 16.67). */
export function trackWetnessLabel(pct: number): string {
  const index = Math.round(pct / WETNESS_STEP);
  return WETNESS_STATES[Math.min(Math.max(index, 0), WETNESS_STATES.length - 1)];
}

/** True when this lap's weather block is a real reading rather than a filled-in
 *  blank.
 *
 *  Garage61 returns laps with no weather attached, and it does NOT omit the
 *  fields — it sends `trackWetness: -1` alongside `trackTemp: 0` and
 *  `airTemp: 0` (seen on real laps, all of them `incomplete`). Both sentinels
 *  are dangerous in a summary: a bogus 0°C drags a min down to freezing, and
 *  a bogus -1 rounds to "Dry". A negative wetness is the unambiguous tell —
 *  a rescaled ordinal cannot be below its first state — and the paired
 *  zeroed temperatures are checked too, since a 0°C track WITH a plausible
 *  air temp is a legitimate (if cold) reading and must survive. */
export function hasWeatherReading(weather: WeatherSnapshot): boolean {
  if (weather.trackWetness < 0) return false;
  return !(weather.trackTempC === 0 && weather.airTempC === 0);
}

/** Summarizes track/weather conditions across a set of laps, from
 *  Garage61's per-lap weather data (`LapRecord.weather`). Returns
 *  `undefined` if none of the laps carry it (iRacing-only laps, an
 *  empty array, or laps whose weather is all sentinels) — there's nothing
 *  to summarize, not a zeroed-out reading. */
export function computeConditionsSummary(laps: LapRecord[]): ConditionsSummary | undefined {
  const allWeather = laps
    .map((l) => l.weather)
    .filter((w): w is WeatherSnapshot => w !== undefined);

  const weathers = allWeather.filter(hasWeatherReading);
  if (weathers.length === 0) return undefined;

  const trackTemps = weathers.map((w) => w.trackTempC);
  const airTemps = weathers.map((w) => w.airTempC);
  // Track usage is read from EVERY lap that has one, not just the laps with a
  // usable weather reading — it doesn't travel with the weather sample (real
  // laps carry a usage figure beside blanked-out temps), so gating it on the
  // temperatures would throw away valid readings and understate the range.
  const usages = allWeather
    .map((w) => w.trackUsagePct)
    .filter((pct): pct is number => pct !== null);

  return {
    trackTempMinC: Math.min(...trackTemps),
    trackTempMaxC: Math.max(...trackTemps),
    trackTempAvgC: average(trackTemps),
    airTempMinC: Math.min(...airTemps),
    airTempMaxC: Math.max(...airTemps),
    airTempAvgC: average(airTemps),
    maxTrackWetnessPct: Math.max(...weathers.map((w) => w.trackWetness)),
    trackUsageMinPct: usages.length > 0 ? Math.min(...usages) : null,
    trackUsageMaxPct: usages.length > 0 ? Math.max(...usages) : null,
    avgWindVelocityMs: average(weathers.map((w) => w.windVelocity)),
    lapsWithReading: weathers.length,
  };
}
