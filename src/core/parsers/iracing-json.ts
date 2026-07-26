import type {
  LapRecord,
  RawIracingExport,
  RawIracingLapEntry,
} from "../types/race-data";

/** iRacing reports lap_time in ticks of 1/10000th of a second, not ms —
 *  confirmed against real data (see race-data.ts unit note). -1 (invalid
 *  lap) must be preserved as -1, not divided (Math.round(-1 / 10) is -0,
 *  which would silently look like a valid zero-length lap downstream). */
function ticksToMs(ticks: number): number {
  return ticks < 0 ? -1 : Math.round(ticks / 10);
}

function toLapRecord(lapEntry: RawIracingLapEntry): LapRecord {
  // iRacing's own per-lap gap to the leader. The leader's own interval is
  // null (not applicable) rather than 0 — 0 is the correct value for them,
  // not "unknown", so that's handled explicitly rather than left undefined.
  // Once a car is lapped, iRacing switches interval_units from "ms" to
  // "lap" (confirmed against real data) — see the unit note on LapRecord.
  let gapToLeaderMs: number | undefined;
  let lapsDownFromLeader: number | undefined;
  if (lapEntry.lap_position === 1) {
    gapToLeaderMs = 0;
  } else if (lapEntry.interval_units === "ms" && lapEntry.interval !== null) {
    gapToLeaderMs = lapEntry.interval;
  } else if (lapEntry.interval_units === "lap" && lapEntry.interval !== null) {
    lapsDownFromLeader = lapEntry.interval;
  }

  return {
    lapNumber: lapEntry.lap_number,
    driverName: lapEntry.display_name,
    custId: lapEntry.cust_id,
    teamId: lapEntry.group_id,
    teamName: lapEntry.name,
    lapTimeMs: ticksToMs(lapEntry.lap_time),
    trackPositionAtLap: lapEntry.lap_position,
    incident: lapEntry.incident,
    // "pitted" is one of the possible lap_events strings — confirmed
    // against real data. Available for every car, not just ours.
    pitAffected: lapEntry.lap_events.includes("pitted"),
    gapToLeaderMs,
    lapsDownFromLeader,
  };
}

/** Reconstructs the full lap-by-lap time series for every driver in the
 *  race from the raw iRacing export.
 *
 *  The raw shape is deceptive: `lapData[i]` is indexed by FINAL FINISHING
 *  POSITION, and each `lap_N` key on that entry is a snapshot of whoever
 *  held TRACK POSITION `(i + 1)` at lap N — not entry `i`'s own team/driver.
 *  Each `lap_N` object embeds its own `cust_id`/`display_name`/`name`
 *  though, so reconstruction is just: flatten every `lap_N` object across
 *  every entry (ignoring what `i` it came from) and the caller can group by
 *  `custId`. This function does NOT read `finishing_position` — that's a
 *  fixed per-team result keyed correctly by array index, and is a separate
 *  concern from this lap-by-lap reconstruction. */
export function parseIracingJson(raw: RawIracingExport): LapRecord[] {
  const records: LapRecord[] = [];

  for (const entry of raw.lapData) {
    for (const [key, value] of Object.entries(entry)) {
      if (!key.startsWith("lap_")) continue;
      records.push(toLapRecord(value as RawIracingLapEntry));
    }
  }

  records.sort((a, b) => {
    if (a.custId !== b.custId) return (a.custId ?? 0) - (b.custId ?? 0);
    return a.lapNumber - b.lapNumber;
  });

  return records;
}
