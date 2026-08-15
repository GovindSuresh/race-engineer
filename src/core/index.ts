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
  ConditionsSummary,
  SmoothedPacePoint,
  DriverRating,
  EventMeta,
  FieldStrengthPoint,
  RatingVsPacePoint,
  RawIracingExport,
  RawIracingEventResultExport,
  RawGarage61Lap,
  RawGarage61ApiList,
} from "./types/race-data";

export { parseGarage61Csv } from "./parsers/garage61-csv";
export {
  parseGarage61ApiLaps,
  garage61ApiLapsToRows,
  garage61ApiLapToRow,
  garage61ApiDriverName,
  garage61ApiSectorsToColumns,
  sortGarage61ApiLaps,
  describeGarage61LapShape,
} from "./parsers/garage61-api";
export type { Garage61LapShapeReport } from "./parsers/garage61-api";
export {
  groupG61ApiLapsIntoSessions,
  garage61SessionTypeLabel,
} from "./transforms/g61-sessions";
export type { Garage61Session } from "./transforms/g61-sessions";
export { parseIracingJson } from "./parsers/iracing-json";

export { mergeGarage61IntoIracing } from "./transforms/merge";
export type { MergeResult } from "./transforms/merge";
export { garage61OnlyToLapRecords } from "./transforms/garage61-only";
export { deriveStints } from "./transforms/stints";
export { computeStintPaceTrend } from "./transforms/stint-pace-trend";
export { computeDriverPaceStats } from "./transforms/pace";
export { computeFuelBurnRate, computeAverageFuelBurnRate } from "./transforms/fuel";

export {
  computeRunComparison,
  computeRunLapDistributions,
} from "./transforms/run-comparison";
export type {
  RunComparison,
  RunComparisonInput,
  RunLapDistribution,
} from "./transforms/run-comparison";
export { buildRaceSummary, listTeams } from "./transforms/race-summary";
export type { TeamOption } from "./transforms/race-summary";
export { computeRaceKpis } from "./transforms/race-kpis";
export { computeFieldPace, computeOurPaceVsField } from "./transforms/field-pace";
export { computePositionStints } from "./transforms/position-stints";
export { computeConditionsSummary } from "./transforms/conditions";
export { computeSmoothedPace } from "./transforms/smooth";
export {
  isEventResultExport,
  parseEventResultMeta,
  parseEventResultDriverRatings,
  decodeLicense,
} from "./parsers/iracing-event-result";
export { computeFieldStrength } from "./transforms/field-strength";
export { computeRatingVsPace, fitRatingPaceTrend } from "./transforms/rating-vs-pace";
export {
  applyLapFilters,
  countLapSelection,
  finalLapNumber,
  lapRuleMatches,
  LAP_FILTER_KEYS,
} from "./transforms/lap-selection";
export type {
  LapFilters,
  LapFilterKey,
  LapSelectionCounts,
  DriverLapSelection,
  RunLapSelection,
} from "./transforms/lap-selection";
