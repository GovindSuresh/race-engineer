import type {
  GapTrendPoint,
  LapRecord,
  RaceSummary,
  RawIracingExport,
  RawIracingFinishingPosition,
  TeamRaceResult,
} from "../types/race-data";
import { computeDriverPaceStats } from "./pace";
import { computeFieldPace, computeOurPaceVsField } from "./field-pace";
import { computePositionStints } from "./position-stints";

/** Enough info to let a user pick "which team is mine" before RaceSummary
 *  can be built — exists so the UI never has to import a Raw* type just to
 *  populate a team picker. */
export interface TeamOption {
  teamId: number;
  teamName: string;
  carClassName: string;
}

export function listTeams(raw: RawIracingExport): TeamOption[] {
  return raw.lapData.map((entry) => ({
    teamId: entry.finishing_position.team_id,
    teamName: entry.finishing_position.display_name,
    carClassName: entry.finishing_position.car_class_name,
  }));
}

function buildTeamRaceResult(
  finishingPosition: RawIracingFinishingPosition,
  lapsByCustId: Map<number, LapRecord[]>,
): TeamRaceResult {
  return {
    teamName: finishingPosition.display_name,
    teamId: finishingPosition.team_id,
    carName: finishingPosition.car_name,
    carClassName: finishingPosition.car_class_name,
    finishPosition: finishingPosition.finish_position,
    finishPositionInClass: finishingPosition.finish_position_in_class,
    startingPosition: finishingPosition.starting_position,
    lapsCompleted: finishingPosition.laps_complete,
    lapsLed: finishingPosition.laps_lead,
    totalIncidents: finishingPosition.incidents,
    reasonOut: finishingPosition.reason_out,
    drivers: finishingPosition.driver_results.map((driverResult) =>
      computeDriverPaceStats(lapsByCustId.get(driverResult.cust_id) ?? []),
    ),
  };
}

/** Our team's gap-to-leader over the race, for the gap-trend chart. Built
 *  directly from iRacing's own per-lap `interval` (via LapRecord's
 *  gapToLeaderMs/lapsDownFromLeader — see the unit note on GapTrendPoint),
 *  not a manual cumulative-time reconstruction. Follows the CAR (by
 *  teamId, stable across driver swaps — confirmed against real data),
 *  not a single driver. */
function buildGapTrend(ourTeamLaps: LapRecord[]): GapTrendPoint[] {
  return [...ourTeamLaps]
    .sort((a, b) => a.lapNumber - b.lapNumber)
    .map((lap) => ({
      lapNumber: lap.lapNumber,
      gapToLeaderMs: lap.gapToLeaderMs,
      lapsDownFromLeader: lap.lapsDownFromLeader,
      trackPosition: lap.trackPositionAtLap ?? 0,
    }));
}

/** Assembles the full RaceSummary from the raw iRacing export plus the
 *  already-parsed (and optionally Garage61-merged) full-field LapRecords.
 *
 *  `ourTeamId` must be supplied by the caller (the UI, via a team picker) —
 *  there's no reliable way to auto-detect "our team" from the data alone,
 *  since the optional Garage61 upload isn't always present. */
export function buildRaceSummary(
  raw: RawIracingExport,
  allLaps: LapRecord[],
  ourTeamId: number,
): RaceSummary {
  const lapsByCustId = new Map<number, LapRecord[]>();
  for (const lap of allLaps) {
    if (lap.custId === undefined) continue;
    if (!lapsByCustId.has(lap.custId)) lapsByCustId.set(lap.custId, []);
    lapsByCustId.get(lap.custId)!.push(lap);
  }

  const ourEntry = raw.lapData.find((e) => e.finishing_position.team_id === ourTeamId);
  if (!ourEntry) {
    throw new Error(`No team with team_id ${ourTeamId} found in this race.`);
  }

  const ourTeam = buildTeamRaceResult(ourEntry.finishing_position, lapsByCustId);
  const fieldResults = raw.lapData
    .filter((e) => e.finishing_position.team_id !== ourTeamId)
    .map((e) => buildTeamRaceResult(e.finishing_position, lapsByCustId));

  const ourTeamLaps = allLaps
    .filter((l) => l.teamId === ourTeamId)
    .sort((a, b) => a.lapNumber - b.lapNumber);

  const weatherTimeline = allLaps
    .filter((l): l is LapRecord & { weather: NonNullable<LapRecord["weather"]> } =>
      l.weather !== undefined,
    )
    .sort((a, b) => a.lapNumber - b.lapNumber)
    .map((l) => ({ lapNumber: l.lapNumber, weather: l.weather }));

  const raceLengthLaps = allLaps.reduce((max, l) => Math.max(max, l.lapNumber), 0);

  const fieldPace = computeFieldPace(raw, {
    carClassId: ourEntry.finishing_position.car_class_id,
  });

  return {
    subsessionId: raw.subsession_id,
    raceLengthLaps,
    ourTeam,
    fieldResults,
    ourTeamLaps,
    gapTrend: buildGapTrend(ourTeamLaps),
    paceVsField: computeOurPaceVsField(ourTeamLaps, fieldPace),
    positionStints: computePositionStints(ourTeamLaps),
    weatherTimeline,
  };
}
