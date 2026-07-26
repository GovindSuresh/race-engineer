// Dev tool: compute pace stats for our own team (via Garage61) and for a
// full-field opponent (iRacing JSON only) to sanity-check both paths.
// Usage: npx tsx scripts/inspect-pace.ts <iracing.json> <garage61.csv>
import { readFileSync } from "node:fs";
import type { RawIracingExport } from "../src/core/types/race-data";
import { parseIracingJson } from "../src/core/parsers/iracing-json";
import { parseGarage61Csv } from "../src/core/parsers/garage61-csv";
import { mergeGarage61IntoIracing } from "../src/core/transforms/merge";
import { computeDriverPaceStats } from "../src/core/transforms/pace";

const [iracingPath, garage61Path] = process.argv.slice(2);
if (!iracingPath || !garage61Path) {
  console.error("Usage: npx tsx scripts/inspect-pace.ts <iracing.json> <garage61.csv>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(iracingPath, "utf-8")) as RawIracingExport;
const iracingLaps = parseIracingJson(raw);
const garage61Rows = parseGarage61Csv(readFileSync(garage61Path, "utf-8"));
const { merged } = mergeGarage61IntoIracing(iracingLaps, garage61Rows);

const g61DriverNames = new Set(garage61Rows.map((r) => r.driver));

function printStats(driverName: string, laps: typeof merged) {
  const stats = computeDriverPaceStats(laps);
  console.log(`\n=== ${driverName} ===`);
  console.log(`  laps completed: ${stats.lapsCompleted}`);
  console.log(`  best: ${(stats.bestLapTimeMs / 1000).toFixed(3)}s`);
  console.log(`  avg: ${(stats.averageLapTimeMs / 1000).toFixed(3)}s`);
  console.log(`  median: ${(stats.medianLapTimeMs / 1000).toFixed(3)}s`);
  console.log(`  stddev: ${(stats.stdDevMs / 1000).toFixed(3)}s`);
  console.log(`  top10% avg: ${(stats.top10PctAvgMs / 1000).toFixed(3)}s`);
  console.log(`  incidents: ${stats.incidentCount}`);
  console.log(`  stints derived: ${stats.stints.length}`);
}

// Our own team's driver (has Garage61 data merged in)
const ownDriverName = [...g61DriverNames][0];
printStats(ownDriverName, merged.filter((l) => l.driverName === ownDriverName));

// A full-field opponent with no Garage61 data at all
const opponentLaps = merged.filter(
  (l) => !g61DriverNames.has(l.driverName) && l.driverName !== ownDriverName,
);
const opponentName = opponentLaps[0]?.driverName;
printStats(opponentName, merged.filter((l) => l.driverName === opponentName));
