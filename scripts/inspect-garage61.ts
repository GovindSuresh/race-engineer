// Dev tool: run a Garage61 CSV export through the parser and print a summary.
// Usage: npx tsx scripts/inspect-garage61.ts "ref_data/some-export.csv"
import { readFileSync } from "node:fs";
import { parseGarage61Csv } from "../src/core/parsers/garage61-csv";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/inspect-garage61.ts <path-to-csv>");
  process.exit(1);
}

const csvText = readFileSync(filePath, "utf-8");
const rows = parseGarage61Csv(csvText);

console.log(`Parsed ${rows.length} rows`);
console.log("First row:", rows[0]);
console.log("Last row:", rows[rows.length - 1]);

const runs = new Set(rows.map((r) => r.run));
const drivers = new Set(rows.map((r) => r.driver));
console.log(`Runs: ${[...runs].join(", ")}`);
console.log(`Drivers: ${[...drivers].join(", ")}`);

const pitStops = rows.filter((r) => r.pitIn || r.pitOut);
console.log(`Pit in/out events: ${pitStops.length}`);

const nanRows = rows.filter((r) =>
  Object.entries(r).some(([key, value]) => {
    if (typeof value !== "number") return false;
    if (["sector1", "sector2", "sector3", "sector4"].includes(key) && value === null) {
      return false;
    }
    return Number.isNaN(value);
  }),
);
console.log(`Rows with unexpected NaN in a required field: ${nanRows.length}`);
if (nanRows.length > 0) {
  console.log("Example:", nanRows[0]);
}
