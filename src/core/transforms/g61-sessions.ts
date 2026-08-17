import type { RawGarage61Lap, RawGarage61Row } from "../types/race-data";
import { garage61ApiLapToRow, sortGarage61ApiLaps } from "../parsers/garage61-api";

/** One practice session's worth of laps — the API-side equivalent of a single
 *  Garage61 CSV export, and therefore of one Stint Analysis run slot.
 *
 *  Getting this unit right is load-bearing rather than cosmetic. A slot that
 *  accidentally spanned two sessions would run them together into one lap
 *  sequence, which moves stint boundaries (`deriveStints` splits on pit flags,
 *  not on time), makes `dropFinalLap` target the wrong lap, and turns the
 *  pace trend into a comparison between two different days' track conditions. */
export interface Garage61Session {
  /** Stable identity for React keys and slot assignment. */
  key: string;
  event: string | null;
  session: number | null;
  /** ISO timestamps of the first and last lap, for labelling the picker. */
  startedAt: string;
  endedAt: string;
  /** Display names in first-appearance order — a session can be shared, and
   *  the planner already handles multi-driver runs. */
  drivers: string[];
  carName: string | null;
  trackName: string | null;
  /** 1 Practice / 2 Qualifying / 3 Race, straight from the API; null when the
   *  field was absent. */
  sessionType: number | null;
  lapCount: number;
  /** Fastest timed lap in the session, or 0 if it has none. Milliseconds, to
   *  match `LapRecord.lapTimeMs` — the UI formats it with `formatLapTime`. */
  bestLapTimeMs: number;
  /** The session's laps, in order, ready to hand straight to
   *  `garage61OnlyToLapRecords`. */
  rows: RawGarage61Row[];
}

/** How long a silence has to be before laps either side of it are treated as
 *  separate sessions, when the API gave us no session identity to group on.
 *  An hour comfortably clears a long stint plus a break, while still splitting
 *  two practice outings on the same evening. */
const SESSION_GAP_MS = 60 * 60 * 1000;

function lapStartMs(lap: RawGarage61Lap): number | null {
  const parsed = Date.parse(lap.startTime ?? "");
  return Number.isFinite(parsed) ? parsed : null;
}

/** Groups a flat `/laps` response back into sessions.
 *
 *  Primary key is Garage61's own `event` + `session`. Both can be absent —
 *  the API is a Go service whose `omitempty` drops empty strings and zeroes —
 *  and grouping everything unidentified together would produce exactly the
 *  merged-runs failure described on `Garage61Session`. So laps with no session
 *  identity fall back to splitting on a gap of `SESSION_GAP_MS` between
 *  consecutive laps, which recovers the same boundary for the common case of
 *  separate outings.
 *
 *  Returns newest first: the session you just drove is the one you want. */
export function groupG61ApiLapsIntoSessions(laps: RawGarage61Lap[]): Garage61Session[] {
  const ordered = sortGarage61ApiLaps(laps);
  const groups = new Map<string, RawGarage61Lap[]>();

  let gapGroupIndex = 0;
  let previousStartMs: number | null = null;

  for (const lap of ordered) {
    const hasEvent = typeof lap.event === "string" && lap.event.length > 0;
    const hasSession = typeof lap.session === "number";

    let key: string;
    if (hasEvent || hasSession) {
      key = `id:${lap.event ?? ""}:${lap.session ?? ""}`;
      // Start a fresh gap group as well, so unidentified laps either side of
      // an identified session can't be bridged into one group by sharing its
      // index. (Bumping the counter for every identified lap just leaves holes
      // in the numbering, which costs nothing — the keys only need to differ.)
      gapGroupIndex++;
      previousStartMs = null;
    } else {
      const startMs = lapStartMs(lap);
      if (
        previousStartMs !== null &&
        startMs !== null &&
        startMs - previousStartMs > SESSION_GAP_MS
      ) {
        gapGroupIndex++;
      }
      previousStartMs = startMs ?? previousStartMs;
      key = `gap:${gapGroupIndex}`;
    }

    const existing = groups.get(key);
    if (existing) existing.push(lap);
    else groups.set(key, [lap]);
  }

  const sessions = [...groups.entries()].map(([key, groupLaps]) =>
    buildSession(key, groupLaps),
  );

  // Newest first. Sessions with no parseable timestamp sort last rather than
  // to the epoch, where they'd claim to be the oldest data you have.
  return sessions.sort((a, b) => {
    const timeA = Date.parse(a.startedAt);
    const timeB = Date.parse(b.startedAt);
    const validA = Number.isFinite(timeA);
    const validB = Number.isFinite(timeB);
    if (validA && validB) return timeB - timeA;
    if (validA !== validB) return validA ? -1 : 1;
    return 0;
  });
}

function buildSession(key: string, laps: RawGarage61Lap[]): Garage61Session {
  const rows = laps.map(garage61ApiLapToRow);

  const drivers: string[] = [];
  for (const row of rows) {
    if (!drivers.includes(row.driver)) drivers.push(row.driver);
  }

  const timedLapsMs = rows
    .filter((row) => row.lapTimeSeconds > 0)
    .map((row) => Math.round(row.lapTimeSeconds * 1000));

  const first = laps[0];
  const last = laps[laps.length - 1];

  // Car and track come from whichever lap first reports them: they're constant
  // within a session, but `omitempty` can leave an individual lap without one.
  const carName = laps.find((lap) => lap.car?.name)?.car?.name ?? null;
  const trackEntry = laps.find((lap) => lap.track?.name)?.track;
  const trackName = trackEntry
    ? [trackEntry.name, trackEntry.variant].filter(Boolean).join(" — ")
    : null;

  return {
    key,
    event: typeof first.event === "string" && first.event.length > 0 ? first.event : null,
    session: typeof first.session === "number" ? first.session : null,
    startedAt: first.startTime ?? "",
    endedAt: last.startTime ?? "",
    drivers,
    carName,
    trackName,
    sessionType:
      laps.find((lap) => typeof lap.sessionType === "number")?.sessionType ?? null,
    lapCount: rows.length,
    bestLapTimeMs: timedLapsMs.length > 0 ? Math.min(...timedLapsMs) : 0,
    rows,
  };
}

const SESSION_TYPE_LABELS: Record<number, string> = {
  1: "Practice",
  2: "Qualifying",
  3: "Race",
};

/** Human label for `Garage61Session.sessionType`. Lives here rather than in a
 *  component because the mapping is the API's, not a presentation choice. */
export function garage61SessionTypeLabel(sessionType: number | null): string {
  return sessionType === null ? "Session" : (SESSION_TYPE_LABELS[sessionType] ?? "Session");
}
