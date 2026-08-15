"use client";

import type { RunComparison } from "@/core";
import { Delta, Swatch, Table, TableWrap, Td, Th, Tr } from "@/components/DataTable";
import { runColor } from "@/components/charts/chart-theme";
import { formatLapTime } from "@/lib/format";

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
}: {
  value: number | null;
  baseline: number | null;
  isBaseline: boolean;
  format: (v: number | null) => string;
  formatDelta: (v: number) => string;
  lowerIsBetter?: boolean;
}) {
  if (isBaseline || baseline === null || value === null) {
    return <Td>{format(value)}</Td>;
  }
  return (
    <Td>
      <Delta value={value - baseline} format={formatDelta} invert={lowerIsBetter} />
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
            </tr>
          </thead>
          <tbody>
            {runs.map((run) => {
              const isBaseline = baseline !== null && run.slot === baseline.slot;

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
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableWrap>
    </div>
  );
}
