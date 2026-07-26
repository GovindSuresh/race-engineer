// Dev tool: build a full RaceSummary from real data and print a summary.
// Usage: npx tsx scripts/inspect-race-summary.ts <iracing.json> [garage61.csv]
import { readFileSync } from "node:fs";
import type { RawIracingExport } from "../src/core/types/race-data";
import { parseIracingJson } from "../src/core/parsers/iracing-json";
import { parseGarage61Csv } from "../src/core/parsers/garage61-csv";
import { mergeGarage61IntoIracing } from "../src/core/transforms/merge";
import { buildRaceSummary } from "../src/core/transforms/race-summary";
import { computeRaceKpis } from "../src/core/transforms/race-kpis";

const [iracingPath, garage61Path] = process.argv.slice(2);
if (!iracingPath) {
  console.error("Usage: npx tsx scripts/inspect-race-summary.ts <iracing.json> [garage61.csv]");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(iracingPath, "utf-8")) as RawIracingExport;
let allLaps = parseIracingJson(raw);

if (garage61Path) {
  const rows = parseGarage61Csv(readFileSync(garage61Path, "utf-8"));
  allLaps = mergeGarage61IntoIracing(allLaps, rows).merged;
}

// "Our team" — pick by name if a team name is given as the 3rd arg,
// otherwise default to the first entry.
const ourTeamName = process.argv[4];
const ourEntry = ourTeamName
  ? raw.lapData.find((e) => e.finishing_position.display_name === ourTeamName)
  : raw.lapData[0];
if (!ourEntry) {
  console.error(`No team named "${ourTeamName}" found.`);
  process.exit(1);
}
const ourTeamId = ourEntry.finishing_position.team_id;
const summary = buildRaceSummary(raw, allLaps, ourTeamId);

console.log("subsessionId:", summary.subsessionId);
console.log("raceLengthLaps:", summary.raceLengthLaps);
console.log("ourTeam:", {
  teamName: summary.ourTeam.teamName,
  finishPosition: summary.ourTeam.finishPosition,
  carClassName: summary.ourTeam.carClassName,
  drivers: summary.ourTeam.drivers.map((d) => ({
    driverName: d.driverName,
    lapsCompleted: d.lapsCompleted,
    bestLapTimeMs: d.bestLapTimeMs,
    stints: d.stints.length,
  })),
});
console.log("fieldResults count:", summary.fieldResults.length);
console.log("gapTrend length:", summary.gapTrend.length);
console.log("gapTrend sample (first 3):", summary.gapTrend.slice(0, 3));
console.log("gapTrend sample (last 3):", summary.gapTrend.slice(-3));
console.log("weatherTimeline length:", summary.weatherTimeline.length);
console.log("kpis:", computeRaceKpis(summary));
