import { describe, expect, it } from "vitest";
import type { LapRecord } from "../types/race-data";
import {
  applyLapFilters,
  countLapSelection,
  finalLapNumber,
  lapRuleMatches,
  type LapFilters,
  type RunLapSelection,
} from "./lap-selection";

function makeLap(overrides: Partial<LapRecord>): LapRecord {
  return {
    lapNumber: 0,
    driverName: "Test Driver",
    teamName: "Test Team",
    lapTimeMs: 138000,
    isClean: true,
    pitIn: false,
    pitOut: false,
    ...overrides,
  };
}

const NO_FILTERS: LapFilters = {
  cleanLapsOnly: false,
  excludePitLaps: false,
  dropFinalLap: false,
};

/** Four timed laps: 1 clean, 2 unclean, 3 a pit-in, 4 the run's last. */
function sampleRun(excludedLapNumbers?: Set<number>): RunLapSelection {
  return {
    drivers: [
      {
        laps: [
          makeLap({ lapNumber: 1 }),
          makeLap({ lapNumber: 2, isClean: false }),
          makeLap({ lapNumber: 3, pitIn: true }),
          makeLap({ lapNumber: 4 }),
        ],
        excludedLapNumbers,
      },
    ],
  };
}

describe("finalLapNumber", () => {
  it("takes the highest lap across all of a run's drivers, not one driver's last", () => {
    const run: RunLapSelection = {
      drivers: [
        { laps: [makeLap({ lapNumber: 1 }), makeLap({ lapNumber: 2 })] },
        { laps: [makeLap({ lapNumber: 3 }), makeLap({ lapNumber: 4 })] },
      ],
    };
    expect(finalLapNumber(run)).toBe(4);
  });

  it("returns null for a single-lap run, so the rule can't blank everything", () => {
    expect(finalLapNumber({ drivers: [{ laps: [makeLap({ lapNumber: 1 })] }] })).toBeNull();
  });
});

describe("lapRuleMatches", () => {
  it("names every rule that matches, regardless of any filter state", () => {
    // A pit in-lap that's also the run's last and flagged unclean.
    const lap = makeLap({ lapNumber: 4, pitIn: true, isClean: false });
    expect(lapRuleMatches(lap, 4).sort()).toEqual([
      "cleanLapsOnly",
      "dropFinalLap",
      "excludePitLaps",
    ]);
  });

  it("returns nothing for an ordinary clean green lap", () => {
    expect(lapRuleMatches(makeLap({ lapNumber: 2 }), 9)).toEqual([]);
  });

  it("agrees with applyLapFilters about which laps a filter set drops", () => {
    const laps = sampleRun().drivers[0].laps;
    const filters: LapFilters = { ...NO_FILTERS, excludePitLaps: true, dropFinalLap: true };
    const blanked = applyLapFilters(laps, filters, { runFinalLap: 4 })
      .filter((l) => l.lapTimeMs <= 0)
      .map((l) => l.lapNumber);
    const flagged = laps
      .filter((l) => lapRuleMatches(l, 4).some((key) => filters[key]))
      .map((l) => l.lapNumber);
    expect(flagged).toEqual(blanked);
  });
});

describe("applyLapFilters", () => {
  it("blanks the lap time but keeps the record, so pit flags and fuel survive", () => {
    const laps = [makeLap({ lapNumber: 3, pitIn: true, fuelUsed: 3, fuelAdded: 77 })];
    const [lap] = applyLapFilters(laps, { ...NO_FILTERS, excludePitLaps: true }, {
      runFinalLap: null,
    });
    expect(lap.lapTimeMs).toBe(-1);
    expect(lap.pitIn).toBe(true);
    expect(lap.fuelUsed).toBe(3);
    expect(lap.fuelAdded).toBe(77);
  });

  it("drops nothing when no rule is on and nothing is hand-picked", () => {
    const laps = sampleRun().drivers[0].laps;
    const result = applyLapFilters(laps, NO_FILTERS, { runFinalLap: 4 });
    expect(result.map((l) => l.lapTimeMs)).toEqual([138000, 138000, 138000, 138000]);
  });

  it("drops unclean laps only when cleanLapsOnly is on", () => {
    const laps = sampleRun().drivers[0].laps;
    const result = applyLapFilters(laps, { ...NO_FILTERS, cleanLapsOnly: true }, {
      runFinalLap: null,
    });
    expect(result.filter((l) => l.lapTimeMs <= 0).map((l) => l.lapNumber)).toEqual([2]);
  });

  it("drops both in- and out-laps when excludePitLaps is on", () => {
    const laps = [
      makeLap({ lapNumber: 1, pitIn: true }),
      makeLap({ lapNumber: 2, pitOut: true }),
      makeLap({ lapNumber: 3 }),
    ];
    const result = applyLapFilters(laps, { ...NO_FILTERS, excludePitLaps: true }, {
      runFinalLap: null,
    });
    expect(result.filter((l) => l.lapTimeMs <= 0).map((l) => l.lapNumber)).toEqual([1, 2]);
  });

  it("drops the run's final lap independently of the pit filter", () => {
    // The abandoned part-lap arrives with pitIn and pitOut both false, so only
    // the final-lap rule can reach it.
    const laps = [makeLap({ lapNumber: 4, lapTimeMs: 56340 })];
    const result = applyLapFilters(laps, { ...NO_FILTERS, excludePitLaps: true }, {
      runFinalLap: 4,
    });
    expect(result[0].lapTimeMs).toBe(56340);
    const dropped = applyLapFilters(laps, { ...NO_FILTERS, dropFinalLap: true }, {
      runFinalLap: 4,
    });
    expect(dropped[0].lapTimeMs).toBe(-1);
  });

  it("drops hand-picked laps with every rule off", () => {
    const laps = sampleRun().drivers[0].laps;
    const result = applyLapFilters(laps, NO_FILTERS, {
      excludedLapNumbers: new Set([1, 4]),
      runFinalLap: null,
    });
    expect(result.filter((l) => l.lapTimeMs <= 0).map((l) => l.lapNumber)).toEqual([1, 4]);
  });
});

describe("countLapSelection", () => {
  it("counts every timed lap and no untimed ones in the total", () => {
    const run: RunLapSelection = {
      drivers: [
        {
          laps: [
            makeLap({ lapNumber: 0, lapTimeMs: -1 }), // lap 0, never timed
            makeLap({ lapNumber: 1 }),
            makeLap({ lapNumber: 2 }),
          ],
        },
      ],
    };
    const counts = countLapSelection([run], NO_FILTERS);
    expect(counts.total).toBe(2);
    expect(counts.counted).toBe(2);
  });

  it("reports wouldDrop per rule even when that rule is switched off", () => {
    const counts = countLapSelection([sampleRun()], NO_FILTERS);
    expect(counts.wouldDrop).toEqual({
      cleanLapsOnly: 1,
      excludePitLaps: 1,
      dropFinalLap: 1,
    });
    expect(counts.counted).toBe(4); // nothing actually dropped
  });

  it("keeps counted + byRule + byHand equal to total when rules overlap", () => {
    // Lap 3 is both a pit lap and hand-picked; lap 2 is unclean AND (with all
    // three rules on) nothing else. Overlap must not double-count.
    const counts = countLapSelection([sampleRun(new Set([3]))], {
      cleanLapsOnly: true,
      excludePitLaps: true,
      dropFinalLap: true,
    });
    expect(counts.total).toBe(4);
    expect(counts.byHand).toBe(1); // lap 3, hand-pick wins the attribution
    expect(counts.byRule).toBe(2); // laps 2 and 4
    expect(counts.counted).toBe(1); // lap 1
    expect(counts.counted + counts.byRule + counts.byHand).toBe(counts.total);
  });

  it("attributes a lap dropped both ways to byHand, never to both", () => {
    const counts = countLapSelection([sampleRun(new Set([2]))], {
      ...NO_FILTERS,
      cleanLapsOnly: true,
    });
    expect(counts.byHand).toBe(1);
    expect(counts.byRule).toBe(0);
  });

  it("resolves the final lap per run, not across the whole comparison", () => {
    const runs: RunLapSelection[] = [
      { drivers: [{ laps: [makeLap({ lapNumber: 1 }), makeLap({ lapNumber: 2 })] }] },
      { drivers: [{ laps: [makeLap({ lapNumber: 1 }), makeLap({ lapNumber: 9 })] }] },
    ];
    const counts = countLapSelection(runs, { ...NO_FILTERS, dropFinalLap: true });
    // One per run (lap 2 and lap 9), not just the global maximum.
    expect(counts.byRule).toBe(2);
    expect(counts.counted).toBe(2);
  });

  it("returns zeroes for no runs in scope", () => {
    const counts = countLapSelection([], NO_FILTERS);
    expect(counts).toEqual({
      total: 0,
      counted: 0,
      byRule: 0,
      byHand: 0,
      wouldDrop: { cleanLapsOnly: 0, excludePitLaps: 0, dropFinalLap: 0 },
    });
  });
});
