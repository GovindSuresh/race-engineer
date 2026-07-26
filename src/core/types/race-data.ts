// ============================================================================
// /core/types/race-data.ts
//
// Domain types for the race analysis tool.
//
// This file is split into two halves:
//   1. SOURCE TYPES — shape of the raw data as it comes out of iRacing / G61.
//      Parsers consume these; nothing outside /core/parsers should touch them.
//   2. DOMAIN TYPES — the normalized shape everything else (transforms, UI)
//      is built on. Parsers produce these; components render them.
//
// UI code should only ever import from the "DOMAIN TYPES" section.
// ============================================================================

// ----------------------------------------------------------------------------
// 1. SOURCE TYPES — raw iRacing JSON
// ----------------------------------------------------------------------------

/** One lap entry as it appears nested under `lap_N` in the iRacing export.
 *  NOTE: within a single `lapData[i]` entry, consecutive lap_N objects can
 *  belong to DIFFERENT teams — the array index is FINISH position, but each
 *  lap_N snapshot reflects whoever held that TRACK position at that lap.
 *  The parser is responsible for reconstructing per-car time series from
 *  this; nothing downstream should assume lap_N belongs to a fixed team.
 *
 *  NOTE on units: despite how it looks, `lap_time`/`session_time` (and
 *  `best_lap_time`/`average_lap` below) are NOT milliseconds — they're
 *  iRacing's native tick unit of 1/10000th of a second. Confirmed against
 *  real data: a value of 1384533 is a 138.45s lap (plausible GT3 @ Spa),
 *  not a 1384.5s (23 minute) one. Divide by 10 to get true milliseconds —
 *  the parser does this when producing `LapRecord.lapTimeMs`. */
export interface RawIracingLapEntry {
  group_id: number;
  name: string;              // team name at time of this lap
  cust_id: number;
  display_name: string;      // driver name at time of this lap
  lap_number: number;
  flags: number;
  incident: boolean;
  session_time: number;      // 1/10000ths of a second since session start (NOT ms — see note below)
  lap_time: number;          // 1/10000ths of a second; -1 if not a valid timed lap (e.g. lap 0)
  team_fastest_lap: boolean;
  personal_best_lap: boolean;
  car_number: string;
  lap_events: string[];
  lap_position: number;      // track position at this lap
  interval: number | null;
  interval_units: string | null;
  fastest_lap: boolean;
  ai: boolean;
}

export interface RawIracingDriverResult {
  team_id: number;
  cust_id: number;
  display_name: string;
  car_name: string;
  car_class_name: string;
  best_lap_num: number;
  best_lap_time: number;      // 1/10000ths of a second — see unit note on RawIracingLapEntry
  average_lap: number;        // 1/10000ths of a second — see unit note on RawIracingLapEntry
  laps_complete: number;
  laps_lead: number;
  incidents: number;
  finish_position: number;
  starting_position: number;
  division: number;
  // Rating/license context, for contextualizing performance against the field.
  // Both old_/new_ values are present so the delta earned THIS race can be
  // derived (new - old); "old" is the driver's value entering the race.
  new_license_level: number; // license class, int-encoded (Rookie/D/C/B/A/Pro)
  old_license_level: number;
  new_sub_level: number;     // Safety Rating within the class, x100 (499 = "4.99")
  old_sub_level: number;
  newi_rating: number;       // iRating (category skill rating) after this race
  oldi_rating: number;       // iRating entering this race
}

export interface RawIracingFinishingPosition {
  team_id: number;
  display_name: string;      // team name
  car_id: number;
  car_name: string;
  car_class_id: number;
  car_class_name: string;
  finish_position: number;
  finish_position_in_class: number;
  starting_position: number;
  best_lap_num: number;
  best_lap_time: number;      // 1/10000ths of a second — see unit note on RawIracingLapEntry
  average_lap: number;        // 1/10000ths of a second — see unit note on RawIracingLapEntry
  laps_complete: number;
  laps_lead: number;
  incidents: number;
  reason_out: string;
  // Same rating/license fields as RawIracingDriverResult — present at this
  // team-level entry too in the raw export (see field notes there).
  new_license_level: number;
  old_license_level: number;
  new_sub_level: number;
  old_sub_level: number;
  newi_rating: number;
  oldi_rating: number;
  driver_results: RawIracingDriverResult[];
}

/** One element of the top-level `lapData` array. Index in the array = final
 *  classified position (0 = winner). Contains lap_0..lap_N keys plus the
 *  team's overall result metadata. */
export interface RawIracingLapDataEntry {
  finishing_position: RawIracingFinishingPosition;
  livery?: Record<string, unknown>;
  [lapKey: `lap_${number}`]: RawIracingLapEntry;
}

export interface RawIracingExport {
  subsession_id: number;
  lapData: RawIracingLapDataEntry[];
}

// ----------------------------------------------------------------------------
// 1b. SOURCE TYPES — raw Garage61 CSV (one row per parsed CSV line)
// ----------------------------------------------------------------------------

export interface RawGarage61Row {
  run: number;               // stint/run number
  lap: number;
  lapTimeSeconds: number;
  startedAt: string;         // ISO timestamp
  driver: string;
  clean: boolean;
  pitIn: boolean;
  pitOut: boolean;
  trackTempC: number;
  trackUsagePct: number;
  airTempC: number;
  cloudCover: number;
  airDensity: number;
  airPressure: number;
  windVelocity: number;
  windDirection: number;
  relativeHumidity: number;
  fogLevel: number;
  precipitation: number;
  trackWetness: number;
  fuelLevel: number;         // litres remaining at end of lap
  fuelUsed: number;          // litres used this lap
  fuelAdded: number;         // litres added this lap (0 unless a pit stop)
  sector1: number | null;
  sector2: number | null;
  sector3: number | null;
  sector4: number | null;
}

// ----------------------------------------------------------------------------
// 2. DOMAIN TYPES — normalized shape used by transforms and UI
// ----------------------------------------------------------------------------

export interface WeatherSnapshot {
  trackTempC: number;
  airTempC: number;
  trackWetness: number;
  precipitation: number;
  windVelocity: number;
}

/** A single reconstructed lap for one driver, merged from both sources
 *  where possible (G61 lap matched to iRacing lap by lap number + driver). */
export interface LapRecord {
  lapNumber: number;
  driverName: string;
  custId?: number;           // present when sourced from iRacing
  teamId?: number;           // present when sourced from iRacing (group_id) —
                             // confirmed stable across driver swaps, unlike
                             // teamName which is a less certain match key
  teamName: string;
  lapTimeMs: number;
  trackPositionAtLap?: number;
  // Gap to the race leader at this lap, from iRacing's own `interval` field
  // (present when sourced from iRacing) — exactly one of these two is set
  // per lap, never both. See the unit note on GapTrendPoint for why there
  // are two fields instead of one.
  gapToLeaderMs?: number;
  lapsDownFromLeader?: number;
  isClean?: boolean;         // from G61 "Clean" flag
  incident?: boolean;        // from iRacing incident flag
  pitIn?: boolean;           // from G61 "Pit in" flag — needed to derive Stint[]
  pitOut?: boolean;          // from G61 "Pit out" flag
  // True when iRacing's own lap_events flagged this lap as pit-related
  // (e.g. "pitted") — unlike pitIn/pitOut, this is available for EVERY car
  // straight from the iRacing export, no Garage61 merge needed. Doesn't
  // distinguish in-lap vs out-lap (iRacing's own event list doesn't
  // either) — anything that only needs "was this lap pit-affected at all"
  // (e.g. excluding it from a pace comparison) should prefer this over
  // pitIn/pitOut, which are undefined for the rest of the field.
  pitAffected?: boolean;
  fuelUsed?: number;
  fuelLevel?: number;
  sectorTimes?: [number | null, number | null, number | null, number | null];
  weather?: WeatherSnapshot;
}

/** One pit-to-pit stint, derived from consecutive laps between pit events. */
export interface Stint {
  stintNumber: number;
  driverName: string;
  startLap: number;
  endLap: number;
  laps: LapRecord[];
  fuelAtStart: number;
  fuelAtEnd: number;
  fuelAddedAtPrevStop?: number;
  avgLapTimeMs: number;
  bestLapTimeMs: number;
  // Slope of lap time vs. lap-in-stint (ms/lap), see stint-pace-trend.ts.
  // NOT a tyre-degradation measurement — a lap-time trend can just as
  // easily reflect fuel burn-off, traffic, fatigue, or track evolution.
  paceTrendMsPerLap?: number;
}

/** Net track-position change across one pit-to-pit segment — a separate,
 *  smaller concept from `Stint` above, deliberately: `Stint`/deriveStints()
 *  requires Garage61 fuel data, so it's only ever available when that
 *  optional upload happened. Track position comes from the iRacing JSON
 *  alone, so this is computable for every Race Analysis upload regardless.
 *
 *  Exists to answer "did we actually gain ground this stint" despite the
 *  position chart's sawtooth — mid-stint position swings are mostly an
 *  artifact of pit-timing offsets against the rest of the field (we drop
 *  places the lap we pit and others haven't yet; we gain them back as the
 *  field cycles through). Comparing position at the two stint BOUNDARIES
 *  (right after our out-lap vs. right before our next in-lap) sidesteps
 *  that noise — both endpoints are "everyone mid-green-flag-running"
 *  snapshots, not caught in the middle of anyone's own pit cycle. */
export interface PositionStint {
  stintNumber: number;
  driverName: string;
  startLap: number;
  endLap: number;
  positionAtStart: number;
  positionAtEnd: number;
  // positionAtStart - positionAtEnd — positive means we gained places
  // (moved to a lower/better position number) over the stint.
  netPositionChange: number;
}

/** Pace/consistency summary for one driver across the whole race. */
export interface DriverPaceStats {
  driverName: string;
  custId?: number;
  lapsCompleted: number;
  bestLapTimeMs: number;
  averageLapTimeMs: number;
  medianLapTimeMs: number;
  stdDevMs: number;           // consistency measure
  top10PctAvgMs: number;      // avg of fastest 10% of laps
  incidentCount: number;
  stints: Stint[];
}

/** Team-level result, aggregating all drivers who shared the car. */
export interface TeamRaceResult {
  teamName: string;
  teamId?: number;
  carName: string;
  carClassName: string;
  finishPosition: number;
  finishPositionInClass: number;
  startingPosition: number;
  lapsCompleted: number;
  lapsLed: number;
  totalIncidents: number;
  reasonOut: string;
  drivers: DriverPaceStats[];
}

/** Field-relative pace for one car/class over race distance — the basis
 *  of gap-trend charts.
 *
 *  NOTE on units: iRacing reports the gap to the leader per lap directly
 *  (the `interval`/`interval_units` fields on each raw lap entry), which is
 *  what this is built from — no manual cumulative-time reconstruction.
 *  BUT confirmed against real data: once a car is lapped, iRacing switches
 *  from a time gap to a whole-laps-down count (`interval_units: "lap"`,
 *  e.g. `interval: -1`). A single ms number can't represent both, so
 *  exactly one of `gapToLeaderMs`/`lapsDownFromLeader` is set per point. */
export interface GapTrendPoint {
  lapNumber: number;
  gapToLeaderMs?: number;
  lapsDownFromLeader?: number;
  gapToClassLeaderMs?: number;
  trackPosition: number;
}

/** The field's own pace at one lap number — the median CLEAN lap time
 *  (excludes pit-affected and lap-event-flagged laps) across every car in
 *  the relevant class, smoothed over a small window of neighbouring laps.
 *  This is what "quicker/slower than the field" is measured against — it
 *  cancels out track evolution, weather, and time-of-day, which a fixed
 *  target lap time or gap-to-leader alone can't do (a 3am stint and a 3pm
 *  stint are only comparable once both are read against what the FIELD did
 *  at that same point in the race, not an absolute number). */
export interface FieldPacePoint {
  lapNumber: number;
  fieldMedianLapTimeMs: number;
  sampleSize: number; // cars contributing to this lap's raw (pre-smoothing) median
}

/** One of our laps, read against the field's pace at that same lap number
 *  (see FieldPacePoint). `deltaMs` is ourLapTimeMs - fieldMedianLapTimeMs —
 *  positive means we were slower than the field that lap. Undefined when
 *  the field didn't have enough clean samples at that lap number to trust
 *  a median (too early/late in a race with attrition, or a chaotic lap). */
export interface PaceVsFieldPoint {
  lapNumber: number;
  ourLapTimeMs: number;
  fieldMedianLapTimeMs?: number;
  // Undefined both when the field has no trustworthy median at this lap
  // number AND when the lap itself was pit-affected (see `pitAffected`) —
  // a pit in/out lap being tens of seconds slower isn't a pace signal, so
  // it's excluded from the comparison at the source rather than left for
  // every consumer to remember to filter out themselves.
  deltaMs?: number;
  pitAffected: boolean;
}

/** Fully processed output of the ingestion pipeline for one race —
 *  this is the single object the UI dashboard consumes. */
export interface RaceSummary {
  subsessionId: number;
  trackName?: string;
  raceLengthLaps: number;
  ourTeam: TeamRaceResult;
  fieldResults: TeamRaceResult[];   // all other classified teams
  // All of our team's laps across every driver who shared the car this
  // race, sorted by lap number — the shared source every our-team-specific
  // transform/chart (KPIs, track position, stint gantt) filters from, so
  // that filter only ever happens once instead of being re-derived in UI.
  ourTeamLaps: LapRecord[];
  gapTrend: GapTrendPoint[];
  // Our pace read against the field's own pace per lap, scoped to our car's
  // class (a fair comparison in multi-class races) — see PaceVsFieldPoint.
  paceVsField: PaceVsFieldPoint[];
  // Net position change per pit-to-pit segment — see PositionStint.
  positionStints: PositionStint[];
  weatherTimeline: Array<{ lapNumber: number; weather: WeatherSnapshot }>;
}

/** Headline, at-a-glance numbers for our team's race — the KPI strip at the
 *  top of the Race Analysis dashboard. `pitStopCount`/`totalFuelUsedLiters`
 *  are only computable when at least one of our team's laps carries
 *  Garage61 data (pitIn/fuelUsed) — undefined (not 0) when that upload
 *  wasn't provided, so the UI can distinguish "no data" from "zero". */
export interface RaceKpis {
  finishPosition: number;        // 1-indexed, overall
  fieldSize: number;
  finishPositionInClass: number; // 1-indexed
  classSize: number;
  lapsCompleted: number;
  lapsDownFromLeader: number;    // 0 if on the lead lap
  bestLapTimeMs: number;
  bestLapDriverName: string;
  totalIncidents: number;
  pitStopCount?: number;
  totalFuelUsedLiters?: number;
}
