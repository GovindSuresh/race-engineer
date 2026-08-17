import type { Stint } from "../types/race-data";

/** What the Stint Analysis page is comparing against what.
 *
 *  `runs` is the original framing — one uploaded session per series — and is
 *  right when the question is "which of these four sessions was quicker".
 *  `stints` splits those sessions at their pit stops instead, which is the
 *  only way to answer the question the page was specified for: a driver who
 *  goes out, pits, changes setup and goes out again has run an A/B test that a
 *  run-level average flattens into one number. */
export type ComparisonMode = "runs" | "stints";

/** One loaded run, reduced to what the comparison needs.
 *
 *  Deliberately NOT the page's `ProcessedRun` — /core must not import a UI
 *  type. The page passes only its visible runs; a hidden run is absent here
 *  rather than flagged, so nothing downstream has to remember to check. */
export interface ComparisonSource {
  slot: number;
  /** date · driver · car, as the page composes it. */
  descriptor: string;
  drivers: { driverName: string; stints: Stint[] }[];
}

/** A stint the user could put on the chart — every stint of every visible run,
 *  selected or not. `buildComparisonUnits` returns only the SELECTED ones, so
 *  the chip grid needs this separate listing to draw the unselected chips. */
export interface StintCandidate {
  key: string;
  runSlot: number;
  /** Position among this run's stints, 0-based and independent of the
   *  selection, so a stint keeps its shade and dash pattern no matter what
   *  else is ticked. */
  stintIndex: number;
  driverName: string;
  stintNumber: number;
  /** "Stint 2", or "Ada Vance · Stint 2" on a driver-swap run. Never carries
   *  the run — the chip grid is grouped by run already. */
  label: string;
  startLap: number;
  endLap: number;
  /** Timed laps only, matching what every figure in the comparison counts. */
  lapCount: number;
}

/** One series in the comparison — a whole run, or a single stint of one.
 *
 *  Identity (`key`, `name`, `detail`) and appearance (`runSlot`, `stintIndex`)
 *  are settled here so the table, the boxplot and both charts can't disagree
 *  about what a series is called or what colour it is. Everything numeric is
 *  derived downstream from `stints` alone. */
export interface ComparisonUnit {
  key: string;
  /** Primary identity, as short as it can be while staying unambiguous — see
   *  the qualification rules in `buildComparisonUnits`. */
  name: string;
  /** Secondary line: the session descriptor for a run, the lap range for a
   *  stint. */
  detail: string;
  /** Hue. Always the run the unit came from, so stints of one run group
   *  visually even when they're interleaved with another run's. */
  runSlot: number;
  /** Shade and dash pattern within the hue. 0 for a whole run. */
  stintIndex: number;
  /** Exactly one stint in `stints` mode; all of the run's in `runs` mode. */
  stints: Stint[];
}

/** Canonical identity for one stint, shared by the comparison selection, the
 *  lap picker's tree and the Stint explorer's expand state. One format, so a
 *  stint means the same thing to all three. */
export function stintKey(slot: number, driverName: string, stintNumber: number): string {
  return `${slot}:${driverName}:${stintNumber}`;
}

function timedLapCount(stint: Stint): number {
  return stint.laps.filter((lap) => lap.lapTimeMs > 0).length;
}

/** Every stint of every run that could be compared, in run then driver then
 *  stint order.
 *
 *  Stints with no counted lap are left out entirely. A real run produces two
 *  of them at its ends — `dropOpeningLap` zeroes the lone lap 0 that
 *  `deriveStints` made a stint of, and `dropFinalLap` does the same to the
 *  part-lap from quitting out — and both defaults are ON. Measured on
 *  `ref_data/RA_tyre_change.csv`: 5 stints, of which 1 and 5 hold nothing.
 *  Offering them would put two dead chips in the grid and two rows of dashes
 *  in the table, so they are not candidates. The Stint explorer still shows
 *  them; it reports what the run did, which is a different question.
 *
 *  `stintIndex` therefore counts over the SURVIVING stints, which also starts
 *  the shade ramp at the run's base hue instead of two steps up it. It counts
 *  across the whole run rather than restarting per driver: it drives that
 *  ramp, and two stints of one run sharing a shade because a driver change
 *  reset the counter would defeat the point. */
export function listStintCandidates(runs: ComparisonSource[]): StintCandidate[] {
  const candidates: StintCandidate[] = [];

  for (const run of runs) {
    const qualifyDriver = run.drivers.length > 1;
    let stintIndex = 0;

    for (const driver of run.drivers) {
      for (const stint of driver.stints) {
        const lapCount = timedLapCount(stint);
        if (lapCount === 0) continue;

        candidates.push({
          key: stintKey(run.slot, driver.driverName, stint.stintNumber),
          runSlot: run.slot,
          stintIndex,
          driverName: driver.driverName,
          stintNumber: stint.stintNumber,
          label: qualifyDriver
            ? `${driver.driverName} · Stint ${stint.stintNumber}`
            : `Stint ${stint.stintNumber}`,
          startLap: stint.startLap,
          endLap: stint.endLap,
          lapCount,
        });
        stintIndex += 1;
      }
    }
  }

  return candidates;
}

/** The stints selected by default when the user first switches to stint mode:
 *  every stint of the first visible run.
 *
 *  Not "every stint of every run" — four runs of four stints is sixteen series
 *  at once, which is unreadable before the user has done anything. Starting at
 *  one run matches the case the mode exists for (a solo session with a setup
 *  change in the middle) and leaves the other runs one chip-click away. */
export function defaultStintSelection(runs: ComparisonSource[]): Set<string> {
  const first = runs[0];
  if (first === undefined) return new Set();
  return new Set(
    listStintCandidates([first]).map((candidate) => candidate.key),
  );
}

/** Turns the loaded runs into the series the whole analysis section renders.
 *
 *  In `runs` mode a unit is a run, exactly as before: every driver's stints
 *  flattened together, because a driver-swap run is still one session, one
 *  setup, one thing being compared.
 *
 *  In `stints` mode a unit is one selected stint. Two rules keep the names as
 *  short as they can be while staying unambiguous, both decided from the whole
 *  selection rather than per unit:
 *
 *  - The run appears only when the selection spans more than one run. Three
 *    stints of a single run read "Stint 1/2/3"; the run would be noise on
 *    every one of them.
 *  - The driver appears only when that run had more than one, following the
 *    same convention the lap-time chart's series labels use.
 *
 *  Selection keys that match no stint are ignored rather than erroring — a run
 *  can be hidden or cleared while its stints are still ticked, and dropping
 *  them silently is what makes the page's "hide a run" toggle work without the
 *  selection needing to be kept in sync. */
export function buildComparisonUnits(
  runs: ComparisonSource[],
  mode: ComparisonMode,
  selectedStintKeys: ReadonlySet<string>,
): ComparisonUnit[] {
  if (mode === "runs") {
    return runs.map((run) => ({
      key: `run${run.slot}`,
      name: `Run ${run.slot + 1}`,
      detail: run.descriptor,
      runSlot: run.slot,
      stintIndex: 0,
      stints: run.drivers.flatMap((driver) => driver.stints),
    }));
  }

  const stintBySlotAndKey = new Map<string, Stint>();
  for (const run of runs) {
    for (const driver of run.drivers) {
      for (const stint of driver.stints) {
        stintBySlotAndKey.set(
          stintKey(run.slot, driver.driverName, stint.stintNumber),
          stint,
        );
      }
    }
  }

  const selected = listStintCandidates(runs).filter((candidate) =>
    selectedStintKeys.has(candidate.key),
  );
  const spansRuns = new Set(selected.map((candidate) => candidate.runSlot)).size > 1;

  const units: ComparisonUnit[] = [];
  for (const candidate of selected) {
    const stint = stintBySlotAndKey.get(candidate.key);
    if (stint === undefined) continue;

    units.push({
      key: candidate.key,
      name: spansRuns
        ? `Run ${candidate.runSlot + 1} · ${candidate.label}`
        : candidate.label,
      detail: `laps ${candidate.startLap}–${candidate.endLap}`,
      runSlot: candidate.runSlot,
      stintIndex: candidate.stintIndex,
      stints: [stint],
    });
  }

  return units;
}
