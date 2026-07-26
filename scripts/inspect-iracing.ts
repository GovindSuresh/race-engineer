// Dev tool: run an iRacing JSON export through the parser and print a
// summary, plus spot-checks that validate the position-vs-track-position
// reconstruction actually happened correctly.
// Usage: npx tsx scripts/inspect-iracing.ts "ref_data/some-export.json"
import { readFileSync } from "node:fs";
import type { RawIracingExport } from "../src/core/types/race-data";
import { parseIracingJson } from "../src/core/parsers/iracing-json";

const filePath = process.argv[2];
if (!filePath) {
  console.error("Usage: npx tsx scripts/inspect-iracing.ts <path-to-json>");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(filePath, "utf-8")) as RawIracingExport;
console.log(`subsession_id: ${raw.subsession_id}`);
console.log(`lapData entries (classified teams): ${raw.lapData.length}`);

const records = parseIracingJson(raw);
console.log(`Total reconstructed lap records (all drivers, all laps): ${records.length}`);

// Prove the position-vs-track-position quirk is real: entry 0's lap_1 and
// lap_300 keys should belong to different teams/drivers whenever there's
// been a lead change (pit stops, overtakes) by lap 300.
const entry0 = raw.lapData[0];
const lap1 = entry0["lap_1" as `lap_${number}`];
const lap300 = entry0["lap_300" as `lap_${number}`];
console.log("\n--- Sanity check: lapData[0].lap_1 vs lapData[0].lap_300 ---");
console.log(
  `lap_1: cust_id=${lap1?.cust_id} name=${lap1?.display_name} team=${lap1?.name}`,
);
console.log(
  `lap_300: cust_id=${lap300?.cust_id} name=${lap300?.display_name} team=${lap300?.name}`,
);
console.log(
  lap1?.cust_id !== lap300?.cust_id
    ? "-> Different drivers, as expected (confirms lap_N is a track-position snapshot, not a fixed team)."
    : "-> SAME driver at both laps — either no lead change happened, or reconstruction is wrong.",
);

// Group by driver and check one known driver's full series is contiguous.
const byCustId = new Map<number, typeof records>();
for (const r of records) {
  if (r.custId === undefined) continue;
  if (!byCustId.has(r.custId)) byCustId.set(r.custId, []);
  byCustId.get(r.custId)!.push(r);
}
console.log(`\nUnique cust_ids found: ${byCustId.size}`);

const sampleCustId = [...byCustId.keys()][0];
const sampleSeries = byCustId.get(sampleCustId)!;
console.log(`\n--- Sample driver cust_id=${sampleCustId} ---`);
console.log(`Laps recorded: ${sampleSeries.length}`);
console.log("First 3 laps:", sampleSeries.slice(0, 3));
console.log("Last 3 laps:", sampleSeries.slice(-3));
console.log(
  "First 3 lap times in seconds (lapTimeMs / 1000):",
  sampleSeries.slice(0, 3).map((r) => r.lapTimeMs / 1000),
);

// Check for duplicate (custId, lapNumber) pairs, which would indicate a
// reconstruction bug (the same driver's lap appearing twice).
const seen = new Set<string>();
let duplicates = 0;
for (const r of records) {
  const k = `${r.custId}:${r.lapNumber}`;
  if (seen.has(k)) duplicates++;
  seen.add(k);
}
console.log(`\nDuplicate (custId, lapNumber) pairs: ${duplicates}`);

const invalidLapTimes = records.filter((r) => r.lapTimeMs < 0).length;
console.log(`Records with lapTimeMs < 0 (e.g. lap 0 / invalid): ${invalidLapTimes}`);
