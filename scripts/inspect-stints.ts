// Dev tool: derive stints from a real Garage61 CSV export and print a summary.
// Usage: npx tsx scripts/inspect-stints.ts "ref_data/some-export.csv"
import { readFileSync } from "node:fs";
import type { LapRecord, RawGarage61Row } from "../src/core/types/race-data";
import { parseGarage61Csv } from "../src/core/parsers/garage61-csv";
import { deriveStints } from "../src/core/transforms/stints";
import { computeStintPaceTrend } from "../src/core/transforms/stint-pace-trend";
import { computeFuelBurnRate } from "../src/core/transforms/fuel";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/inspect-stints.ts <path-to-csv>");
  process.exit(1);
}

// Ad-hoc conversion for this script only — the real Garage61-only ->
// LapRecord conversion (for the Stint Planner UI) is designed in Phase 5,
// once we know what the UI actually needs to pass as a team/label.
function toLapRecord(row: RawGarage61Row): LapRecord {
  return {
    lapNumber: row.lap,
    driverName: row.driver,
    teamName: "n/a",
    lapTimeMs: Math.round(row.lapTimeSeconds * 1000),
    isClean: row.clean,
    pitIn: row.pitIn,
    pitOut: row.pitOut,
    fuelUsed: row.fuelUsed,
    fuelLevel: row.fuelLevel,
  };
}

const rows = parseGarage61Csv(readFileSync(filePath, "utf-8"));
const byDriver = new Map<string, RawGarage61Row[]>();
for (const row of rows) {
  if (!byDriver.has(row.driver)) byDriver.set(row.driver, []);
  byDriver.get(row.driver)!.push(row);
}

for (const [driver, driverRows] of byDriver) {
  const laps = driverRows.map(toLapRecord);
  const stints = deriveStints(laps);
  console.log(`\n=== ${driver}: ${stints.length} stint(s) ===`);
  for (const s of stints) {
    const trend = computeStintPaceTrend(s);
    const burnRate = computeFuelBurnRate(s);
    console.log(
      `  Stint ${s.stintNumber}: laps ${s.startLap}-${s.endLap} (${s.laps.length} laps), ` +
        `avg ${(s.avgLapTimeMs / 1000).toFixed(2)}s, best ${(s.bestLapTimeMs / 1000).toFixed(2)}s, ` +
        `fuel ${s.fuelAtStart.toFixed(1)}L -> ${s.fuelAtEnd.toFixed(1)}L, burn ${burnRate.toFixed(2)}L/lap` +
        (s.fuelAddedAtPrevStop !== undefined
          ? `, +${s.fuelAddedAtPrevStop.toFixed(1)}L added at prev stop`
          : "") +
        (trend !== undefined ? `, pace trend ${trend.toFixed(1)}ms/lap` : ", pace trend n/a"),
    );
  }
}
