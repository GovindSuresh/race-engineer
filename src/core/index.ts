// Public API surface for /core — this is the only import path /ui should use
// into the core layer. Parsers and transforms get added here as they're built.

export type {
  WeatherSnapshot,
  LapRecord,
  Stint,
  DriverPaceStats,
  TeamRaceResult,
  GapTrendPoint,
  FieldPacePoint,
  PaceVsFieldPoint,
  PositionStint,
  RaceSummary,
  RaceKpis,
  RawIracingExport,
} from "./types/race-data";

export { parseGarage61Csv } from "./parsers/garage61-csv";
export { parseIracingJson } from "./parsers/iracing-json";

export { mergeGarage61IntoIracing } from "./transforms/merge";
export type { MergeResult } from "./transforms/merge";
export { garage61OnlyToLapRecords } from "./transforms/garage61-only";
export { deriveStints } from "./transforms/stints";
export { computeStintPaceTrend } from "./transforms/stint-pace-trend";
export { computeDriverPaceStats } from "./transforms/pace";
export { computeFuelBurnRate, computeAverageFuelBurnRate } from "./transforms/fuel";
export { buildRaceSummary, listTeams } from "./transforms/race-summary";
export type { TeamOption } from "./transforms/race-summary";
export { computeRaceKpis } from "./transforms/race-kpis";
export { computeFieldPace, computeOurPaceVsField } from "./transforms/field-pace";
export { computePositionStints } from "./transforms/position-stints";
