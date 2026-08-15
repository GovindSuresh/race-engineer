import type { LapRecord } from "../types/race-data";

/** The rule-based lap filters the Stint Planner offers, as opposed to laps the
 *  user picks out individually by hand. Every one of them answers "which laps
 *  should count towards pace", never "which laps happened" — see
 *  `applyLapFilters` for why that distinction matters. */
export interface LapFilters {
  /** Keep only laps Garage61 flagged clean (no incident, no off-track). */
  cleanLapsOnly: boolean;
  /** Drop in- and out-laps. Deliberately separate from the clean filter:
   *  Garage61's "Clean" flag is its own heuristic and doesn't reliably mark
   *  pit laps. */
  excludePitLaps: boolean;
  /** Drop the run's very last lap. A practice run normally ends by quitting
   *  out during the final stop, which leaves a part-lap Garage61 still reports
   *  as a lap (52-60s against ~124s green on the sample exports) — it skews
   *  averages and wins "best lap" outright. It also arrives with pitIn and
   *  pitOut both false, because G61 only flags a COMPLETED out-lap, so
   *  `excludePitLaps` cannot catch it. */
  dropFinalLap: boolean;
  /** Drop the run's opening lap.
   *
   *  Lap 0 is never a representative lap: in practice and qualifying it's the
   *  out-lap from the garage, and in a race it's the procession (formation)
   *  lap before the start. Either way it's driven at a pace that has nothing
   *  to do with the car's, and it lands in the averages like any other lap.
   *
   *  `excludePitLaps` doesn't reliably catch it — Garage61 only flags a
   *  COMPLETED out-lap, and a formation lap isn't a pit lap at all — which is
   *  why this is its own rule rather than a widening of that one. */
  dropOpeningLap: boolean;
}

export type LapFilterKey = keyof LapFilters;

/** What a rule needs to know about the run a lap sits in, beyond the lap
 *  itself. An object rather than positional arguments so adding the next
 *  run-scoped rule doesn't change every call site again. */
export interface LapRuleContext {
  /** The run's last lap number, or null when dropping it would leave nothing. */
  runFinalLap: number | null;
  /** The run's first lap number, or null on the same condition. */
  runOpeningLap: number | null;
}

/** Every rule as a predicate: does this lap match the rule, ignoring whether
 *  the rule is currently switched on. Defined once here so the filtering path
 *  and the "would drop N laps" counts can never drift apart — they were
 *  previously two separate inline expressions in the page component. */
const RULES: Record<LapFilterKey, (lap: LapRecord, context: LapRuleContext) => boolean> = {
  cleanLapsOnly: (lap) => lap.isClean !== true,
  excludePitLaps: (lap) => lap.pitIn === true || lap.pitOut === true,
  dropFinalLap: (lap, { runFinalLap }) =>
    runFinalLap !== null && lap.lapNumber === runFinalLap,
  dropOpeningLap: (lap, { runOpeningLap }) =>
    runOpeningLap !== null && lap.lapNumber === runOpeningLap,
};

export const LAP_FILTER_KEYS = Object.keys(RULES) as LapFilterKey[];

/** Which rules match this lap, ignoring whether they're switched on. Lets the
 *  UI say WHY a lap isn't counting instead of only that it isn't — a lap greyed
 *  out with no explanation looks like a bug. Callers that only care about
 *  active rules filter the result by their own `LapFilters`. */
export function lapRuleMatches(lap: LapRecord, context: LapRuleContext): LapFilterKey[] {
  return LAP_FILTER_KEYS.filter((key) => RULES[key](lap, context));
}

/** One driver's laps within a run, plus the laps the user has ticked off by
 *  hand in the stint explorer. */
export interface DriverLapSelection {
  laps: LapRecord[];
  excludedLapNumbers?: ReadonlySet<number>;
}

/** A run is one or more drivers sharing a single session. The grouping matters
 *  for `dropFinalLap`: the lap to drop is the SESSION's last, not each
 *  driver's own last lap, which mid-session is just a driver change. */
export interface RunLapSelection {
  drivers: DriverLapSelection[];
}

/** The run's highest lap number, or null when dropping it would leave nothing
 *  to analyse (a single-lap run). */
export function finalLapNumber(run: RunLapSelection): number | null {
  let highest = -Infinity;
  let lapCount = 0;
  for (const driver of run.drivers) {
    for (const lap of driver.laps) {
      lapCount++;
      if (lap.lapNumber > highest) highest = lap.lapNumber;
    }
  }
  return lapCount > 1 ? highest : null;
}

/** The run's lowest lap number — normally 0, but taken from the data rather
 *  than assumed, since an export can begin part-way through a session.
 *
 *  Null when dropping it would leave nothing to analyse, matching
 *  `finalLapNumber`; a one-lap run filtered by both rules would otherwise
 *  count nothing at all. */
export function openingLapNumber(run: RunLapSelection): number | null {
  let lowest = Infinity;
  let lapCount = 0;
  for (const driver of run.drivers) {
    for (const lap of driver.laps) {
      lapCount++;
      if (lap.lapNumber < lowest) lowest = lap.lapNumber;
    }
  }
  return lapCount > 1 ? lowest : null;
}

/** Both run-scoped bounds in one call, so callers can't compute one and forget
 *  the other. */
export function lapRuleContext(run: RunLapSelection): LapRuleContext {
  return { runFinalLap: finalLapNumber(run), runOpeningLap: openingLapNumber(run) };
}

/** Applies the active rules and the user's hand-picks to one driver's laps.
 *
 *  Blanks the lap TIME of a dropped lap (to -1) rather than removing the lap
 *  from the array. That's load-bearing, not a shortcut: `pitIn`/`pitOut` are
 *  what `deriveStints` splits on, and `fuelUsed`/`fuelAdded` are real
 *  regardless of whether the lap counts towards pace. Dropping the records
 *  outright would move stint boundaries and lose fuel. -1 is the same "not a
 *  timed lap" convention the parsers already use for lap 0. */
export function applyLapFilters(
  laps: LapRecord[],
  filters: LapFilters,
  options: { excludedLapNumbers?: ReadonlySet<number> } & LapRuleContext,
): LapRecord[] {
  return laps.map((lap) => {
    const droppedByHand = options.excludedLapNumbers?.has(lap.lapNumber) ?? false;
    const droppedByRule = LAP_FILTER_KEYS.some(
      (key) => filters[key] && RULES[key](lap, options),
    );
    return droppedByHand || droppedByRule ? { ...lap, lapTimeMs: -1 } : lap;
  });
}

export interface LapSelectionCounts {
  /** Timed laps across every run in scope, before any filtering. */
  total: number;
  /** Timed laps still counted after rules and hand-picks. */
  counted: number;
  /** Dropped by an active rule and NOT also picked out by hand. */
  byRule: number;
  /** Dropped by hand, whether or not a rule would have dropped it anyway.
   *  Hand-picks take precedence in this split so that
   *  `counted + byRule + byHand === total` exactly — the panel shows all three
   *  and they have to add up. */
  byHand: number;
  /** Per rule, how many timed laps that rule would drop ON ITS OWN, whether
   *  or not it's currently switched on. Rules overlap (a pit lap is often also
   *  flagged unclean), so these do NOT sum to `byRule`. */
  wouldDrop: Record<LapFilterKey, number>;
}

/** Counts what the current selection includes and excludes, for the selection
 *  panel's readout. Without this the rule toggles have no visible effect: the
 *  user flips one and some number further down the page changes by an unknown
 *  amount.
 *
 *  Laps that were never timed in the source data (lap 0, a lap iRacing
 *  invalidated) are outside the count entirely — no setting can bring them
 *  back, so including them would make "184 of 212 laps" unreachable by
 *  design. */
export function countLapSelection(
  runs: RunLapSelection[],
  filters: LapFilters,
): LapSelectionCounts {
  const wouldDrop: Record<LapFilterKey, number> = {
    cleanLapsOnly: 0,
    excludePitLaps: 0,
    dropFinalLap: 0,
    dropOpeningLap: 0,
  };
  let total = 0;
  let counted = 0;
  let byRule = 0;
  let byHand = 0;

  for (const run of runs) {
    const context = lapRuleContext(run);
    for (const driver of run.drivers) {
      for (const lap of driver.laps) {
        if (lap.lapTimeMs <= 0) continue;
        total++;

        let droppedByRule = false;
        for (const key of LAP_FILTER_KEYS) {
          if (!RULES[key](lap, context)) continue;
          wouldDrop[key]++;
          if (filters[key]) droppedByRule = true;
        }

        if (driver.excludedLapNumbers?.has(lap.lapNumber)) byHand++;
        else if (droppedByRule) byRule++;
        else counted++;
      }
    }
  }

  return { total, counted, byRule, byHand, wouldDrop };
}
