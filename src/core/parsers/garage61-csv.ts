import type { RawGarage61Row } from "../types/race-data";

const EXPECTED_HEADER = [
  "Run",
  "Lap",
  "Lap time",
  "Started at",
  "Driver",
  "Clean",
  "Pit in",
  "Pit out",
  "Track temp",
  "Track usage",
  "Air temperature",
  "Cloud cover",
  "Air density",
  "Air pressure",
  "Wind velocity",
  "Wind direction",
  "Relative humidity",
  "Fog level",
  "Precipitation",
  "Track Wetness",
  "Fuel level",
  "Fuel used",
  "Fuel added",
  "Sector 1",
  "Sector 2",
  "Sector 3",
  "Sector 4",
] as const;

/** Splits one CSV line into fields, handling quoted fields (with embedded
 *  commas/escaped quotes) per RFC 4180 — Garage61 exports don't currently
 *  need this, but driver/team names are free text and could in principle. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"') {
        if (line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      fields.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  fields.push(current);
  return fields;
}

function toNumber(value: string): number {
  return Number(value);
}

function toNullableNumber(value: string): number | null {
  return value === "" ? null : Number(value);
}

/** For readings where a negative is the export's "not recorded" marker rather
 *  than a value — see `RawGarage61Row.trackUsagePct`. Kept separate from
 *  `toNullableNumber` because most nullable columns (the sectors) are simply
 *  blank when absent, and a negative sector time would be a bug worth seeing
 *  rather than quietly nulling. */
function toNullableNonNegative(value: string): number | null {
  if (value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function toBool01(value: string): boolean {
  return value === "1";
}

/** Parses a Garage61 CSV export (as raw text) into rows. Pure function —
 *  no `fs`/browser APIs — so it works the same from a Node script and from
 *  a browser FileReader result. */
export function parseGarage61Csv(csvText: string): RawGarage61Row[] {
  const lines = csvText.split(/\r?\n/).filter((line) => line.length > 0);
  if (lines.length === 0) return [];

  const header = parseCsvLine(lines[0]);
  const missingColumns = EXPECTED_HEADER.filter((col) => !header.includes(col));
  if (missingColumns.length > 0) {
    throw new Error(
      `Garage61 CSV is missing expected column(s): ${missingColumns.join(", ")}`,
    );
  }

  const colIndex = new Map(header.map((name, i) => [name, i]));
  const get = (fields: string[], name: string): string =>
    fields[colIndex.get(name)!] ?? "";

  return lines.slice(1).map((line) => {
    const fields = parseCsvLine(line);

    return {
      run: toNumber(get(fields, "Run")),
      lap: toNumber(get(fields, "Lap")),
      lapTimeSeconds: toNumber(get(fields, "Lap time")),
      startedAt: get(fields, "Started at"),
      driver: get(fields, "Driver"),
      clean: toBool01(get(fields, "Clean")),
      pitIn: toBool01(get(fields, "Pit in")),
      pitOut: toBool01(get(fields, "Pit out")),
      trackTempC: toNumber(get(fields, "Track temp")),
      trackUsagePct: toNullableNonNegative(get(fields, "Track usage")),
      airTempC: toNumber(get(fields, "Air temperature")),
      cloudCover: toNumber(get(fields, "Cloud cover")),
      airDensity: toNumber(get(fields, "Air density")),
      airPressure: toNumber(get(fields, "Air pressure")),
      windVelocity: toNumber(get(fields, "Wind velocity")),
      windDirection: toNumber(get(fields, "Wind direction")),
      relativeHumidity: toNumber(get(fields, "Relative humidity")),
      fogLevel: toNumber(get(fields, "Fog level")),
      precipitation: toNumber(get(fields, "Precipitation")),
      trackWetness: toNumber(get(fields, "Track Wetness")),
      fuelLevel: toNumber(get(fields, "Fuel level")),
      fuelUsed: toNumber(get(fields, "Fuel used")),
      fuelAdded: toNumber(get(fields, "Fuel added")),
      sector1: toNullableNumber(get(fields, "Sector 1")),
      sector2: toNullableNumber(get(fields, "Sector 2")),
      sector3: toNullableNumber(get(fields, "Sector 3")),
      sector4: toNullableNumber(get(fields, "Sector 4")),
    };
  });
}
