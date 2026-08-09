"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  applyLapFilters,
  countLapSelection,
  deriveStints,
  finalLapNumber,
  computeStintPaceTrend,
  computeFuelBurnRate,
  computeAverageFuelBurnRate,
  computeConditionsSummary,
  garage61OnlyToLapRecords,
  lapRuleMatches,
  parseGarage61Csv,
  garage61SessionTypeLabel,
  LAP_FILTER_KEYS,
  type Garage61Session,
  type LapFilterKey,
  type LapFilters,
  type LapRecord,
  type RunLapSelection,
  type Stint,
} from "@/core";
import { formatLapTime } from "@/lib/format";
import { AppHeader } from "@/components/AppHeader";
import { SectionHeading } from "@/components/SectionHeading";
import { Panel, PanelHeading } from "@/components/Panel";
import { Tag } from "@/components/Controls";
import { Table, TableWrap, Td, Th, Tr, Swatch } from "@/components/DataTable";
import { ConditionsSummaryCard } from "@/components/ConditionsSummaryCard";
import { FileUploadButton } from "@/components/FileUploadButton";
import {
  LapSelectionPanel,
  LAP_SELECTION_ANCHOR,
  type HandPickOption,
} from "@/components/LapSelectionPanel";
import { StickySelectionBar } from "@/components/StickySelectionBar";
import type { PickerRun } from "@/components/LapPicker";
import { useScrolledPast } from "@/hooks/useScrolledPast";
import { useGarage61 } from "@/hooks/useGarage61";
import { Garage61ConnectPanel } from "@/components/Garage61ConnectPanel";
import { Garage61SessionPicker } from "@/components/Garage61SessionPicker";
import { seriesColor } from "@/components/charts/chart-theme";
import { RunLapTimeChart, type RunLapTimeSeries } from "@/components/charts/RunLapTimeChart";

const MAX_RUNS = 4;

/** Names a Garage61 session the way a filename names an upload — enough to
 *  tell four slots apart at a glance. */
function sessionLabel(session: Garage61Session): string {
  const when = Date.parse(session.startedAt);
  const date = Number.isFinite(when)
    ? new Date(when).toLocaleDateString(undefined, { day: "2-digit", month: "short" })
    : "—";
  return [date, garage61SessionTypeLabel(session.sessionType), session.carName]
    .filter(Boolean)
    .join(" · ");
}

/** UI labels for the core filter keys. Kept beside the page rather than in
 *  /core, which stays free of presentation. */
const RULE_LABELS: Record<LapFilterKey, string> = {
  cleanLapsOnly: "Clean laps only",
  excludePitLaps: "No pit laps",
  dropFinalLap: "Drop final lap",
};

/** Terse forms of the same labels, for the per-lap "dropped by rule" column
 *  where there's only room for a word. */
const RULE_SHORT: Record<LapFilterKey, string> = {
  cleanLapsOnly: "unclean",
  excludePitLaps: "pit lap",
  dropFinalLap: "final lap",
};

interface DriverRun {
  driverName: string;
  laps: LapRecord[];
}

interface RunData {
  /** What this run is called in the UI — a filename on the upload path, a
   *  session description on the Garage61 account path. Both paths produce the
   *  same `LapRecord[]`, so nothing below here cares which it was. */
  label: string;
  source: RunSource;
  /** Set only on the account path, so the session picker can show which of its
   *  rows are already loaded into a slot. */
  sessionKey?: string;
  drivers: DriverRun[];
}

type RunSource = "csv" | "garage61";

interface ProcessedDriver {
  driverName: string;
  /** Untouched laps as parsed. Read this for anything that happened whether or
   *  not the lap counts towards pace — fuel burned, weather. Pace figures must
   *  come from `stints`, whose laps have had the selection applied. */
  rawLaps: LapRecord[];
  stints: Stint[];
  /** A dropped lap's original time, so the UI can show what it would restore.
   *
   *  Keyed by OBJECT IDENTITY of the lap in `stints`, not by lap number,
   *  because lap numbers aren't unique within a Garage61 export: G61's own
   *  `Run` column can restart the count, and two of the sample files carry two
   *  different "lap 0" out-laps (318.5s and 237.5s). A lapNumber-keyed map
   *  silently shows one row the other's time. */
  rawTimeByLap: Map<LapRecord, number>;
}

interface ProcessedRun {
  slot: number;
  label: string;
  /** The lap `dropFinalLap` targets, resolved per run. Kept here so the lap
   *  picker can report which rules hit a given lap without recomputing it. */
  finalLap: number | null;
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
  // `dropFinalLap` defaults ON: quitting out during the final stop is the
  // normal way a practice run ends, so the part-lap it leaves behind is noise
  // far more often than it's data. Still a toggle, so nothing is silently
  // discarded — and the selection panel shows what it removed.
  const [filters, setFilters] = useState<LapFilters>({
    cleanLapsOnly: false,
    excludePitLaps: false,
    dropFinalLap: true,
  });
  // Whether the sticky bar's copy of the selection panel is expanded.
  const [barOpen, setBarOpen] = useState(false);
  const [selectionSectionRef, scrolledPastSelection] = useScrolledPast();

  // Where runs come from. Uploading stays the default so the app works with no
  // account at all; the API path is an alternative, never a replacement.
  const [runSource, setRunSource] = useState<RunSource>("csv");
  const [sessions, setSessions] = useState<Garage61Session[]>([]);
  const garage61 = useGarage61();

  async function handleSessionSearch(filters: Parameters<typeof garage61.fetchSessions>[0]) {
    setSessions(await garage61.fetchSessions(filters));
  }

  function clearSlotExclusions(slot: number) {
    setExcludedLaps((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (key.startsWith(`${slot}:`)) delete next[key];
      }
      return next;
    });
  }

  /** Groups one run's laps by driver. Shared by both load paths — a practice
   *  session can be shared, and the rest of the page already handles that. */
  function toDriverRuns(laps: LapRecord[]): DriverRun[] {
    const lapsByDriver = new Map<string, LapRecord[]>();
    for (const lap of laps) {
      if (!lapsByDriver.has(lap.driverName)) lapsByDriver.set(lap.driverName, []);
      lapsByDriver.get(lap.driverName)!.push(lap);
    }
    return [...lapsByDriver.entries()].map(([driverName, driverLaps]) => ({
      driverName,
      laps: driverLaps,
    }));
  }

  async function handleFileChange(slot: number, file: File) {
    setErrors((prev) => prev.map((e, i) => (i === slot ? null : e)));
    clearSlotExclusions(slot);

    try {
      const rows = parseGarage61Csv(await file.text());
      const drivers = toDriverRuns(garage61OnlyToLapRecords(rows, file.name));

      setRuns((prev) =>
        prev.map((r, i) => (i === slot ? { label: file.name, source: "csv", drivers } : r)),
      );
    } catch (err) {
      setErrors((prev) =>
        prev.map((e, i) => (i === slot ? (err instanceof Error ? err.message : String(err)) : e)),
      );
    }
  }

  /** The account path's counterpart to `handleFileChange`. The session's laps
   *  arrive already narrowed to the CSV's row shape, so this skips the parse
   *  and joins the shared pipeline at exactly the same point. */
  function handleSessionSelected(slot: number, session: Garage61Session) {
    setErrors((prev) => prev.map((e, i) => (i === slot ? null : e)));
    clearSlotExclusions(slot);

    const label = sessionLabel(session);
    const drivers = toDriverRuns(garage61OnlyToLapRecords(session.rows, label));

    setRuns((prev) =>
      prev.map((r, i) =>
        i === slot ? { label, source: "garage61", sessionKey: session.key, drivers } : r,
      ),
    );
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

  function toggleFilter(key: string) {
    setFilters((prev) => ({ ...prev, [key]: !prev[key as LapFilterKey] }));
  }

  const loadedSlots = useMemo(
    () => runs.map((r, slot) => ({ r, slot })).filter((x) => x.r !== null).map((x) => x.slot),
    [runs],
  );

  const visibleSlots = useMemo(
    () => loadedSlots.filter((slot) => !hiddenRuns.has(slot)),
    [loadedSlots, hiddenRuns],
  );

  // Only clears the runs currently in scope, matching what the panel lists —
  // a hidden run's hand-picks are left alone rather than silently discarded.
  function clearHandPicks() {
    setExcludedLaps((prev) => {
      const next = { ...prev };
      for (const slot of visibleSlots) {
        for (const key of Object.keys(next)) {
          if (key.startsWith(`${slot}:`)) delete next[key];
        }
      }
      return next;
    });
  }

  // Every derived view (stints, summary stats, the chart) reads from this,
  // never from `runs` directly — the single place run visibility, the rule
  // filters and the hand-picks all get applied. The predicates themselves live
  // in /core so the selection panel's counts can't drift from what's actually
  // filtered here.
  const processedRuns = useMemo<ProcessedRun[]>(() => {
    return runs.flatMap((run, slot) => {
      if (!run || hiddenRuns.has(slot)) return [];
      const runFinalLap = finalLapNumber({ drivers: run.drivers });

      return [
        {
          slot,
          label: run.label,
          finalLap: runFinalLap,
          drivers: run.drivers.map((driver) => {
            const filtered = applyLapFilters(driver.laps, filters, {
              excludedLapNumbers: excludedLaps[exclusionKey(slot, driver.driverName)],
              runFinalLap,
            });
            // applyLapFilters maps 1:1 over driver.laps, so index i lines up and
            // each filtered lap is a distinct object reference — which is what
            // makes it a safe map key where lap numbers aren't unique.
            const rawTimeByLap = new Map<LapRecord, number>();
            filtered.forEach((lap, i) => rawTimeByLap.set(lap, driver.laps[i].lapTimeMs));
            return {
              driverName: driver.driverName,
              rawLaps: driver.laps,
              stints: deriveStints(filtered),
              rawTimeByLap,
            };
          }),
        },
      ];
    });
  }, [runs, excludedLaps, hiddenRuns, filters]);

  // What the Lap Selection block reports: the lap counts, and every hand-pick as a
  // removable chip. `handPickIndex` maps a chip's key back to its coordinates
  // so removal doesn't have to parse the key string apart.
  const selection = useMemo(() => {
    const scope: RunLapSelection[] = [];
    const handPicks: HandPickOption[] = [];
    const handPickIndex = new Map<
      string,
      { slot: number; driverName: string; lapNumber: number }
    >();

    runs.forEach((run, slot) => {
      if (!run || hiddenRuns.has(slot)) return;

      scope.push({
        drivers: run.drivers.map((driver) => ({
          laps: driver.laps,
          excludedLapNumbers: excludedLaps[exclusionKey(slot, driver.driverName)],
        })),
      });

      // The driver name only earns its space on a shared run — on a solo run
      // it's the same name on every chip.
      const namePerChip = run.drivers.length > 1;
      for (const driver of run.drivers) {
        const excluded = excludedLaps[exclusionKey(slot, driver.driverName)];
        if (!excluded) continue;
        for (const lapNumber of [...excluded].sort((a, b) => a - b)) {
          const key = `${slot}:${driver.driverName}:${lapNumber}`;
          handPicks.push({
            key,
            label: namePerChip
              ? `R${slot + 1} ${driver.driverName} L${lapNumber}`
              : `R${slot + 1} L${lapNumber}`,
            color: seriesColor(slot),
          });
          handPickIndex.set(key, { slot, driverName: driver.driverName, lapNumber });
        }
      }
    });

    return { counts: countLapSelection(scope, filters), handPicks, handPickIndex };
  }, [runs, hiddenRuns, excludedLaps, filters]);

  // The run → driver → stint → lap tree the Lap Selection picker renders. Built from
  // `processedRuns` so the stint grouping is identical to the stint explorer's,
  // but each lap's TIME comes from `rawTimeByLap`: a dropped lap has its time
  // blanked to -1 in `stint.laps`, and the picker has to show the real time for
  // you to decide whether to restore it.
  const pickerRuns = useMemo<PickerRun[]>(() => {
    return processedRuns.map((run) => {
      const drivers = run.drivers.map((driver) => {
        const excluded = excludedLaps[exclusionKey(run.slot, driver.driverName)];

        const stints = driver.stints.map((stint) => {
          const laps = stint.laps.map((lap) => {
            // Every field except lapTimeMs survives filtering untouched, so the
            // rule check can read the filtered lap directly.
            const rawTimeMs = driver.rawTimeByLap.get(lap) ?? lap.lapTimeMs;
            return {
              lapNumber: lap.lapNumber,
              time: rawTimeMs > 0 ? formatLapTime(rawTimeMs) : null,
              handDropped: excluded?.has(lap.lapNumber) ?? false,
              droppedBy: lapRuleMatches(lap, run.finalLap)
                .filter((key) => filters[key])
                .map((key) => RULE_SHORT[key]),
            };
          });
          return {
            key: stintKey(run.slot, driver.driverName, stint.stintNumber),
            stintNumber: stint.stintNumber,
            startLap: stint.startLap,
            endLap: stint.endLap,
            handDroppedCount: laps.filter((l) => l.handDropped).length,
            laps,
          };
        });

        return { driverName: driver.driverName, stints };
      });

      return {
        slot: run.slot,
        label: `Run ${run.slot + 1}`,
        sourceLabel: run.label,
        color: seriesColor(run.slot),
        handDroppedCount: drivers.reduce(
          (sum, d) => sum + d.stints.reduce((s, st) => s + st.handDroppedCount, 0),
          0,
        ),
        drivers,
      };
    });
  }, [processedRuns, excludedLaps, filters]);

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
  const showSelectionBar = hasAnyRun && scrolledPastSelection;

  // Collapse the bar as soon as the real block is back on screen, so the panel
  // is never on screen twice — which would also make the lap picker's expanded
  // runs look like they'd reset.
  useEffect(() => {
    if (!showSelectionBar) setBarOpen(false);
  }, [showSelectionBar]);

  // Built once and rendered in two places — in the Lap Selection block, and
  // inside the sticky bar when that block is scrolled out of view. Same props,
  // same state, so the two can never disagree about the selection.
  const selectionPanel = (
    <LapSelectionPanel
      runs={loadedSlots.map((slot) => ({
        slot,
        label: `Run ${slot + 1}`,
        color: seriesColor(slot),
        visible: !hiddenRuns.has(slot),
      }))}
      onToggleRun={toggleRunVisible}
      rules={LAP_FILTER_KEYS.map((key) => ({
        key,
        label: RULE_LABELS[key],
        active: filters[key],
        wouldDrop: selection.counts.wouldDrop[key],
      }))}
      onToggleRule={toggleFilter}
      handPicks={selection.handPicks}
      onRemoveHandPick={(key) => {
        const pick = selection.handPickIndex.get(key);
        if (pick) toggleLapExclusion(pick.slot, pick.driverName, pick.lapNumber);
      }}
      onClearHandPicks={clearHandPicks}
      pickerRuns={pickerRuns}
      onToggleLap={toggleLapExclusion}
      total={selection.counts.total}
      counted={selection.counts.counted}
      byRule={selection.counts.byRule}
      byHand={selection.counts.byHand}
    />
  );

  return (
    <>
      <AppHeader
        title="Stint Planner"
        context={hasAnyRun ? `${loadedSlots.length} run${loadedSlots.length > 1 ? "s" : ""}` : "Practice"}
        below={
          showSelectionBar ? (
            <StickySelectionBar
              counted={selection.counts.counted}
              total={selection.counts.total}
              activeRules={LAP_FILTER_KEYS.filter((key) => filters[key]).map(
                (key) => RULE_LABELS[key],
              )}
              handPickCount={selection.counts.byHand}
              open={barOpen}
              onToggle={() => setBarOpen((v) => !v)}
            >
              {selectionPanel}
            </StickySelectionBar>
          ) : undefined
        }
      />

      <div className="mx-auto w-full max-w-[1320px] px-5 pb-20">
        <section className="mt-8">
          <SectionHeading
            eyebrow="/// Session data"
            title="Practice runs"
            tagline="up to four, compared side by side"
            note="Each slot takes one practice session — a Garage61 CSV export, or a session pulled straight from a connected Garage61 account. Colours here match the charts and tables below, so a run keeps the same identity throughout — clearing a slot never repaints the others."
          />
          <Panel className="mt-3.5">
            {/* Two ways to fill the same four slots. Uploading is the default
                and works with no account; the two can be mixed freely, since
                both produce identical LapRecords. */}
            <div className="mb-4 flex flex-wrap items-center gap-2 border-b border-line pb-3.5">
              <span className="mr-1 font-display text-[13px] uppercase tracking-[0.1em] text-muted">
                Load from
              </span>
              {(
                [
                  ["csv", "CSV upload"],
                  ["garage61", "Garage61 account"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRunSource(value)}
                  aria-pressed={runSource === value}
                  className={`rounded-sm border px-2.5 py-1 font-display text-[13px] uppercase tracking-[0.06em] transition-colors ${
                    runSource === value
                      ? "border-amber text-amber"
                      : "border-line2 text-muted hover:text-text"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {runSource === "csv" ? (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
                {Array.from({ length: MAX_RUNS }, (_, slot) => (
                  <FileUploadButton
                    key={slot}
                    label={`Run ${slot + 1}`}
                    labelColor={seriesColor(slot)}
                    accept=".csv"
                    fileName={runs[slot]?.label}
                    onFileSelected={(file) => handleFileChange(slot, file)}
                    onClear={() => clearSlot(slot)}
                    error={errors[slot]}
                    resetKey={resetKeys[slot]}
                  />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                <Garage61ConnectPanel
                  status={garage61.status}
                  profile={garage61.profile}
                  connecting={garage61.connecting}
                  error={garage61.connectError}
                  onConnect={garage61.connect}
                  onDisconnect={garage61.disconnect}
                />

                {garage61.status === "connected" && (
                  <Garage61SessionPicker
                    reference={garage61.reference}
                    referenceError={garage61.referenceError}
                    sessions={sessions}
                    progress={garage61.progress}
                    assignedKeys={runs.map((run) => run?.sessionKey ?? null)}
                    slotColors={Array.from({ length: MAX_RUNS }, (_, slot) =>
                      seriesColor(slot),
                    )}
                    onSearch={handleSessionSearch}
                    onAssign={handleSessionSelected}
                  />
                )}
              </div>
            )}

            {/* Loaded slots are listed whichever mode is showing, so switching
                between them never looks like the runs were lost. */}
            {hasAnyRun && (
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3.5">
                {loadedSlots.map((slot) => (
                  <span
                    key={slot}
                    className="flex items-center gap-2 rounded-sm border border-line2 px-2.5 py-1"
                  >
                    <Swatch color={seriesColor(slot)} />
                    <span className="font-display text-[13px] uppercase tracking-[0.06em] text-text">
                      Run {slot + 1}
                    </span>
                    <span className="max-w-[240px] truncate font-mono text-[11px] text-faint">
                      {runs[slot]?.label}
                    </span>
                    <button
                      type="button"
                      onClick={() => clearSlot(slot)}
                      aria-label={`Clear run ${slot + 1}`}
                      className="text-faint transition-colors hover:text-danger"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>
            )}
          </Panel>
        </section>

        {hasAnyRun && (
          <section
            id={LAP_SELECTION_ANCHOR}
            ref={selectionSectionRef}
            className="mt-8 scroll-mt-24"
          >
            <SectionHeading
              eyebrow="/// Lap selection"
              title="Lap Selection"
              tagline="what every number below is built from"
              note="Configuration, not analysis: three ways of narrowing the data — which runs are in scope, the rules applied to every lap, and individual laps ticked off by hand. Nothing here changes the underlying files. Pit-stop boundaries, fuel and weather always come from the full lap set, so a dropped lap only stops counting towards pace."
            />
            <div className="mt-3.5">{selectionPanel}</div>
          </section>
        )}

        {hasAnyRun && processedRuns.length === 0 && (
          <p className="mt-8 font-mono text-xs text-amber">
            Every loaded run is hidden — re-enable one from the run chips above.
          </p>
        )}

        {processedRuns.length > 0 && (
          <>
            {/* The rule marks where configuration ends and analysis begins —
                the numbered sections below all read from the selection above. */}
            <section className="mt-10 border-t border-line pt-10">
              <SectionHeading
                eyebrow="01 · Overview"
                title="Run comparison"
                tagline="which session was actually quicker"
                note={
                  <>
                    Pace and fuel per driver per run. <b className="text-muted">Laps</b> is how many
                    laps survived the lap selection above, so it’s the count these averages are
                    over. <b className="text-muted">Pit stops</b> counts stint boundaries, so a run
                    driven straight through shows zero. <b className="text-muted">Fuel used</b> and{" "}
                    <b className="text-muted">avg burn</b> come from every lap the car ran — fuel
                    burns whether or not the lap counted.
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
                          // Raw laps on purpose: fuel burns whether or not the
                          // lap counts towards pace.
                          const totalFuelUsed = driver.rawLaps.reduce(
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
                note="Drag below the chart to zoom into a stretch of laps, one lap at a time. Dropped laps are left out of the line entirely rather than plotted as a spike, so the y-axis stays scaled to real running pace — a gap in a line is a dropped lap."
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
                    <b className="text-muted">Fuel added</b> is Garage61’s exact figure for the
                    stop that started this stint — the column to read when comparing a short-fill
                    strategy against a full tank. <b className="text-muted">Pace trend</b> is the
                    lap-time slope within the stint (positive = getting slower); it reflects fuel
                    burn-off and traffic as much as tyres, so don’t read it as degradation
                    alone. Expand a stint to see its individual laps and why any of them
                    aren’t counting; to change that, use the lap picker up in Lap Selection.
                  </>
                }
              />

              <div className="mt-3.5 flex flex-col gap-5">
                {processedRuns.map((run) => {
                  const runLaps = run.drivers.flatMap((d) => d.rawLaps);
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
                            {run.label}
                          </span>
                        </div>
                        {conditions && <ConditionsSummaryCard conditions={conditions} />}
                      </div>

                      {run.drivers.map((driver) => {
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
                                        </Tr>
                                        {isExpanded && (
                                          <tr>
                                            <td />
                                            <td colSpan={7} className="border-b border-line pb-3 pl-3">
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
                                                      Dropped
                                                    </th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {/* Read-only: laps are picked in the Lap Selection
                                                      block, so exactly one place changes the
                                                      selection. This just shows what's counting. */}
                                                  {stint.laps.map((lap, lapIndex) => {
                                                    const rawTimeMs =
                                                      driver.rawTimeByLap.get(lap) ?? lap.lapTimeMs;
                                                    const byHand =
                                                      excluded?.has(lap.lapNumber) ?? false;
                                                    const byRule = lapRuleMatches(lap, run.finalLap)
                                                      .filter((key) => filters[key])
                                                      .map((key) => RULE_SHORT[key]);
                                                    const isIncluded = !byHand && byRule.length === 0;
                                                    return (
                                                      // Lap number alone isn't a unique key — a
                                                      // Garage61 export can repeat one.
                                                      <tr key={`${lap.lapNumber}:${lapIndex}`}>
                                                        <td className="pr-4 tabular-nums text-muted">
                                                          {lap.lapNumber}
                                                        </td>
                                                        <td
                                                          className={`pr-4 text-right tabular-nums ${
                                                            isIncluded
                                                              ? "text-text"
                                                              : "text-faint line-through"
                                                          }`}
                                                        >
                                                          {rawTimeMs > 0
                                                            ? formatLapTime(rawTimeMs)
                                                            : "–"}
                                                        </td>
                                                        <td className="text-faint">
                                                          {[...(byHand ? ["by hand"] : []), ...byRule].join(
                                                            ", ",
                                                          )}
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
