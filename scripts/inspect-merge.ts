// Dev tool: merge a real iRacing export + Garage61 export and print a summary.
// Usage: npx tsx scripts/inspect-merge.ts <iracing.json> <garage61.csv>
import { readFileSync } from "node:fs";
import type { RawIracingExport } from "../src/core/types/race-data";
import { parseIracingJson } from "../src/core/parsers/iracing-json";
import { parseGarage61Csv } from "../src/core/parsers/garage61-csv";
import { mergeGarage61IntoIracing } from "../src/core/transforms/merge";

const [iracingPath, garage61Path] = process.argv.slice(2);
if (!iracingPath || !garage61Path) {
  console.error("Usage: npx tsx scripts/inspect-merge.ts <iracing.json> <garage61.csv>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(iracingPath, "utf-8")) as RawIracingExport;
const iracingLaps = parseIracingJson(raw);
const garage61Rows = parseGarage61Csv(readFileSync(garage61Path, "utf-8"));

const { merged, unmatchedGarage61Rows } = mergeGarage61IntoIracing(iracingLaps, garage61Rows);

const enrichedCount = merged.filter((r) => r.fuelUsed !== undefined).length;
console.log(`Total iRacing lap records: ${iracingLaps.length}`);
console.log(`Total Garage61 rows: ${garage61Rows.length}`);
console.log(`Merged/enriched records: ${enrichedCount}`);
console.log(`Unmatched Garage61 rows: ${unmatchedGarage61Rows.length}`);
console.log(
  `Unique unmatched driver names: ${[...new Set(unmatchedGarage61Rows.map((r) => r.driver))].join(", ")}`,
);

const sampleEnriched = merged.find((r) => r.fuelUsed !== undefined);
console.log("\nSample enriched record:", sampleEnriched);
