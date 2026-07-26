import type { RaceKpis, RaceSummary } from "../types/race-data";

/** Headline numbers for the Race Analysis KPI strip. Pure derivation from
 *  an already-built RaceSummary — no re-parsing or re-filtering of raw
 *  laps here, everything reads from `ourTeam`/`fieldResults`/`ourTeamLaps`.
 *
 *  Pit stop count and fuel burned are only meaningful for our own car (the
 *  iRacing export alone has no pit/fuel signal for the rest of the field),
 *  and only when the optional Garage61 upload was merged in — left
 *  `undefined` rather than 0 when no lap carries that data, so the UI can
 *  render "n/a" instead of a misleading zero. */
export function computeRaceKpis(raceSummary: RaceSummary): RaceKpis {
  const { ourTeam, fieldResults, ourTeamLaps } = raceSummary;
  const allTeams = [ourTeam, ...fieldResults];

  const classSize = fieldResults.filter(
    (t) => t.carClassName === ourTeam.carClassName,
  ).length + 1;

  const maxLapsCompleted = allTeams.reduce(
    (max, t) => Math.max(max, t.lapsCompleted),
    0,
  );

  const bestLaps = ourTeam.drivers
    .filter((d) => d.bestLapTimeMs > 0)
    .sort((a, b) => a.bestLapTimeMs - b.bestLapTimeMs);
  const best = bestLaps[0];

  const lapsWithFuelData = ourTeamLaps.filter((l) => l.fuelUsed !== undefined);
  const lapsWithPitData = ourTeamLaps.filter((l) => l.pitIn !== undefined);

  return {
    finishPosition: ourTeam.finishPosition + 1,
    fieldSize: allTeams.length,
    finishPositionInClass: ourTeam.finishPositionInClass + 1,
    classSize,
    lapsCompleted: ourTeam.lapsCompleted,
    lapsDownFromLeader: maxLapsCompleted - ourTeam.lapsCompleted,
    bestLapTimeMs: best?.bestLapTimeMs ?? 0,
    bestLapDriverName: best?.driverName ?? "",
    totalIncidents: ourTeam.totalIncidents,
    pitStopCount:
      lapsWithPitData.length > 0
        ? lapsWithPitData.filter((l) => l.pitIn).length
        : undefined,
    totalFuelUsedLiters:
      lapsWithFuelData.length > 0
        ? lapsWithFuelData.reduce((sum, l) => sum + (l.fuelUsed ?? 0), 0)
        : undefined,
  };
}
