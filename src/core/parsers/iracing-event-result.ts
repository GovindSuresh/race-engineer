import type {
  DriverRating,
  EventMeta,
  RawIracingEventDriverResult,
  RawIracingEventResultExport,
  RawIracingEventSimsession,
} from "../types/race-data";

/** Licence class names by block of four levels: 1-4 Rookie, 5-8 D, 9-12 C,
 *  13-16 B, 17-20 A, 21+ Pro. Confirmed against the export's own
 *  `allowed_licenses`, which labels level 8 "Class D". */
const LICENSE_CLASSES = ["R", "D", "C", "B", "A"] as const;

/** Decodes iRacing's integer licence level + sub-level into a readable licence,
 *  e.g. (20, 499) -> "A 4.99". Returns undefined for non-positive input, which
 *  is how the export represents "no licence recorded". */
export function decodeLicense(level: number, subLevel: number): string | undefined {
  if (level <= 0) return undefined;
  const classIndex = Math.floor((level - 1) / 4);
  const className = LICENSE_CLASSES[classIndex] ?? "Pro";
  const safetyRating = subLevel > 0 ? (subLevel / 100).toFixed(2) : undefined;
  return safetyRating ? `${className} ${safetyRating}` : className;
}

/** Content sniff to tell an event_result export from a lap-chart export. Both
 *  are `.json` with no filename convention, so the file's shape is the only
 *  reliable discriminator — callers routing dropped files must use this rather
 *  than the extension. */
export function isEventResultExport(parsed: unknown): parsed is RawIracingEventResultExport {
  if (typeof parsed !== "object" || parsed === null) return false;
  const candidate = parsed as Partial<RawIracingEventResultExport>;
  return candidate.type === "event_result" && typeof candidate.data === "object";
}

/** Picks the race simsession. An event_result also contains practice and
 *  qualifying results, and only the race's ratings/positions are what the
 *  dashboard is about. */
function findRaceSession(
  sessions: RawIracingEventSimsession[],
): RawIracingEventSimsession | undefined {
  return sessions.find((s) => s.simsession_type_name === "Race");
}

/** Positive-or-undefined: iRacing uses -1 throughout for "not recorded", and a
 *  -1 iRating silently poisons any average it reaches. */
function rating(value: number): number | undefined {
  return value > 0 ? value : undefined;
}

function toDriverRating(raw: RawIracingEventDriverResult): DriverRating {
  const before = rating(raw.oldi_rating);
  const after = rating(raw.newi_rating);
  return {
    custId: raw.cust_id,
    driverName: raw.display_name,
    teamId: raw.team_id,
    iRatingBefore: before,
    iRatingAfter: after,
    iRatingChange: before !== undefined && after !== undefined ? after - before : undefined,
    license: decodeLicense(raw.new_license_level, raw.new_sub_level),
    safetyRating: raw.new_sub_level > 0 ? raw.new_sub_level / 100 : undefined,
  };
}

/** Extracts every driver's rating context, keyed by cust_id — the join key
 *  onto lap records (`LapRecord.custId`), which is stable across driver swaps
 *  in a way names are not.
 *
 *  A driver who appears for more than one team in the file would collide here;
 *  last one wins. Not observed in real data (a cust_id is one entry per event)
 *  and not worth modelling until it is. */
export function parseEventResultDriverRatings(
  raw: RawIracingEventResultExport,
): Map<number, DriverRating> {
  const race = findRaceSession(raw.data.session_results);
  const ratings = new Map<number, DriverRating>();
  if (!race) return ratings;

  for (const team of race.results) {
    for (const driver of team.driver_results) {
      ratings.set(driver.cust_id, toDriverRating(driver));
    }
  }
  return ratings;
}

/** Extracts event-level context. `ourCarClassId` scopes the class-specific SoF
 *  to the class we care about in a multi-class race; omit it and those fields
 *  are left undefined rather than guessed from the first class present. */
export function parseEventResultMeta(
  raw: RawIracingEventResultExport,
  ourCarClassId?: number,
): EventMeta {
  const d = raw.data;

  const ourClass =
    ourCarClassId !== undefined
      ? d.car_classes.find((c) => c.car_class_id === ourCarClassId)
      : undefined;

  // Splits are ranked strongest-first so the rank reads as "2 of 8" = second
  // strongest. iRacing's array order isn't guaranteed, so sort rather than
  // trusting the index.
  const splits = [...(d.session_splits ?? [])].sort(
    (a, b) => b.event_strength_of_field - a.event_strength_of_field,
  );
  const splitIndex = splits.findIndex((s) => s.subsession_id === d.subsession_id);

  return {
    subsessionId: d.subsession_id,
    seriesName: d.series_name,
    seasonName: d.season_name,
    trackName: d.track.track_name,
    trackConfig: d.track.config_name,
    strengthOfField: d.event_strength_of_field,
    classStrengthOfField: ourClass?.strength_of_field,
    classEntries: ourClass?.num_entries,
    splitRank: splitIndex >= 0 ? splitIndex + 1 : undefined,
    splitCount: splits.length > 0 ? splits.length : undefined,
    numDrivers: d.num_drivers,
    numLeadChanges: d.num_lead_changes,
    lapsComplete: d.event_laps_complete,
    startTime: d.start_time,
  };
}

/** Car name for one team, from the event_result's race session. The lap-chart
 *  export has this too, so this is only needed when reading the event_result
 *  standalone. */
export function findTeamCarName(
  raw: RawIracingEventResultExport,
  teamId: number,
): string | undefined {
  const race = findRaceSession(raw.data.session_results);
  return race?.results.find((t) => t.team_id === teamId)?.car_name;
}
