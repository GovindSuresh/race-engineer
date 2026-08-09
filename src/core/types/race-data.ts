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
// 1a-ii. SOURCE TYPES — raw iRacing "event_result" export
//
// A THIRD, separate iRacing file: a session summary with NO lap data. It's the
// only source of per-driver iRating/licence and of iRacing's own published
// Strength of Field, plus track and car names.
//
// Both this and the lap-chart export above are `.json`, and neither carries a
// filename convention, so callers must tell them apart by CONTENT — this one
// has a top-level `type: "event_result"`, the lap chart has `lapData`. See
// `isEventResultExport()` in the parser.
// ----------------------------------------------------------------------------

/** Per-driver entry, nested under each team's `driver_results`.
 *
 *  IMPORTANT: in a team event the rating fields are only meaningful HERE, at
 *  driver level. Confirmed against real data: every TEAM-level entry reports
 *  `newi_rating: -1` / `new_license_level: -1`, because a team doesn't have a
 *  rating — its drivers do. Drivers who registered but recorded nothing also
 *  come through as -1 (18 of 228 in the Spa sample), so every consumer must
 *  treat non-positive values as "unknown", never as a real rating. */
export interface RawIracingEventDriverResult {
  team_id: number;
  cust_id: number;
  display_name: string;
  laps_complete: number;
  incidents: number;
  // iRating before/after this race; the delta earned is (new - old).
  oldi_rating: number;
  newi_rating: number;
  // Licence class, int-encoded in blocks of four: 1-4 Rookie, 5-8 D, 9-12 C,
  // 13-16 B, 17-20 A, 21+ Pro. Confirmed against this export's own
  // `allowed_licenses`, which labels level 8 "Class D".
  old_license_level: number;
  new_license_level: number;
  // Safety Rating within the class, ×100 (499 = "4.99").
  old_sub_level: number;
  new_sub_level: number;
}

/** One classified team in a simsession's `results`. Rating fields exist on this
 *  shape in the raw file but are always -1 for team events — see the note on
 *  RawIracingEventDriverResult. */
export interface RawIracingEventTeamResult {
  team_id: number;
  display_name: string;
  car_id: number;
  car_name: string;
  car_class_id: number;
  car_class_name: string;
  finish_position: number;
  finish_position_in_class: number;
  laps_complete: number;
  incidents: number;
  reason_out: string;
  driver_results: RawIracingEventDriverResult[];
}

/** One simsession within the event — practice, qualifying, or the race. */
export interface RawIracingEventSimsession {
  simsession_number: number;
  simsession_type_name: string; // e.g. "Race", "Lone Qualifying", "Open Practice"
  results: RawIracingEventTeamResult[];
}

export interface RawIracingEventCarClass {
  car_class_id: number;
  name: string;
  short_name: string;
  strength_of_field: number;
  num_entries: number;
}

/** One split of the same event. iRacing divides a large entry list into splits
 *  by rating, so a split's rank among these is real context: the same lap time
 *  means more in split 1 of 8 than in split 8. */
export interface RawIracingEventSplit {
  subsession_id: number;
  event_strength_of_field: number;
}

export interface RawIracingEventTrack {
  track_id: number;
  track_name: string;
  config_name: string;
}

export interface RawIracingEventResultData {
  subsession_id: number;
  series_name: string;
  season_name: string;
  event_strength_of_field: number;
  event_laps_complete: number;
  num_drivers: number;
  num_lead_changes: number;
  num_cautions: number;
  start_time: string;
  end_time: string;
  track: RawIracingEventTrack;
  car_classes: RawIracingEventCarClass[];
  session_splits: RawIracingEventSplit[];
  session_results: RawIracingEventSimsession[];
}

export interface RawIracingEventResultExport {
  type: string; // "event_result"
  data: RawIracingEventResultData;
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
// 1c. SOURCE TYPES — raw Garage61 REST API (GET /api/v1/laps)
// ----------------------------------------------------------------------------
//
// The API is the Stint Planner's second Garage61 input, alongside the CSV
// export above. Its lap object is a strict SUPERSET of the CSV's columns, so
// `garage61ApiLapToRow` narrows it back to `RawGarage61Row` and everything
// downstream (garage61OnlyToLapRecords → deriveStints → the UI) is shared.
//
// EVERY field is optional here, deliberately, even though the published docs
// list most of them as always present. Garage61's API is a Go service (its
// 404s are net/http's plain-text "404 page not found"), and Go's standard
// `json:",omitempty"` drops zero numbers, empty strings and `false` booleans
// from the payload entirely. So an absent `fuelAdded` almost certainly means
// 0 litres, and an absent `pitIn` means false — the parser applies those
// defaults rather than treating absence as an error. Confirm against a live
// response once a token is available; see the plan's sequencing note.

/** One entry of the `sectors` array. Documented only as `array<object>`, so
 *  this covers the plausible shapes and the parser tolerates all of them.
 *  Nothing reads `LapRecord.sectorTimes` today, so a wrong guess here is
 *  inert — it costs a follow-up commit, not a broken feature. */
export interface RawGarage61ApiSector {
  number?: number;
  sector?: number;
  time?: number;
  lapTime?: number;
  duration?: number;
}

export interface RawGarage61ApiDriver {
  slug?: string;
  firstName?: string;
  lastName?: string;
  nickName?: string;
}

export interface RawGarage61ApiCar {
  id?: number;
  name?: string;
  platform?: string;
}

export interface RawGarage61ApiTrack {
  id?: number;
  name?: string;
  variant?: string;
  platform?: string;
}

export interface RawGarage61ApiSeason {
  id?: number;
  name?: string;
  shortName?: string;
}

export interface RawGarage61Lap {
  id?: string;
  lapTime?: number;          // SECONDS (float), like the CSV — not ms, not ticks
  lapNumber?: number;
  startTime?: string;        // ISO timestamp
  run?: number;
  // Identity of the session this lap belongs to. Together these are what
  // groups laps back into "one practice session" — the unit a single CSV
  // export represents, and therefore one Stint Planner run slot.
  event?: string;
  session?: number;
  eventType?: number;        // 0 Unknown, 1 Race, 2 Practice, 3 Offline test,
                             // 4 Time Trial, 5 Time Attack, 6 Qualifying
  sessionType?: number;      // 1 Practice, 2 Qualifying, 3 Race
  clean?: boolean;
  incomplete?: boolean;
  missing?: boolean;
  discontinuity?: boolean;
  offtrack?: boolean;
  pitIn?: boolean;
  pitOut?: boolean;
  pitlane?: boolean;
  joker?: boolean;
  canViewSetup?: boolean;
  canViewTelemetry?: boolean;
  ghostAvailable?: boolean;
  driverRating?: number;
  tireCompound?: number;
  powerAdjust?: number;
  weightPenalty?: number;
  fuelAdded?: number;
  fuelUsed?: number;
  fuelLevel?: number;
  sectors?: RawGarage61ApiSector[];
  // Conditions. Same quantities as the CSV's weather columns, different names.
  precipitation?: number;
  fogLevel?: number;
  relativeHumidity?: number;
  windDir?: number;
  windVel?: number;
  airPressure?: number;
  airDensity?: number;
  airTemp?: number;
  clouds?: number;           // 1 Clear, 2 Partly, 3 Mostly cloudy, 4 Overcast
  trackWetness?: number;     // percent, 0 dry .. 100 fully wet
  trackUsage?: number;       // percent, 0 clean .. 100 fully rubbered in
  trackTemp?: number;
  driver?: RawGarage61ApiDriver | null;
  car?: RawGarage61ApiCar;
  track?: RawGarage61ApiTrack;
  season?: RawGarage61ApiSeason | null;
}

/** Envelope every list endpoint returns (`/laps`, `/tracks`, `/cars`, …). */
export interface RawGarage61ApiList<T> {
  items?: T[];
  total?: number;
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
  // Litres in the tank at the START of this lap, and — on a pit-out lap —
  // BEFORE that stop's refuel is applied. Confirmed against all 583
  // consecutive lap pairs in /ref_data: fuelLevel[n] - fuelUsed[n] +
  // fuelAdded[n] === fuelLevel[n+1]. Do not read it as end-of-lap.
  fuelLevel?: number;
  // Litres put in during this lap, straight from the Garage61 "Fuel added"
  // column — 0 on every non-pit lap. This is an exact figure; it must never
  // be re-derived from the difference between two fuelLevel readings, which
  // cannot see the fill at all (see the note above: on the pit-out lap the
  // reading predates the fill, so the delta only recovers one lap's burn).
  fuelAdded?: number;
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
  // Litres on board leaving the box (start of the first lap, refuel
  // included) and crossing the line for the last time (end of the final lap).
  fuelAtStart: number;
  fuelAtEnd: number;
  // Litres added at the stop that STARTED this stint — summed from the exact
  // Garage61 "Fuel added" column over this stint's laps, which in practice
  // means the pit-out lap. `undefined` only when no lap carried the column
  // (a non-Garage61 source), never 0-as-unknown: 0 means a genuine no-fuel
  // stop, e.g. a tyres-only or repairs-only service.
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

  // ---- From the optional event_result upload -------------------------------
  // All undefined together when that file wasn't provided, so the dashboard
  // degrades to the two-file flow rather than rendering zeros. Check
  // `eventMeta` to know whether any of this is available.
  eventMeta?: EventMeta;
  /** Rating context per driver, keyed by cust_id. */
  driverRatings?: Map<number, DriverRating>;
  fieldStrength?: FieldStrengthPoint[];
  ratingVsPace?: RatingVsPacePoint[];
  /** Least-squares fit through ratingVsPace — the line a driver is read
   *  against to judge over/under-performance. Undefined when there are too
   *  few drivers to fit one. */
  ratingPaceTrend?: { msPerIRatingPoint: number; interceptMs: number };
}

/** Rating context for one driver, from the optional event_result upload.
 *  Absent fields mean iRacing reported no rating for them (a registered driver
 *  who recorded nothing) — never treat a missing rating as zero. */
export interface DriverRating {
  custId: number;
  driverName: string;
  teamId: number;
  /** iRating entering the race — the right number for "was their pace good for
   *  their rating", since the post-race value already reflects this result. */
  iRatingBefore?: number;
  iRatingAfter?: number;
  /** after - before. Positive means they gained rating this race. */
  iRatingChange?: number;
  /** Decoded licence, e.g. "A 4.99". */
  license?: string;
  safetyRating?: number;
}

/** Event-level context from the event_result upload — the "what was this race"
 *  header data, none of which the lap-chart export carries.
 *
 *  `strengthOfField` values are iRacing's OWN published numbers, passed through
 *  untouched. Deliberately not recomputed: iRacing appears to calculate SoF at
 *  registration (our best reconstruction from the final results lands ~2810 vs
 *  their published 2727 for the Spa sample, most likely because entries absent
 *  from the results are still counted). Anything we derive ourselves is named
 *  separately — see FieldStrengthPoint. */
export interface EventMeta {
  subsessionId: number;
  seriesName: string;
  seasonName: string;
  trackName: string;
  /** e.g. "Endurance". Empty when the track has a single layout. */
  trackConfig: string;
  /** iRacing's published SoF for this split. */
  strengthOfField: number;
  /** SoF for our own car class, when the event is multi-class. */
  classStrengthOfField?: number;
  classEntries?: number;
  /** 1-based rank of this split among all splits of the event, strongest
   *  first, with the total — "split 2 of 8". */
  splitRank?: number;
  splitCount?: number;
  numDrivers: number;
  numLeadChanges: number;
  lapsComplete: number;
  startTime: string;
}

/** Average iRating of the drivers actually circulating at one lap number.
 *
 *  Deliberately NOT called Strength of Field: it is our own metric, a plain
 *  mean, and does not reproduce iRacing's published SoF (see EventMeta).
 *
 *  Why it's worth having: over a 24h race the field you're being measured
 *  against genuinely changes — cars retire, and in a team event the driver in
 *  each car swaps. Because the population here is "drivers who recorded lap N",
 *  it is the SAME population the field-median lap time (and therefore our delta
 *  to it) is computed from, so it describes the comparison set rather than
 *  being an unrelated stat bolted alongside.
 *
 *  Caveat, surfaced in the UI: at high lap numbers only cars on the leaders'
 *  lap count have recorded that lap, so late values over-represent the faster
 *  cars. `sampleSize` is carried so thin points can be dropped or flagged. */
export interface FieldStrengthPoint {
  lapNumber: number;
  averageIRating: number;
  /** Drivers on track at this lap who had a known rating. */
  sampleSize: number;
  /** Drivers on track at this lap in total, rated or not. */
  driversOnTrack: number;
}

/** One driver placed against the field on both axes: how highly rated they
 *  were, and how their pace actually came out. The basis of the
 *  iRating-vs-pace scatter, which answers "who punched above their rating".
 *
 *  `medianDeltaMs` is that driver's median lap-time delta to the field median
 *  at the same lap numbers, so it already cancels out track evolution and time
 *  of day — negative means quicker than the field. */
export interface RatingVsPacePoint {
  custId: number;
  driverName: string;
  teamId: number;
  teamName: string;
  iRating: number;
  medianDeltaMs: number;
  lapsCounted: number;
  /** True for drivers in the team the dashboard is currently focused on, so
   *  the UI can highlight them against the rest of the field. */
  isOurTeam: boolean;
}

/** One point on a smoothed pace trend line — a rolling median of a car's own
 *  lap times, drawn over the per-lap scatter on the race timeline so the
 *  underlying pace is readable through lap-to-lap noise. See
 *  computeSmoothedPace() for why it's a median rather than a mean. */
export interface SmoothedPacePoint {
  lapNumber: number;
  smoothedLapTimeMs: number;
}

/** Track/weather conditions observed across a set of laps — built from
 *  Garage61's per-lap weather columns (the only source of conditions data;
 *  the iRacing JSON export carries none). `undefined` from
 *  computeConditionsSummary() when none of the supplied laps carry
 *  Garage61 weather data.
 *
 *  Garage61 exports have no track-name or car-name column at all, only
 *  this per-lap telemetry — conditions is the only "session context" data
 *  actually available to derive, not a stand-in for track/car metadata. */
export interface ConditionsSummary {
  trackTempMinC: number;
  trackTempMaxC: number;
  airTempMinC: number;
  airTempMaxC: number;
  // Highest Garage61 "Track Wetness" reading observed (0 = bone dry) — a
  // max rather than an average since a session that goes from dry to wet
  // partway through should surface as "got wet," not be diluted to "damp."
  maxTrackWetnessPct: number;
  avgWindVelocityMs: number;
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
