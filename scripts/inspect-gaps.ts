// Dev tool: validate teamId stability and gap/laps-down fields against the
// real 24h Spa file.
// Usage: npx tsx scripts/inspect-gaps.ts <iracing.json>
import { readFileSync } from "node:fs";
import type { RawIracingExport } from "../src/core/types/race-data";
import { parseIracingJson } from "../src/core/parsers/iracing-json";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/inspect-gaps.ts <path-to-json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(filePath, "utf-8")) as RawIracingExport;
const records = parseIracingJson(raw);

// teamId stability: pick a team with multiple drivers (from finishing_position)
const multiDriverEntry = raw.lapData.find((e) => e.finishing_position.driver_results.length > 1);
if (multiDriverEntry) {
  const teamId = multiDriverEntry.finishing_position.team_id;
  const custIds = multiDriverEntry.finishing_position.driver_results.map((d) => d.cust_id);
  const teamIdsSeen = new Set(
    records.filter((r) => custIds.includes(r.custId!)).map((r) => r.teamId),
  );
  console.log(`Team "${multiDriverEntry.finishing_position.display_name}" (team_id ${teamId}):`);
  console.log(`  drivers: ${custIds.length}, distinct teamIds seen across their laps: ${[...teamIdsSeen]}`);
}

// gap sanity: should never be positive (leader is always fastest cumulative time)
const positiveGaps = records.filter((r) => (r.gapToLeaderMs ?? 0) > 0);
console.log(`\nRecords with a positive gapToLeaderMs (should be 0): ${positiveGaps.length}`);

const withGapMs = records.filter((r) => r.gapToLeaderMs !== undefined).length;
const withLapsDown = records.filter((r) => r.lapsDownFromLeader !== undefined).length;
const withNeither = records.filter(
  (r) => r.gapToLeaderMs === undefined && r.lapsDownFromLeader === undefined,
).length;
console.log(`Records with gapToLeaderMs: ${withGapMs}`);
console.log(`Records with lapsDownFromLeader: ${withLapsDown}`);
console.log(`Records with neither (unexpected): ${withNeither}`);

const lappedExample = records.find((r) => r.lapsDownFromLeader !== undefined);
console.log("\nExample lapped-car record:", lappedExample);
