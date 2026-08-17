"use client";

import { trackWetnessLabel, type ComparisonRow } from "@/core";
import { Delta, Swatch, Table, TableWrap, Td, Th, Tr } from "@/components/DataTable";
import { stintColor } from "@/components/charts/chart-theme";
import { formatCelsius, formatLapTime, formatTrackUsage } from "@/lib/format";

export interface RunComparisonTableProps {
  runs: ComparisonRow[];
  /** Unit key to measure the others against, or null for absolute figures.
   *  A key rather than a slot: in stint mode several rows share a run slot, so
   *  a slot no longer identifies a row. Controlled by the page so the choice
   *  survives a re-render. */
  baselineKey: string | null;
  onBaselineChange: (key: string | null) => void;
  /** Heading for the identity column — "Run" or "Stint". */
  unitLabel: string;
  /** Heading for the detail column: the session on a run, the lap range on a
   *  stint. */
  detailLabel: string;
}

const DASH = "—";

function seconds(ms: number | null): string {
  return ms === null ? DASH : formatLapTime(ms);
}

function litres(value: number | null, digits = 2): string {
  return value === null ? DASH : `${value.toFixed(digits)} L`;
}

/** Lap-time deltas are shown in seconds, not milliseconds — a driver thinks in
 *  tenths, and "+0.42s" is readable where "+420ms" needs converting. */
function signedSeconds(ms: number): string {
  const s = ms / 1000;
  return `${s > 0 ? "+" : ""}${s.toFixed(2)}s`;
}

function signedLitres(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(2)} L`;
}

function signedDegrees(value: number): string {
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}°C`;
}

/** Value plus a hover explanation. Conditions columns each collapse a whole
 *  run to one number, and the thing that number hides — the range it moved
 *  through, the state a percentage stands for — is exactly what tells you
 *  whether the comparison is fair. */
function Hint({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <span title={title} className="cursor-help decoration-dotted underline-offset-4">
      {children}
    </span>
  );
}

/** A cell that shows either an absolute value or a delta against the baseline.
 *  The baseline's own row always shows absolutes, so there is something to
 *  anchor the deltas to — a table of nothing but zeros and offsets is
 *  unreadable. */
function ValueCell({
  value,
  baseline,
  isBaseline,
  format,
  formatDelta,
  /** True when LOWER is better (lap times, fuel burn), so the delta colours
   *  the right way round. */
  lowerIsBetter,
  /** Suppresses the gain/loss colouring. For measurements with no better or
   *  worse to them — a track 8°C hotter is a different test, not a failed
   *  one — where green/red would assert a judgement the data doesn't make. */
  neutral,
  /** Hover text, applied to the absolute reading and the delta alike. */
  title,
  className,
}: {
  value: number | null;
  baseline: number | null;
  isBaseline: boolean;
  format: (v: number | null) => string;
  formatDelta: (v: number) => string;
  lowerIsBetter?: boolean;
  neutral?: boolean;
  title?: string;
  className?: string;
}) {
  const wrap = (content: React.ReactNode) =>
    title ? <Hint title={title}>{content}</Hint> : content;

  if (isBaseline || baseline === null || value === null) {
    return <Td className={className}>{wrap(format(value))}</Td>;
  }
  const delta = value - baseline;
  return (
    <Td className={className}>
      {wrap(
        neutral ? (
          <span className="text-muted">{formatDelta(delta)}</span>
        ) : (
          <Delta value={delta} format={formatDelta} invert={lowerIsBetter} />
        ),
      )}
    </Td>
  );
}

/** Every compared unit's headline numbers in one place — one row per run, or
 *  one per stint, depending on the page's mode.
 *
 *  The Stint explorer shows each run in its own panel, which is right for
 *  reading one in detail but means comparing two is a matter of holding numbers
 *  in your head while scrolling. This is the same data pivoted: units down the
 *  side, metrics across, so a difference is a glance rather than a memory
 *  exercise.
 *
 *  Two columns read differently in stint mode, and both get stronger for it:
 *  Pace trend becomes the stint's own fit rather than a mean over the run's
 *  stints, and the conditions columns describe that stint alone. */
export function RunComparisonTable({
  runs,
  baselineKey,
  onBaselineChange,
  unitLabel,
  detailLabel,
}: RunComparisonTableProps) {
  const baseline = runs.find((run) => run.key === baselineKey) ?? null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-display text-[11px] uppercase tracking-[0.1em] text-faint">
          Compare against
        </span>
        <button
          onClick={() => onBaselineChange(null)}
          className={`rounded-sm border px-2 py-0.5 font-mono text-[11px] transition-colors ${
            baselineKey === null
              ? "border-line2 bg-panel2 text-text"
              : "border-line text-muted hover:text-text"
          }`}
        >
          absolute
        </button>
        {runs.map((run) => (
          <button
            key={run.key}
            onClick={() => onBaselineChange(run.key)}
            className={`rounded-sm border px-2 py-0.5 font-mono text-[11px] transition-colors ${
              baselineKey === run.key
                ? "border-line2 bg-panel2 text-text"
                : "border-line text-muted hover:text-text"
            }`}
          >
            <Swatch color={stintColor(run.runSlot, run.stintIndex)} />
            {run.name}
          </button>
        ))}
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th align="left">{unitLabel}</Th>
              {/* Was "Source" when this held a filename. It now holds
                  date · driver · car for a run, or the lap range for a stint —
                  what the row IS, rather than where the data came from. */}
              <Th align="left">{detailLabel}</Th>
              <Th>Stints</Th>
              <Th>Laps</Th>
              <Th>Best</Th>
              <Th>Median</Th>
              <Th>Average</Th>
              <Th>Spread</Th>
              <Th>Fuel/lap</Th>
              <Th>Fuel added</Th>
              <Th>Pace trend</Th>
              {/* Conditions sit after the performance columns, not among
                  them: they're the context you check once a difference shows
                  up, not a result in their own right. */}
              {/* Air temperature is deliberately not here. It's the weaker
                  of the two readings — the track surface is what the tyre
                  works against — and this table is already wide. It stays on
                  ConditionsSummaryCard for the per-run detail view. */}
              <Th className="border-l border-line2">Track °C</Th>
              <Th>Wet session</Th>
              <Th>Rubber</Th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const isBaseline = baseline !== null && run.key === baseline.key;
              const c = run.conditions;
              const baseC = baseline?.conditions ?? null;

              return (
                <Tr key={run.key} highlight={isBaseline}>
                  <Td align="left">
                    <Swatch color={stintColor(run.runSlot, run.stintIndex)} />
                    <span className="text-text">{run.name}</span>
                  </Td>
                  <Td align="left" className="max-w-[220px] truncate text-faint">
                    {run.detail}
                  </Td>
                  <Td>{run.stintCount}</Td>
                  <Td>{run.lapCount}</Td>
                  <ValueCell
                    value={run.bestLapTimeMs}
                    baseline={baseline?.bestLapTimeMs ?? null}
                    isBaseline={isBaseline}
                    format={seconds}
                    formatDelta={signedSeconds}
                    lowerIsBetter
                  />
                  <ValueCell
                    value={run.medianLapTimeMs}
                    baseline={baseline?.medianLapTimeMs ?? null}
                    isBaseline={isBaseline}
                    format={seconds}
                    formatDelta={signedSeconds}
                    lowerIsBetter
                  />
                  <ValueCell
                    value={run.avgLapTimeMs}
                    baseline={baseline?.avgLapTimeMs ?? null}
                    isBaseline={isBaseline}
                    format={seconds}
                    formatDelta={signedSeconds}
                    lowerIsBetter
                  />
                  {/* Spread is a standard deviation, so it's a duration, not a
                      lap time — shown as plain seconds rather than m:ss. */}
                  <ValueCell
                    value={run.lapTimeStdDevMs}
                    baseline={baseline?.lapTimeStdDevMs ?? null}
                    isBaseline={isBaseline}
                    format={(v) => (v === null ? DASH : `${(v / 1000).toFixed(2)}s`)}
                    formatDelta={signedSeconds}
                    lowerIsBetter
                  />
                  <ValueCell
                    value={run.fuelPerLap}
                    baseline={baseline?.fuelPerLap ?? null}
                    isBaseline={isBaseline}
                    format={(v) => litres(v)}
                    formatDelta={signedLitres}
                    lowerIsBetter
                  />
                  <ValueCell
                    value={run.fuelAddedTotal}
                    baseline={baseline?.fuelAddedTotal ?? null}
                    isBaseline={isBaseline}
                    format={(v) => litres(v, 1)}
                    formatDelta={signedLitres}
                  />
                  {/* A pace trend is already a signed rate, so it reads as its
                      own value; a delta of a slope would be a slope of a slope. */}
                  <Td>
                    {run.paceTrendMsPerLap === null ? (
                      DASH
                    ) : (
                      <Delta
                        value={run.paceTrendMsPerLap}
                        format={(v) => `${v > 0 ? "+" : ""}${(v / 1000).toFixed(2)}s/lap`}
                        invert
                      />
                    )}
                  </Td>
                  {/* Temperatures are shown as the run's mean, with the range
                      it actually moved through on hover — a mean is what
                      compares between runs, a range is what says how settled
                      one was. */}
                  <ValueCell
                    value={c?.trackTempAvgC ?? null}
                    baseline={baseC?.trackTempAvgC ?? null}
                    isBaseline={isBaseline}
                    format={formatCelsius}
                    formatDelta={signedDegrees}
                    neutral
                    className="border-l border-line2"
                    title={
                      c
                        ? `Mean track temperature. Ranged ${c.trackTempMinC.toFixed(1)}–${c.trackTempMaxC.toFixed(1)}°C over ${c.lapsWithReading} laps.`
                        : "No Garage61 weather data on this run's laps."
                    }
                  />
                  {/* Binary, because that's the question this table answers:
                      a run with any water in it isn't comparable to a dry
                      one, and the degree matters far less than the fact. The
                      wettest state it reached is on hover for when it does. */}
                  <Td>
                    {c === null ? (
                      DASH
                    ) : (
                      <Hint
                        title={`Wettest the track got during this run: ${trackWetnessLabel(c.maxTrackWetnessPct)} (Garage61 reading ${c.maxTrackWetnessPct}/100).`}
                      >
                        <span className={c.wasWet ? "text-wet" : "text-muted"}>
                          {c.wasWet ? "Yes" : "No"}
                        </span>
                      </Hint>
                    )}
                  </Td>
                  {/* Track state/rubber. Left as a percentage — unlike
                      wetness there's no verified set of named states behind
                      it, and inventing one would be dressing up a guess. */}
                  <Td>
                    {c === null ? (
                      DASH
                    ) : (
                      <Hint title="Track usage — how rubbered-in the surface was. A green track and a rubbered-in one are different tests.">
                        <span className="text-muted">
                          {formatTrackUsage(c.trackUsageMinPct, c.trackUsageMaxPct)}
                        </span>
                      </Hint>
                    )}
                  </Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
