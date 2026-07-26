// Dev tool: sanity-check computeFieldPace against a real iRacing export.
// Usage: npx tsx scripts/inspect-field-pace.ts <iracing.json> [carClassId]
import { readFileSync } from "node:fs";
import type { RawIracingExport } from "../src/core/types/race-data";
import { computeFieldPace, computeOurPaceVsField } from "../src/core/transforms/field-pace";
import { parseIracingJson } from "../src/core/parsers/iracing-json";

const [iracingPath, carClassIdArg] = process.argv.slice(2);
if (!iracingPath) {
  console.error("Usage: npx tsx scripts/inspect-field-pace.ts <iracing.json> [carClassId]");
  process.exit(1);
}

const raw = JSON.parse(readFileSync(iracingPath, "utf-8")) as RawIracingExport;
const carClassId = carClassIdArg ? Number(carClassIdArg) : undefined;

const fieldPace = computeFieldPace(raw, { carClassId });
console.log("field pace points:", fieldPace.length);
console.log("first 5:", fieldPace.slice(0, 5));
console.log("last 5:", fieldPace.slice(-5));
const medians = fieldPace.map((p) => p.fieldMedianLapTimeMs);
console.log("min/max field median (ms):", Math.min(...medians), Math.max(...medians));
console.log("sample size range:", Math.min(...fieldPace.map((p) => p.sampleSize)), "-", Math.max(...fieldPace.map((p) => p.sampleSize)));

// Sanity check against the first team in the file.
const ourEntry = raw.lapData[0];
const ourTeamId = ourEntry.finishing_position.team_id;
const allLaps = parseIracingJson(raw);
const ourTeamLaps = allLaps.filter((l) => l.teamId === ourTeamId);
const paceVsField = computeOurPaceVsField(
  ourTeamLaps,
  computeFieldPace(raw, { carClassId: ourEntry.finishing_position.car_class_id }),
);
console.log(`\nourTeam (${ourEntry.finishing_position.display_name}) paceVsField sample:`);
console.log(paceVsField.slice(0, 5));
console.log(paceVsField.slice(-5));
const deltas = paceVsField.map((p) => p.deltaMs).filter((d): d is number => d !== undefined);
console.log("delta count / total laps:", deltas.length, "/", paceVsField.length);
console.log(
  "median delta (ms):",
  deltas.length ? [...deltas].sort((a, b) => a - b)[Math.floor(deltas.length / 2)] : "n/a",
);
