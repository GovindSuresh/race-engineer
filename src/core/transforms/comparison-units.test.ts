import { describe, expect, it } from "vitest";
import type { LapRecord, Stint } from "../types/race-data";
import {
  buildComparisonUnits,
  defaultStintSelection,
  listStintCandidates,
  stintKey,
  type ComparisonSource,
} from "./comparison-units";

function lap(lapNumber: number, lapTimeMs = 120000): LapRecord {
  return { lapNumber, driverName: "Ada Vance", teamName: "Test Team", lapTimeMs };
}

function stint(stintNumber: number, laps: LapRecord[], driverName = "Ada Vance"): Stint {
  return {
    stintNumber,
    driverName,
    startLap: laps[0]?.lapNumber ?? 0,
    endLap: laps[laps.length - 1]?.lapNumber ?? 0,
    laps,
    fuelAtStart: 100,
    fuelAtEnd: 50,
    avgLapTimeMs: 120000,
    bestLapTimeMs: 120000,
  };
}

/** A solo run with three stints — the session that prompted stint mode: out,
 *  pit, change something, out again. */
function soloRun(slot: number): ComparisonSource {
  return {
    slot,
    descriptor: "12 Jul · Ada Vance · GT3",
    drivers: [
      {
        driverName: "Ada Vance",
        stints: [
          stint(1, [lap(1), lap(2), lap(3)]),
          stint(2, [lap(8), lap(9)]),
          stint(3, [lap(14), lap(15)]),
        ],
      },
    ],
  };
}

describe("listStintCandidates", () => {
  it("lists every stint of every run in run, driver, stint order", () => {
    const candidates = listStintCandidates([soloRun(0), soloRun(2)]);

    expect(candidates.map((c) => [c.runSlot, c.stintNumber])).toEqual([
      [0, 1],
      [0, 2],
      [0, 3],
      [2, 1],
      [2, 2],
      [2, 3],
    ]);
  });

  it("names a stint without its driver on a solo run", () => {
    expect(listStintCandidates([soloRun(0)])[0].label).toBe("Stint 1");
  });

  it("names a stint with its driver on a driver-swap run", () => {
    const swap: ComparisonSource = {
      slot: 0,
      descriptor: "12 Jul · Ada Vance + Bo Reyes · GT3",
      drivers: [
        { driverName: "Ada Vance", stints: [stint(1, [lap(1)], "Ada Vance")] },
        { driverName: "Bo Reyes", stints: [stint(2, [lap(9)], "Bo Reyes")] },
      ],
    };

    expect(listStintCandidates([swap]).map((c) => c.label)).toEqual([
      "Ada Vance · Stint 1",
      "Bo Reyes · Stint 2",
    ]);
  });

  it("counts stintIndex across the run, not per driver, so shades stay distinct", () => {
    // Restarting the index at a driver change would give both drivers' first
    // stints the same shade of the run's hue.
    const swap: ComparisonSource = {
      slot: 0,
      descriptor: "swap",
      drivers: [
        { driverName: "Ada Vance", stints: [stint(1, [lap(1)]), stint(2, [lap(5)])] },
        { driverName: "Bo Reyes", stints: [stint(3, [lap(9)])] },
      ],
    };

    expect(listStintCandidates([swap]).map((c) => c.stintIndex)).toEqual([0, 1, 2]);
  });

  it("counts only timed laps, matching every other figure in the comparison", () => {
    const run: ComparisonSource = {
      slot: 0,
      descriptor: "d",
      drivers: [{ driverName: "Ada Vance", stints: [stint(1, [lap(1), lap(2, 0), lap(3)])] }],
    };

    expect(listStintCandidates([run])[0].lapCount).toBe(2);
  });

  it("omits the empty stints the default filters leave at a run's ends", () => {
    // What a real run looks like: `deriveStints` makes a stint of the lone
    // lap 0, and another of the part-lap left by quitting out, and
    // dropOpeningLap/dropFinalLap zero both. Neither can be compared.
    const run: ComparisonSource = {
      slot: 0,
      descriptor: "d",
      drivers: [
        {
          driverName: "Ada Vance",
          stints: [
            stint(1, [lap(0, 0)]),
            stint(2, [lap(1), lap(2)]),
            stint(3, [lap(8), lap(9)]),
            stint(4, [lap(14, 0)]),
          ],
        },
      ],
    };

    const candidates = listStintCandidates([run]);

    expect(candidates.map((c) => c.stintNumber)).toEqual([2, 3]);
    // And the shade ramp starts at the run's base hue, not two steps up it.
    expect(candidates.map((c) => c.stintIndex)).toEqual([0, 1]);
  });

  it("reports the stint's lap range for the detail line", () => {
    const [first] = listStintCandidates([soloRun(0)]);
    expect([first.startLap, first.endLap]).toEqual([1, 3]);
  });
});

describe("defaultStintSelection", () => {
  it("selects every stint of the first run and nothing from the others", () => {
    const selection = defaultStintSelection([soloRun(0), soloRun(2)]);

    expect(selection.size).toBe(3);
    expect([...selection].every((key) => key.startsWith("0:"))).toBe(true);
  });

  it("returns an empty selection when no run is visible", () => {
    expect(defaultStintSelection([]).size).toBe(0);
  });
});

describe("buildComparisonUnits", () => {
  it("makes one unit per run in runs mode, flattening every driver's stints", () => {
    const swap: ComparisonSource = {
      slot: 1,
      descriptor: "12 Jul · Ada Vance + Bo Reyes · GT3",
      drivers: [
        { driverName: "Ada Vance", stints: [stint(1, [lap(1)])] },
        { driverName: "Bo Reyes", stints: [stint(2, [lap(9)])] },
      ],
    };

    const [unit] = buildComparisonUnits([swap], "runs", new Set());

    // A driver-swap run is still one session, one setup, one thing compared.
    expect(unit.name).toBe("Run 2");
    expect(unit.detail).toBe("12 Jul · Ada Vance + Bo Reyes · GT3");
    expect(unit.stints).toHaveLength(2);
    expect(unit.runSlot).toBe(1);
  });

  it("ignores the stint selection entirely in runs mode", () => {
    const [unit] = buildComparisonUnits([soloRun(0)], "runs", new Set(["0:Ada Vance:1"]));
    expect(unit.stints).toHaveLength(3);
  });

  it("makes one unit per selected stint in stints mode", () => {
    const units = buildComparisonUnits(
      [soloRun(0)],
      "stints",
      new Set([stintKey(0, "Ada Vance", 1), stintKey(0, "Ada Vance", 3)]),
    );

    expect(units.map((u) => u.name)).toEqual(["Stint 1", "Stint 3"]);
    expect(units.every((u) => u.stints.length === 1)).toBe(true);
    expect(units.map((u) => u.detail)).toEqual(["laps 1–3", "laps 14–15"]);
  });

  it("omits the run from the name when every selected stint is from one run", () => {
    const units = buildComparisonUnits([soloRun(0), soloRun(2)], "stints", defaultStintSelection([soloRun(0)]));

    // "Run 1 · Stint 1/2/3" would put the same prefix on all three.
    expect(units.map((u) => u.name)).toEqual(["Stint 1", "Stint 2", "Stint 3"]);
  });

  it("adds the run to the name as soon as the selection spans two runs", () => {
    const units = buildComparisonUnits(
      [soloRun(0), soloRun(2)],
      "stints",
      new Set([stintKey(0, "Ada Vance", 2), stintKey(2, "Ada Vance", 1)]),
    );

    expect(units.map((u) => u.name)).toEqual(["Run 1 · Stint 2", "Run 3 · Stint 1"]);
  });

  it("keeps a stint's hue and shade fixed however the selection changes", () => {
    const both = buildComparisonUnits(
      [soloRun(0)],
      "stints",
      defaultStintSelection([soloRun(0)]),
    );
    const justTheLast = buildComparisonUnits(
      [soloRun(0)],
      "stints",
      new Set([stintKey(0, "Ada Vance", 3)]),
    );

    // Deselecting the first two must not slide stint 3 onto another colour.
    expect(both[2].stintIndex).toBe(2);
    expect(justTheLast[0].stintIndex).toBe(2);
    expect(justTheLast[0].runSlot).toBe(0);
  });

  it("drops selected stints whose run is no longer visible", () => {
    // The page hides a run by leaving it out of `runs`, without pruning the
    // selection — so a stale key must fall out silently rather than throw.
    const units = buildComparisonUnits(
      [soloRun(0)],
      "stints",
      new Set([stintKey(0, "Ada Vance", 1), stintKey(2, "Ada Vance", 1)]),
    );

    expect(units.map((u) => u.key)).toEqual([stintKey(0, "Ada Vance", 1)]);
    // And the survivor keeps its unprefixed name — one run is still one run.
    expect(units[0].name).toBe("Stint 1");
  });

  it("returns nothing when no stint is selected", () => {
    expect(buildComparisonUnits([soloRun(0)], "stints", new Set())).toEqual([]);
  });
});
