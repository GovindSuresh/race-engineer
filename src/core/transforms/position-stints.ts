import type { LapRecord, PositionStint } from "../types/race-data";

/** Segments our own laps into pit-to-pit chunks and reports the net track
 *  position change across each — see the doc comment on PositionStint for
 *  why this is a separate, always-available concept from the fuel-based
 *  `Stint`/deriveStints().
 *
 *  Boundary detection: a pit stop typically flags exactly two adjacent
 *  laps pit-affected (the in-lap ending one stint, the out-lap starting
 *  the next — confirmed against real data), but this doesn't assume a
 *  fixed run length. For a maximal run of consecutive pit-affected lap
 *  numbers, the run's FIRST lap closes out the segment before it (it's the
 *  in-lap, still part of that stint) and the run's LAST lap opens the next
 *  segment (the out-lap) — both boundary laps are shared between the
 *  segment ending there and the one starting there, same as how a
 *  fuel-based Stint's pit-in lap is the final lap of that stint. */
export function computePositionStints(ourTeamLaps: LapRecord[]): PositionStint[] {
  const laps = [...ourTeamLaps]
    .filter((l) => l.trackPositionAtLap !== undefined)
    .sort((a, b) => a.lapNumber - b.lapNumber);
  if (laps.length === 0) return [];

  const pitRuns: Array<{ start: number; end: number }> = [];
  for (const lap of laps) {
    const isPitAffected = lap.pitAffected === true || lap.pitIn === true || lap.pitOut === true;
    if (!isPitAffected) continue;
    const currentRun = pitRuns[pitRuns.length - 1];
    if (currentRun && lap.lapNumber === currentRun.end + 1) {
      currentRun.end = lap.lapNumber;
    } else {
      pitRuns.push({ start: lap.lapNumber, end: lap.lapNumber });
    }
  }

  const lapByNumber = new Map(laps.map((l) => [l.lapNumber, l]));
  const boundaries = [
    laps[0].lapNumber,
    ...pitRuns.flatMap((r) => [r.start, r.end]),
    laps[laps.length - 1].lapNumber,
  ];

  const positionStints: PositionStint[] = [];
  for (let i = 0; i + 1 < boundaries.length; i += 2) {
    const startRecord = lapByNumber.get(boundaries[i]);
    const endRecord = lapByNumber.get(boundaries[i + 1]);
    if (!startRecord || !endRecord) continue;

    const positionAtStart = startRecord.trackPositionAtLap!;
    const positionAtEnd = endRecord.trackPositionAtLap!;
    positionStints.push({
      stintNumber: positionStints.length + 1,
      driverName: startRecord.driverName,
      startLap: startRecord.lapNumber,
      endLap: endRecord.lapNumber,
      positionAtStart,
      positionAtEnd,
      netPositionChange: positionAtStart - positionAtEnd,
    });
  }

  return positionStints;
}
