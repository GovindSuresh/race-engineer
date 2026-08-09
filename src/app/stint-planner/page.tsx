"use client";

import { Fragment, useMemo, useState } from "react";
import {
  deriveStints,
  computeStintPaceTrend,
  computeFuelBurnRate,
  computeAverageFuelBurnRate,
  computeConditionsSummary,
  garage61OnlyToLapRecords,
  parseGarage61Csv,
  type LapRecord,
  type Stint,
} from "@/core";
import { formatLapTime } from "@/lib/format";
import { AppHeader } from "@/components/AppHeader";
import { SectionHeading } from "@/components/SectionHeading";
import { Panel, PanelHeading } from "@/components/Panel";
import { Chip, Tag, Toggle } from "@/components/Controls";
import { Table, TableWrap, Td, Th, Tr, Swatch } from "@/components/DataTable";
import { ConditionsSummaryCard } from "@/components/ConditionsSummaryCard";
import { FileUploadButton } from "@/components/FileUploadButton";
import { seriesColor } from "@/components/charts/chart-theme";
import { RunLapTimeChart, type RunLapTimeSeries } from "@/components/charts/RunLapTimeChart";

const MAX_RUNS = 4;

interface DriverRun {
  driverName: string;
  laps: LapRecord[];
}

interface RunData {
  fileName: string;
  drivers: DriverRun[];
}

interface ProcessedDriver {
  driverName: string;
  laps: LapRecord[];
  stints: Stint[];
}

interface ProcessedRun {
  slot: number;
  fileName: string;
  drivers: ProcessedDriver[];
}

function formatTrend(msPerLap: number | undefined): string {
  if (msPerLap === undefined) return "n/a";
  const secPerLap = msPerLap / 1000;
  const sign = secPerLap > 0 ? "+" : "";
  return `${sign}${secPerLap.toFixed(2)}s/lap`;
}

function exclusionKey(slot: number, driverName: string): string {
  return `${slot}:${driverName}`;
}

function stintKey(slot: number, driverName: string, stintNumber: number): string {
  return `${slot}:${driverName}:${stintNumber}`;
}

export default function StintPlanner() {
  const [runs, setRuns] = useState<(RunData | null)[]>(Array(MAX_RUNS).fill(null));
  const [errors, setErrors] = useState<(string | null)[]>(Array(MAX_RUNS).fill(null));
  const [resetKeys, setResetKeys] = useState<number[]>(Array(MAX_RUNS).fill(0));
  // Laps the user has manually excluded (e.g. a partial lap from quitting out
  // of a session) — keyed by "slot:driverName", value = set of lap numbers.
  // Excluded laps stay in the underlying data (so pit-in/out flags used for
  // stint boundaries are untouched) but are treated as invalid (lapTimeMs <=
  // 0) everywhere pace is computed, reusing the same "not a timed lap"
  // convention the parsers already use for lap 0 etc.
  const [excludedLaps, setExcludedLaps] = useState<Record<string, Set<number>>>({});
  const [expandedStints, setExpandedStints] = useState<Set<string>>(new Set());
  const [hiddenRuns, setHiddenRuns] = useState<Set<number>>(new Set());
  const [cleanLapsOnly, setCleanLapsOnly] = useState(false);

  function clearSlotExclusions(slot: number) {
    setExcludedLaps((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${slot}:`)) delete next[key];
      }
      return next;
    });
  }

  async function handleFileChange(slot: number, file: File) {
    setErrors((prev) => prev.map((e, i) => (i === slot ? null : e)));
    clearSlotExclusions(slot);

    try {
      const rows = parseGarage61Csv(await file.text());
      const laps = garage61OnlyToLapRecords(rows, file.name);

      const lapsByDriver = new Map<string, LapRecord[]>();
      for (const lap of laps) {
        if (!lapsByDriver.has(lap.driverName)) lapsByDriver.set(lap.driverName, []);
        lapsByDriver.get(lap.driverName)!.push(lap);
      }

      const drivers: DriverRun[] = [...lapsByDriver.entries()].map(([driverName, driverLaps]) => ({
        driverName,
        laps: driverLaps,
      }));

      setRuns((prev) => prev.map((r, i) => (i === slot ? { fileName: file.name, drivers } : r)));
    } catch (err) {
      setErrors((prev) =>
        prev.map((e, i) => (i === slot ? (err instanceof Error ? err.message : String(err)) : e)),
      );
    }
  }

  function clearSlot(slot: number) {
    setRuns((prev) => prev.map((r, i) => (i === slot ? null : r)));
    setErrors((prev) => prev.map((e, i) => (i === slot ? null : e)));
    setResetKeys((prev) => prev.map((k, i) => (i === slot ? k + 1 : k)));
    clearSlotExclusions(slot);
  }

  function toggleLapExclusion(slot: number, driverName: string, lapNumber: number) {
    const key = exclusionKey(slot, driverName);
    setExcludedLaps((prev) => {
      const nextSet = new Set(prev[key] ?? []);
      if (nextSet.has(lapNumber)) nextSet.delete(lapNumber);
      else nextSet.add(lapNumber);
      return { ...prev, [key]: nextSet };
    });
  }

  function toggleStintExpanded(key: string) {
    setExpandedStints((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleRunVisible(slot: number) {
    setHiddenRuns((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  }

  const loadedSlots = useMemo(
    () => runs.map((r, slot) => ({ r, slot })).filter((x) => x.r !== null).map((x) => x.slot),
    [runs],
  );

  // Every derived view (stints, summary stats, the chart) reads from this,
  // never from `runs` directly — the single place lap exclusion, the
  // clean-laps filter, and run visibility all get applied.
  const processedRuns = useMemo<ProcessedRun[]>(() => {
    return runs.flatMap((run, slot) => {
      if (!run || hiddenRuns.has(slot)) return [];
      return [
        {
          slot,
          fileName: run.fileName,
          drivers: run.drivers.map((driver) => {
            const excluded = excludedLaps[exclusionKey(slot, driver.driverName)];
            const effectiveLaps = driver.laps.map((l) => {
              const isExcluded = excluded?.has(l.lapNumber) ?? false;
              const failsCleanFilter = cleanLapsOnly && l.isClean !== true;
              return isExcluded || failsCleanFilter ? { ...l, lapTimeMs: -1 } : l;
            });
            return {
              driverName: driver.driverName,
              laps: driver.laps,
              stints: deriveStints(effectiveLaps),
            };
          }),
        },
      ];
    });
  }, [runs, excludedLaps, hiddenRuns, cleanLapsOnly]);

  const lapTimeChart = useMemo(() => {
    const series: RunLapTimeSeries[] = [];
    const rowsByLap = new Map<number, { lapNumber: number } & Record<string, number | null>>();

    for (const run of processedRuns) {
      run.drivers.forEach((driver, driverIndex) => {
        const key = `run${run.slot}_driver${driverIndex}`;
        series.push({
          key,
          label:
            run.drivers.length > 1
              ? `Run ${run.slot + 1} — ${driver.driverName}`
              : `Run ${run.slot + 1}`,
          colorIndex: run.slot,
          dashed: driverIndex > 0,
        });

        for (const stint of driver.stints) {
          for (const lap of stint.laps) {
            if (lap.lapTimeMs <= 0) continue;
            if (!rowsByLap.has(lap.lapNumber))
              rowsByLap.set(lap.lapNumber, { lapNumber: lap.lapNumber });
            rowsByLap.get(lap.lapNumber)![key] = lap.lapTimeMs / 1000;
          }
        }
      });
    }

    const data = [...rowsByLap.values()].sort((a, b) => a.lapNumber - b.lapNumber);
    for (const row of data) {
      for (const s of series) if (!(s.key in row)) row[s.key] = null;
    }

    // Axis end = the furthest lap any visible run reached, so the axis doesn't
    // run on past the data into empty space.
    const maxLap = data.reduce((m, row) => Math.max(m, row.lapNumber), 1);

    return { series, data, maxLap };
  }, [processedRuns]);

  const hasAnyRun = loadedSlots.length > 0;

  return (
    <>
      <AppHeader
        title="Stint Planner"
        context={hasAnyRun ? `${loadedSlots.length} run${loadedSlots.length > 1 ? "s" : ""}` : "Practice"}
      >
        {hasAnyRun && (
          <>
            <div className="flex flex-wrap items-center gap-1.5">
              {loadedSlots.map((slot) => (
                <Chip
                  key={slot}
                  label={`Run ${slot + 1}`}
                  color={seriesColor(slot)}
                  active={!hiddenRuns.has(slot)}
                  onToggle={() => toggleRunVisible(slot)}
                />
              ))}
            </div>
            <Toggle
              label="Clean laps only"
              active={cleanLapsOnly}
              onToggle={() => setCleanLapsOnly((v) => !v)}
            />
          </>
        )}
      </AppHeader>

      <div className="mx-auto w-full max-w-[1320px] px-5 pb-20">
        <section className="mt-8">
          <SectionHeading
            eyebrow="/// Session data"
            title="Practice runs"
            tagline="up to four, compared side by side"
            note="Each slot takes one Garage61 CSV export. Colours here match the charts and tables below, so a run keeps the same identity throughout — clearing a slot never repaints the others."
          />
          <Panel className="mt-3.5">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {Array.from({ length: MAX_RUNS }, (_, slot) => (
                <FileUploadButton
                  key={slot}
                  label={`Run ${slot + 1}`}
                  labelColor={seriesColor(slot)}
                  accept=".csv"
                  fileName={runs[slot]?.fileName}
                  onFileSelected={(file) => handleFileChange(slot, file)}
                  onClear={() => clearSlot(slot)}
                  error={errors[slot]}
                  resetKey={resetKeys[slot]}
                />
              ))}
            </div>
          </Panel>
        </section>

        {hasAnyRun && processedRuns.length === 0 && (
          <p className="mt-8 font-mono text-xs text-amber">
            Every loaded run is hidden — re-enable one from the chips in the header.
          </p>
        )}

        {processedRuns.length > 0 && (
          <>
            <section className="mt-11">
              <SectionHeading
                eyebrow="01 · Overview"
                title="Run comparison"
                tagline="which session was actually quicker"
                note={
                  <>
                    Pace and fuel per driver per run. <b className="text-muted">Pit stops</b> counts
                    stint boundaries, so a run driven straight through shows zero.{" "}
                    {cleanLapsOnly && (
                      <span className="text-pgreen">
                        Clean-laps-only is on, so incident and off-track laps are excluded from every
                        pace figure.
                      </span>
                    )}
                  </>
                }
              />
              <Panel className="mt-3.5">
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th align="left">Run</Th>
                        <Th align="left">Driver</Th>
                        <Th>Laps</Th>
                        <Th>Best</Th>
                        <Th>Avg</Th>
                        <Th>Pit stops</Th>
                        <Th>Fuel used</Th>
                        <Th>Avg burn</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {processedRuns.flatMap((run) =>
                        run.drivers.map((driver) => {
                          const validTimes = driver.stints
                            .flatMap((s) => s.laps)
                            .map((l) => l.lapTimeMs)
                            .filter((t) => t > 0);
                          const bestLapTimeMs =
                            validTimes.length > 0 ? Math.min(...validTimes) : 0;
                          const avgLapTimeMs =
                            validTimes.length > 0
                              ? validTimes.reduce((a, b) => a + b, 0) / validTimes.length
                              : 0;
                          const totalFuelUsed = driver.laps.reduce(
                            (sum, l) => sum + (l.fuelUsed ?? 0),
                            0,
                          );

                          return (
                            <Tr key={`${run.slot}-${driver.driverName}`}>
                              <Td align="left">
                                <Swatch color={seriesColor(run.slot)} />
                                Run {run.slot + 1}
                              </Td>
                              <Td align="left">{driver.driverName}</Td>
                              <Td>{validTimes.length}</Td>
                              <Td className="text-purple">
                                {bestLapTimeMs > 0 ? formatLapTime(bestLapTimeMs) : "n/a"}
                              </Td>
                              <Td>{avgLapTimeMs > 0 ? formatLapTime(avgLapTimeMs) : "n/a"}</Td>
                              <Td>{Math.max(0, driver.stints.length - 1)}</Td>
                              <Td>{totalFuelUsed.toFixed(1)}L</Td>
                              <Td>{computeAverageFuelBurnRate(driver.stints).toFixed(2)}L</Td>
                            </Tr>
                          );
                        }),
                      )}
                    </tbody>
                  </Table>
                </TableWrap>
              </Panel>
            </section>

            <section className="mt-11">
              <SectionHeading
                eyebrow="02 · Pace"
                title="Lap times across runs"
                tagline="every lap, every run, one scale"
                note="Drag below the chart to zoom into a stretch of laps. Excluded laps are left out of the line entirely rather than plotted as a spike, so the y-axis stays scaled to real running pace."
              />
              <Panel className="mt-3.5">
                <RunLapTimeChart
                  series={lapTimeChart.series}
                  data={lapTimeChart.data}
                  maxLap={lapTimeChart.maxLap}
                />
              </Panel>
            </section>

            <section className="mt-11">
              <SectionHeading
                eyebrow="03 · Stints"
                title="Stint explorer"
                tagline="what each fuel run cost"
                note={
                  <>
                    <b className="text-muted">Fuel added</b> is inferred from the jump in fuel level
                    across a stop — the column to read when comparing a short-fill strategy against
                    a full tank. <b className="text-muted">Pace trend</b> is the lap-time slope
                    within the stint (positive = getting slower); it reflects fuel burn-off and
                    traffic as much as tyres, so don&apos;t read it as degradation alone. Expand a
                    stint to include or exclude individual laps.
                  </>
                }
              />

              <div className="mt-3.5 flex flex-col gap-5">
                {processedRuns.map((run) => {
                  const runLaps = run.drivers.flatMap((d) => d.laps);
                  const conditions = computeConditionsSummary(runLaps);

                  return (
                    <Panel key={run.slot}>
                      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
                        <div className="flex items-baseline gap-2.5">
                          <span
                            className="font-display text-[15px] uppercase tracking-[0.1em]"
                            style={{ color: seriesColor(run.slot) }}
                          >
                            Run {run.slot + 1}
                          </span>
                          <span className="truncate font-mono text-[11px] text-faint">
                            {run.fileName}
                          </span>
                        </div>
                        {conditions && <ConditionsSummaryCard conditions={conditions} />}
                      </div>

                      {run.drivers.map((driver) => {
                        const rawByLapNumber = new Map(driver.laps.map((l) => [l.lapNumber, l]));
                        const excluded = excludedLaps[exclusionKey(run.slot, driver.driverName)];

                        return (
                          <div key={driver.driverName} className="mb-5 last:mb-0">
                            <PanelHeading title={driver.driverName} />
                            <TableWrap>
                              <Table>
                                <thead>
                                  <tr>
                                    <Th align="left" />
                                    <Th align="left">Stint</Th>
                                    <Th align="left">Laps</Th>
                                    <Th>Avg</Th>
                                    <Th>Best</Th>
                                    <Th>Fuel added</Th>
                                    <Th>Burn rate</Th>
                                    <Th>Pace trend</Th>
                                    <Th align="left" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {driver.stints.map((stint) => {
                                    const trend = computeStintPaceTrend(stint);
                                    const key = stintKey(
                                      run.slot,
                                      driver.driverName,
                                      stint.stintNumber,
                                    );
                                    const isExpanded = expandedStints.has(key);
                                    const lastLapExcluded = excluded?.has(stint.endLap) ?? false;
                                    const excludedInStint = stint.laps.filter((l) =>
                                      excluded?.has(l.lapNumber),
                                    ).length;

                                    return (
                                      <Fragment key={stint.stintNumber}>
                                        <Tr>
                                          <Td align="left" className="pr-0">
                                            <button
                                              onClick={() => toggleStintExpanded(key)}
                                              className="text-faint transition-colors hover:text-text"
                                              aria-label={isExpanded ? "Hide laps" : "Show laps"}
                                            >
                                              {isExpanded ? "▾" : "▸"}
                                            </button>
                                          </Td>
                                          <Td align="left">{stint.stintNumber}</Td>
                                          <Td align="left" className="text-muted">
                                            {stint.startLap}–{stint.endLap} ({stint.laps.length})
                                            {excludedInStint > 0 && (
                                              <span className="ml-2">
                                                <Tag tone="warn">−{excludedInStint}</Tag>
                                              </span>
                                            )}
                                          </Td>
                                          <Td>
                                            {stint.avgLapTimeMs > 0
                                              ? formatLapTime(stint.avgLapTimeMs)
                                              : "n/a"}
                                          </Td>
                                          <Td className="text-purple">
                                            {stint.bestLapTimeMs > 0
                                              ? formatLapTime(stint.bestLapTimeMs)
                                              : "n/a"}
                                          </Td>
                                          <Td
                                            className={
                                              stint.fuelAddedAtPrevStop
                                                ? "text-pgreen"
                                                : "text-faint"
                                            }
                                          >
                                            {stint.fuelAddedAtPrevStop === undefined
                                              ? "–"
                                              : `${stint.fuelAddedAtPrevStop.toFixed(1)}L`}
                                          </Td>
                                          <Td>{computeFuelBurnRate(stint).toFixed(2)}L</Td>
                                          <Td>{formatTrend(trend)}</Td>
                                          <Td align="left">
                                            <button
                                              onClick={() =>
                                                toggleLapExclusion(
                                                  run.slot,
                                                  driver.driverName,
                                                  stint.endLap,
                                                )
                                              }
                                              className="whitespace-nowrap font-display text-[11px] uppercase tracking-[0.06em] text-faint transition-colors hover:text-amber"
                                            >
                                              {lastLapExcluded ? "restore last" : "drop last"}
                                            </button>
                                          </Td>
                                        </Tr>
                                        {isExpanded && (
                                          <tr>
                                            <td />
                                            <td colSpan={8} className="border-b border-line pb-3 pl-3">
                                              <table className="w-full max-w-sm border-collapse font-mono text-[11px]">
                                                <thead>
                                                  <tr className="text-faint">
                                                    <th className="pr-4 text-left font-normal">
                                                      Lap
                                                    </th>
                                                    <th className="pr-4 text-right font-normal">
                                                      Time
                                                    </th>
                                                    <th className="text-left font-normal">
                                                      Include
                                                    </th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {stint.laps.map((effectiveLap) => {
                                                    const raw =
                                                      rawByLapNumber.get(effectiveLap.lapNumber) ??
                                                      effectiveLap;
                                                    const isIncluded = !(
                                                      excluded?.has(raw.lapNumber) ?? false
                                                    );
                                                    return (
                                                      <tr key={raw.lapNumber}>
                                                        <td className="pr-4 tabular-nums text-muted">
                                                          {raw.lapNumber}
                                                        </td>
                                                        <td
                                                          className={`pr-4 text-right tabular-nums ${
                                                            isIncluded
                                                              ? "text-text"
                                                              : "text-faint line-through"
                                                          }`}
                                                        >
                                                          {raw.lapTimeMs > 0
                                                            ? formatLapTime(raw.lapTimeMs)
                                                            : "–"}
                                                        </td>
                                                        <td>
                                                          <input
                                                            type="checkbox"
                                                            checked={isIncluded}
                                                            className="accent-amber"
                                                            onChange={() =>
                                                              toggleLapExclusion(
                                                                run.slot,
                                                                driver.driverName,
                                                                raw.lapNumber,
                                                              )
                                                            }
                                                          />
                                                        </td>
                                                      </tr>
                                                    );
                                                  })}
                                                </tbody>
                                              </table>
                                            </td>
                                          </tr>
                                        )}
                                      </Fragment>
                                    );
                                  })}
                                </tbody>
                              </Table>
                            </TableWrap>
                          </div>
                        );
                      })}
                    </Panel>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>
    </>
  );
}
