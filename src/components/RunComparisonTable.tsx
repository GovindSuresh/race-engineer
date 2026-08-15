"use client";

import { trackWetnessLabel, type RunComparison } from "@/core";
import { Delta, Swatch, Table, TableWrap, Td, Th, Tr } from "@/components/DataTable";
import { runColor } from "@/components/charts/chart-theme";
import { formatLapTime, formatTrackUsage } from "@/lib/format";

export interface RunComparisonTableProps {
  runs: RunComparison[];
  /** Slot to measure the others against, or null for absolute figures.
   *  Controlled by the page so the choice survives a re-render. */
  baselineSlot: number | null;
  onBaselineChange: (slot: number | null) => void;
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

function degrees(value: number | null): string {
  return value === null ? DASH : `${value.toFixed(1)}°C`;
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

/** Every run's headline numbers in one place.
 *
 *  Section 03 shows each run in its own panel, which is right for reading one
 *  run in detail but means comparing two of them is a matter of holding
 *  numbers in your head while scrolling. This is the same data pivoted: runs
 *  down the side, metrics across, so a difference is a glance rather than a
 *  memory exercise. */
export function RunComparisonTable({
  runs,
  baselineSlot,
  onBaselineChange,
}: RunComparisonTableProps) {
  const baseline = runs.find((run) => run.slot === baselineSlot) ?? null;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="font-display text-[11px] uppercase tracking-[0.1em] text-faint">
          Compare against
        </span>
        <button
          onClick={() => onBaselineChange(null)}
          className={`rounded-sm border px-2 py-0.5 font-mono text-[11px] transition-colors ${
            baselineSlot === null
              ? "border-line2 bg-panel2 text-text"
              : "border-line text-muted hover:text-text"
          }`}
        >
          absolute
        </button>
        {runs.map((run) => (
          <button
            key={run.slot}
            onClick={() => onBaselineChange(run.slot)}
            className={`rounded-sm border px-2 py-0.5 font-mono text-[11px] transition-colors ${
              baselineSlot === run.slot
                ? "border-line2 bg-panel2 text-text"
                : "border-line text-muted hover:text-text"
            }`}
          >
            <Swatch color={runColor(run.slot)} />
            Run {run.slot + 1}
          </button>
        ))}
      </div>

      <TableWrap>
        <Table>
          <thead>
            <tr>
              <Th align="left">Run</Th>
              {/* Was "Source" when this held a filename. It now holds
                  date · driver · car, which describes the session rather than
                  where the data came from. */}
              <Th align="left">Session</Th>
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
              <Th className="border-l border-line2">Track °C</Th>
              <Th>Air °C</Th>
              <Th>Wetness</Th>
              <Th>Rubber</Th>
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const isBaseline = baseline !== null && run.slot === baseline.slot;
              const c = run.conditions;
              const baseC = baseline?.conditions ?? null;

              return (
                <Tr key={run.slot} highlight={isBaseline}>
                  <Td align="left">
                    <Swatch color={runColor(run.slot)} />
                    <span className="text-text">Run {run.slot + 1}</span>
                  </Td>
                  <Td align="left" className="max-w-[220px] truncate text-faint">
                    {run.label}
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
                    format={degrees}
                    formatDelta={signedDegrees}
                    neutral
                    className="border-l border-line2"
                    title={
                      c
                        ? `Mean track temperature. Ranged ${c.trackTempMinC.toFixed(1)}–${c.trackTempMaxC.toFixed(1)}°C over ${c.lapsWithReading} laps.`
                        : "No Garage61 weather data on this run's laps."
                    }
                  />
                  <ValueCell
                    value={c?.airTempAvgC ?? null}
                    baseline={baseC?.airTempAvgC ?? null}
                    isBaseline={isBaseline}
                    format={degrees}
                    formatDelta={signedDegrees}
                    neutral
                    title={
                      c
                        ? `Mean air temperature. Ranged ${c.airTempMinC.toFixed(1)}–${c.airTempMaxC.toFixed(1)}°C over ${c.lapsWithReading} laps.`
                        : "No Garage61 weather data on this run's laps."
                    }
                  />
                  {/* Wetness is named, not numbered: iRacing's reading is one
                      of seven states, so "50%" would imply a precision that
                      isn't in the data. Worst state seen, since a run that
                      dried out is still a run that had a wet section. */}
                  <Td>
                    {c === null ? (
                      DASH
                    ) : (
                      <Hint
                        title={`Wettest the track got during this run (Garage61 reading ${c.maxTrackWetnessPct}/100).`}
                      >
                        <span
                          className={c.maxTrackWetnessPct > 0 ? "text-wet" : "text-muted"}
                        >
                          {trackWetnessLabel(c.maxTrackWetnessPct)}
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
