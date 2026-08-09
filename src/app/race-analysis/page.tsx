"use client";

import { useCallback, useMemo, useState } from "react";
import {
  buildRaceSummary,
  computeRaceKpis,
  computeSmoothedPace,
  isEventResultExport,
  listTeams,
  mergeGarage61IntoIracing,
  parseGarage61Csv,
  parseIracingJson,
  type LapRecord,
  type RawIracingEventResultExport,
  type RawIracingExport,
  type TeamOption,
} from "@/core";
import { AppHeader } from "@/components/AppHeader";
import { DropStage, type DropSlot } from "@/components/DropStage";
import { KpiStrip, type KpiCardData } from "@/components/KpiStrip";
import { SectionHeading } from "@/components/SectionHeading";
import { Panel, PanelHeading } from "@/components/Panel";
import { Chip, Select, Tag, Toggle } from "@/components/Controls";
import { Delta, Table, TableWrap, Td, Th, Tr, Swatch } from "@/components/DataTable";
import { seriesColor } from "@/components/charts/chart-theme";
import { PaceOverTimeChart, type PaceLapPoint } from "@/components/charts/PaceOverTimeChart";
import { TrackPositionChart } from "@/components/charts/TrackPositionChart";
import { StintGanttChart } from "@/components/charts/StintGanttChart";
import { GapTrendChart } from "@/components/charts/GapTrendChart";
import { PaceVsFieldChart } from "@/components/charts/PaceVsFieldChart";
import { FieldStrengthChart } from "@/components/charts/FieldStrengthChart";
import { RatingVsPaceChart } from "@/components/charts/RatingVsPaceChart";
import { FileUploadButton } from "@/components/FileUploadButton";
import { useFileDrop } from "@/hooks/useFileDrop";
import { formatLapTime, formatSeconds } from "@/lib/format";

export default function RaceAnalysis() {
  const [raw, setRaw] = useState<RawIracingExport | null>(null);
  const [allLaps, setAllLaps] = useState<LapRecord[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [garage61UnmatchedCount, setGarage61UnmatchedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [iracingFileName, setIracingFileName] = useState<string | null>(null);
  const [garage61FileName, setGarage61FileName] = useState<string | null>(null);
  const [eventResult, setEventResult] = useState<RawIracingEventResultExport | null>(null);
  const [eventResultFileName, setEventResultFileName] = useState<string | null>(null);
  const [hiddenDrivers, setHiddenDrivers] = useState<Set<string>>(new Set());
  const [cleanLapsOnly, setCleanLapsOnly] = useState(false);
  // Bumped to remount the (uncontrolled) file inputs after clearing, so
  // re-selecting the same file still fires a change event.
  const [garage61ResetKey, setGarage61ResetKey] = useState(0);
  const [eventResultResetKey, setEventResultResetKey] = useState(0);

  function clearEventResult() {
    setEventResult(null);
    setEventResultFileName(null);
    setError(null);
    setEventResultResetKey((k) => k + 1);
  }

  /** Reverts the optional Garage61 enrichment. No pre-merge copy of the laps is
   *  kept, so this re-derives them from the still-loaded iRacing export —
   *  parseIracingJson is pure, so that's equivalent to never having merged. */
  function clearGarage61File() {
    if (raw) setAllLaps(parseIracingJson(raw));
    setGarage61UnmatchedCount(null);
    setGarage61FileName(null);
    setError(null);
    setGarage61ResetKey((k) => k + 1);
  }

  /** The Garage61 merge needs iRacing laps to merge INTO, so it takes the laps
   *  explicitly rather than reading state — when both files arrive in one drop,
   *  React hasn't committed the iRacing setState yet. */
  function mergeGarage61(csvText: string, fileName: string, baseLaps: LapRecord[]) {
    try {
      const rows = parseGarage61Csv(csvText);
      const { merged, unmatchedGarage61Rows } = mergeGarage61IntoIracing(baseLaps, rows);
      setAllLaps(merged);
      setGarage61UnmatchedCount(unmatchedGarage61Rows.length);
      setGarage61FileName(fileName);
    } catch (err) {
      setError(`Couldn't read ${fileName}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /** Handles a batch of dropped/selected files.
   *
   *  Routing can't go on extension alone: the lap chart AND the event_result
   *  are both `.json` with no filename convention, so each JSON is parsed and
   *  identified by CONTENT via isEventResultExport(). Files can arrive together
   *  in one drop, so the lap chart is handled first and its freshly-parsed laps
   *  passed directly into the CSV merge — reading `allLaps` back from state
   *  wouldn't work, React hasn't committed that setState yet. */
  const handleFiles = useCallback(
    async function handleFiles(files: File[]) {
      setError(null);

      const csvFile = files.find((f) => /\.csv$/i.test(f.name));
      const jsonFiles = files.filter((f) => /\.json$/i.test(f.name));

      let lapChart: { file: File; parsed: RawIracingExport } | undefined;
      let eventResultFile: { file: File; parsed: RawIracingEventResultExport } | undefined;

      for (const file of jsonFiles) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(await file.text());
        } catch (err) {
          setError(
            `Couldn't read ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        if (isEventResultExport(parsed)) {
          eventResultFile = { file, parsed };
        } else if (parsed && typeof parsed === "object" && "lapData" in parsed) {
          lapChart = { file, parsed: parsed as RawIracingExport };
        } else {
          setError(
            `${file.name} isn't a recognised iRacing export — expected a lap chart (has "lapData") or an event result (has type "event_result").`,
          );
          return;
        }
      }

      let baseLaps = allLaps;
      if (lapChart) {
        try {
          baseLaps = parseIracingJson(lapChart.parsed);
        } catch (err) {
          setError(
            `Couldn't parse ${lapChart.file.name}: ${err instanceof Error ? err.message : String(err)}`,
          );
          return;
        }
        setRaw(lapChart.parsed);
        setAllLaps(baseLaps);
        setTeams(listTeams(lapChart.parsed));
        setIracingFileName(lapChart.file.name);
        setSelectedTeamId(null);
        setGarage61UnmatchedCount(null);
        setGarage61FileName(null);
        setHiddenDrivers(new Set());
      }

      if (eventResultFile) {
        setEventResult(eventResultFile.parsed);
        setEventResultFileName(eventResultFile.file.name);
      }

      if (csvFile) {
        if (baseLaps.length === 0) {
          setError("Load the iRacing lap chart first — the Garage61 CSV merges into it.");
          return;
        }
        mergeGarage61(await csvFile.text(), csvFile.name, baseLaps);
      }

      if (!csvFile && jsonFiles.length === 0) {
        setError("Unrecognised file type — expected an iRacing .json export or a Garage61 .csv.");
      }
    },
    [allLaps],
  );

  // Bound here, at the page level, so a file can be dropped anywhere on EITHER
  // view — the upload stage or the dashboard. Previously this lived only inside
  // DropStage, which unmounts once the iRacing export is loaded, so dropping a
  // Garage61 CSV onto the dashboard silently did nothing.
  const { isDragging } = useFileDrop(handleFiles);

  // Derived, not stored as its own state — computed fresh from raw/allLaps/
  // selectedTeamId each render. Bundled with its own error into one memo so
  // buildRaceSummary only runs once per input change (not once for the
  // value and again for the error).
  const { raceSummary, summaryError } = useMemo(() => {
    if (!raw || selectedTeamId === null) return { raceSummary: null, summaryError: null };
    try {
      return {
        raceSummary: buildRaceSummary(raw, allLaps, selectedTeamId, eventResult ?? undefined),
        summaryError: null,
      };
    } catch (err) {
      return {
        raceSummary: null,
        summaryError: err instanceof Error ? err.message : String(err),
      };
    }
  }, [raw, allLaps, selectedTeamId, eventResult]);

  /** True when the event_result describes a DIFFERENT subsession than the lap
   *  chart — the ratings would then belong to another race entirely. Warned
   *  rather than blocked, so a genuine iRacing inconsistency doesn't lock the
   *  dashboard, but it must be visible: silently mixing two races' data would
   *  be worse than either failing or nagging. */
  const subsessionMismatch =
    raw !== null && eventResult !== null && raw.subsession_id !== eventResult.data.subsession_id;

  /** Fixed driver order for the whole page — colors are assigned from this
   *  index and must never be reassigned when the filter hides someone. */
  const allDriverNames = useMemo(
    () => raceSummary?.ourTeam.drivers.map((d) => d.driverName) ?? [],
    [raceSummary],
  );
  const visibleDriverNames = useMemo(
    () => allDriverNames.filter((n) => !hiddenDrivers.has(n)),
    [allDriverNames, hiddenDrivers],
  );
  /** Color index looked up against the FULL list, so a driver keeps their hue
   *  regardless of who is currently filtered out. */
  const colorFor = (driverName: string) => seriesColor(allDriverNames.indexOf(driverName));

  /** Our team's laps after the header filters. Every chart derives from this. */
  const filteredOurLaps = useMemo(() => {
    if (!raceSummary) return [];
    return raceSummary.ourTeamLaps.filter((l) => {
      if (hiddenDrivers.has(l.driverName)) return false;
      if (cleanLapsOnly && (l.incident === true || l.pitAffected === true)) return false;
      return true;
    });
  }, [raceSummary, hiddenDrivers, cleanLapsOnly]);

  const kpiItems = useMemo<KpiCardData[]>(() => {
    if (!raceSummary) return [];
    const kpis = computeRaceKpis(raceSummary);
    return [
      {
        label: "Finish",
        value: `P${kpis.finishPosition}`,
        sublabel: `of ${kpis.fieldSize} · P${kpis.finishPositionInClass} of ${kpis.classSize} in class`,
        tone: "hero",
      },
      {
        label: "Laps",
        value: String(kpis.lapsCompleted),
        sublabel:
          kpis.lapsDownFromLeader === 0
            ? "on the lead lap"
            : `${kpis.lapsDownFromLeader} down on the leader`,
      },
      {
        label: "Best lap",
        value: formatLapTime(kpis.bestLapTimeMs),
        sublabel: kpis.bestLapDriverName,
        tone: "good",
      },
      { label: "Incidents", value: String(kpis.totalIncidents) },
      // Only present with the event_result upload — iRacing's own published SoF,
      // passed through rather than recomputed (see EventMeta).
      ...(raceSummary.eventMeta
        ? [
            {
              label: "Strength of field",
              value: String(
                raceSummary.eventMeta.classStrengthOfField ??
                  raceSummary.eventMeta.strengthOfField,
              ),
              sublabel:
                raceSummary.eventMeta.splitRank !== undefined
                  ? `split ${raceSummary.eventMeta.splitRank} of ${raceSummary.eventMeta.splitCount}`
                  : `${raceSummary.eventMeta.numDrivers} drivers`,
              tone: "hero" as const,
            },
          ]
        : []),
      {
        label: "Pit stops",
        value: kpis.pitStopCount !== undefined ? String(kpis.pitStopCount) : "n/a",
        sublabel: kpis.pitStopCount === undefined ? "needs Garage61" : undefined,
        tone: kpis.pitStopCount === undefined ? "warn" : undefined,
      },
      {
        label: "Fuel used",
        value:
          kpis.totalFuelUsedLiters !== undefined
            ? `${kpis.totalFuelUsedLiters.toFixed(1)} L`
            : "n/a",
        sublabel: kpis.totalFuelUsedLiters === undefined ? "needs Garage61" : undefined,
        tone: kpis.totalFuelUsedLiters === undefined ? "warn" : undefined,
      },
    ];
  }, [raceSummary]);

  /** The axis end for every lap-indexed chart — the real race distance, so the
   *  axis doesn't run on past the last lap into empty space. */
  const maxLap = useMemo(() => {
    if (!raceSummary) return 1;
    const lastLap = raceSummary.ourTeamLaps.reduce((m, l) => Math.max(m, l.lapNumber), 0);
    return Math.max(raceSummary.raceLengthLaps, lastLap, 1);
  }, [raceSummary]);

  /** Per-lap field median, keyed by lap number — used both for the timeline's
   *  reference line and for per-lap deltas in its tooltip. */
  const fieldMedianByLap = useMemo(() => {
    const map = new Map<number, number>();
    for (const p of raceSummary?.paceVsField ?? []) {
      if (p.fieldMedianLapTimeMs !== undefined) map.set(p.lapNumber, p.fieldMedianLapTimeMs);
    }
    return map;
  }, [raceSummary]);

  const timelineLaps = useMemo<PaceLapPoint[]>(
    () =>
      filteredOurLaps
        .filter((l) => l.lapTimeMs > 0)
        .map((l) => {
          const fieldMedianMs = fieldMedianByLap.get(l.lapNumber);
          return {
            lapNumber: l.lapNumber,
            driverName: l.driverName,
            lapTimeSeconds: l.lapTimeMs / 1000,
            pitAffected: l.pitAffected === true || l.pitIn === true || l.pitOut === true,
            trackPosition: l.trackPositionAtLap,
            deltaSeconds:
              fieldMedianMs !== undefined ? (l.lapTimeMs - fieldMedianMs) / 1000 : undefined,
          };
        }),
    [filteredOurLaps, fieldMedianByLap],
  );

  /** Trend line over the scatter. Computed from the FILTERED laps so it tracks
   *  the driver chips and the clean-laps toggle, and excludes pit laps — a
   *  30-second in-lap would drag the trend for no pace-related reason. */
  const smoothedPace = useMemo(
    () =>
      computeSmoothedPace(
        filteredOurLaps.filter(
          (l) => !(l.pitAffected === true || l.pitIn === true || l.pitOut === true),
        ),
      ).map((p) => ({ lapNumber: p.lapNumber, lapTimeSeconds: p.smoothedLapTimeMs / 1000 })),
    [filteredOurLaps],
  );

  const fieldMedianLine = useMemo(
    () =>
      [...fieldMedianByLap.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([lapNumber, ms]) => ({ lapNumber, lapTimeSeconds: ms / 1000 })),
    [fieldMedianByLap],
  );

  const trackPositionChartData = useMemo(
    () =>
      filteredOurLaps
        .filter((l) => l.trackPositionAtLap !== undefined)
        .map((l) => {
          const row: { lapNumber: number } & Record<string, number | null> = {
            lapNumber: l.lapNumber,
          };
          for (const name of visibleDriverNames) row[name] = null;
          row[l.driverName] = l.trackPositionAtLap!;
          return row;
        }),
    [filteredOurLaps, visibleDriverNames],
  );

  const gapChartData = useMemo(() => {
    if (!raceSummary) return [];
    return raceSummary.gapTrend.map((p) => ({
      lapNumber: p.lapNumber,
      gapSeconds: p.gapToLeaderMs !== undefined ? p.gapToLeaderMs / 1000 : null,
    }));
  }, [raceSummary]);

  const paceVsFieldChartData = useMemo(() => {
    if (!raceSummary) return [];
    const visibleLapNumbers = new Set(filteredOurLaps.map((l) => l.lapNumber));
    return raceSummary.paceVsField
      .filter((p) => visibleLapNumbers.has(p.lapNumber))
      .map((p) => ({
        lapNumber: p.lapNumber,
        deltaSeconds: p.deltaMs !== undefined ? p.deltaMs / 1000 : null,
        pitAffected: p.pitAffected,
      }));
  }, [raceSummary, filteredOurLaps]);

  const visibleStints = useMemo(
    () => raceSummary?.positionStints.filter((s) => !hiddenDrivers.has(s.driverName)) ?? [],
    [raceSummary, hiddenDrivers],
  );

  const standings = useMemo(() => {
    if (!raceSummary) return [];
    return [raceSummary.ourTeam, ...raceSummary.fieldResults].sort(
      (a, b) => a.finishPosition - b.finishPosition,
    );
  }, [raceSummary]);

  const bestLapMs = useMemo(() => {
    const times = (raceSummary?.ourTeam.drivers ?? [])
      .map((d) => d.bestLapTimeMs)
      .filter((t) => t > 0);
    return times.length > 0 ? Math.min(...times) : 0;
  }, [raceSummary]);

  // ---- Upload stage: shown until an iRacing export is loaded -----------------

  const dropSlots: DropSlot[] = [
    {
      key: "json",
      label: "iRacing lap chart",
      requirement: "Required · .json",
      fileName: iracingFileName,
    },
    {
      key: "csv",
      label: "Garage 61 export",
      requirement: "Optional · .csv",
      fileName: garage61FileName,
    },
    {
      key: "event",
      label: "iRacing event result",
      requirement: "Optional · .json",
      fileName: eventResultFileName,
    },
  ];

  if (!raw) {
    return (
      <>
        <AppHeader title="Race Analysis" context="Post-race" />
        <DropStage
          flag="/// Session data required"
          heading="Drop your race data"
          blurb="Drag the files anywhere onto this page. The iRacing lap chart is the backbone; the Garage 61 export adds fuel, weather and sectors, and the iRacing event result adds driver ratings and Strength of Field."
          slots={dropSlots}
          accept=".json,.csv"
          onFiles={handleFiles}
          error={error}
        />
      </>
    );
  }

  return (
    <>
      <AppHeader title="Race Analysis" context={raceSummary?.ourTeam.teamName ?? "Select a team"}>
        {teams.length > 0 && (
          <Select
            value={selectedTeamId === null ? "" : String(selectedTeamId)}
            onChange={(v) => setSelectedTeamId(v ? Number(v) : null)}
            ariaLabel="Which team is yours?"
            className="max-w-[220px]"
          >
            <option value="">Select a team…</option>
            {teams.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.teamName} ({t.carClassName})
              </option>
            ))}
          </Select>
        )}
        {allDriverNames.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {allDriverNames.map((name) => (
              <Chip
                key={name}
                label={name}
                color={colorFor(name)}
                active={!hiddenDrivers.has(name)}
                onToggle={() =>
                  setHiddenDrivers((prev) => {
                    const next = new Set(prev);
                    if (next.has(name)) next.delete(name);
                    else next.add(name);
                    return next;
                  })
                }
              />
            ))}
          </div>
        )}
        {raceSummary && (
          <Toggle
            label="Clean laps only"
            active={cleanLapsOnly}
            onToggle={() => setCleanLapsOnly((v) => !v)}
          />
        )}
      </AppHeader>

      <div className="mx-auto w-full max-w-[1320px] px-5 pb-20">
        {(error || summaryError) && (
          <div className="mt-5 rounded border border-line2 border-l-[3px] border-l-danger bg-panel px-4 py-3">
            <span className="font-display text-sm uppercase tracking-[0.08em] text-danger">
              Problem
            </span>
            <p className="mt-1 text-[13px] text-muted">{error ?? summaryError}</p>
          </div>
        )}

        <div
          className={`mt-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded border bg-panel px-4 py-3 transition-colors ${
            isDragging ? "border-amber" : "border-line"
          }`}
        >
          <span className="flex items-baseline gap-2">
            <span className="font-display text-[11px] uppercase tracking-[0.1em] text-faint">
              iRacing lap chart
            </span>
            <span className="font-mono text-[11px] text-pgreen">{iracingFileName}</span>
          </span>

          <FileUploadButton
            label="Garage 61 export"
            accept=".csv"
            fileName={garage61FileName}
            onFileSelected={(file) => handleFiles([file])}
            onClear={clearGarage61File}
            resetKey={garage61ResetKey}
            buttonLabel={garage61FileName ? "Replace" : "Add CSV"}
          />

          <FileUploadButton
            label="Event result"
            accept=".json"
            fileName={eventResultFileName}
            onFileSelected={(file) => handleFiles([file])}
            onClear={clearEventResult}
            resetKey={eventResultResetKey}
            buttonLabel={eventResultFileName ? "Replace" : "Add JSON"}
          />

          <div className="flex-1" />
          <span className="text-[11px] text-faint">
            {isDragging ? "Drop to load…" : "Or drop a file anywhere on this page."}
          </span>
        </div>

        {subsessionMismatch && (
          <div className="mt-3 rounded border border-line2 border-l-[3px] border-l-danger bg-panel px-4 py-3">
            <span className="font-display text-sm uppercase tracking-[0.08em] text-danger">
              Different race
            </span>
            <p className="mt-1 text-[13px] text-muted">
              The event result is for subsession{" "}
              <span className="font-mono">{eventResult?.data.subsession_id}</span> but the lap chart
              is subsession <span className="font-mono">{raw?.subsession_id}</span>. Ratings and
              Strength of Field below therefore describe a different race than the laps — clear it,
              or treat that data as unreliable.
            </p>
          </div>
        )}

        {garage61UnmatchedCount !== null && garage61UnmatchedCount > 0 && (
          <div className="mt-3 rounded border border-line2 border-l-[3px] border-l-amber bg-panel px-4 py-3">
            <span className="font-display text-sm uppercase tracking-[0.08em] text-amber">
              Partial merge
            </span>
            <p className="mt-1 text-[13px] text-muted">
              {garage61UnmatchedCount} Garage61 row(s) couldn&apos;t be matched to a driver in the
              iRacing export — most likely a Garage61 nickname that differs from the iRacing name.
              That data was skipped rather than misattributed.
            </p>
          </div>
        )}

        {!raceSummary && !summaryError && (
          <p className="mt-8 text-muted">
            Pick your team from the selector in the header to build the dashboard.
          </p>
        )}

        {raceSummary && (
          <>
            <section className="mt-8">
              <SectionHeading
                eyebrow="/// Result"
                title={raceSummary.ourTeam.teamName}
                tagline={[
                  `P${raceSummary.ourTeam.finishPosition + 1} overall`,
                  raceSummary.ourTeam.carClassName,
                  raceSummary.ourTeam.carName,
                  // Only available with the event_result upload — the lap chart
                  // carries no track name.
                  raceSummary.eventMeta &&
                    `${raceSummary.eventMeta.trackName}${
                      raceSummary.eventMeta.trackConfig
                        ? ` (${raceSummary.eventMeta.trackConfig})`
                        : ""
                    }`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              />
              <div className="mt-4">
                <KpiStrip items={kpiItems} />
              </div>
            </section>

            <section className="mt-11">
              <SectionHeading
                eyebrow="01 · Drivers"
                title="Driver report card"
                tagline="pace and consistency in the car"
                note={
                  <>
                    <b className="text-muted">σ</b> is the standard deviation of a driver&apos;s lap
                    times — the consistency measure; lower is steadier.{" "}
                    <b className="text-muted">Top 10%</b> averages only their fastest tenth of laps,
                    which strips out traffic and pit cycles to show raw potential.{" "}
                    <span className="text-purple">Purple</span> marks the team&apos;s best lap.
                  </>
                }
              />
              <Panel className="mt-3.5">
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th align="left">Driver</Th>
                        {raceSummary.driverRatings && (
                          <>
                            <Th align="left">Licence</Th>
                            <Th>iRating</Th>
                          </>
                        )}
                        <Th>Laps</Th>
                        <Th>Best</Th>
                        <Th>Avg</Th>
                        <Th>Median</Th>
                        <Th>σ</Th>
                        <Th>Top 10%</Th>
                        <Th>Inc</Th>
                        <Th>Stints</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {raceSummary.ourTeam.drivers.map((d) => {
                        const rating =
                          d.custId !== undefined
                            ? raceSummary.driverRatings?.get(d.custId)
                            : undefined;
                        return (
                        <Tr key={d.driverName}>
                          <Td align="left" className={hiddenDrivers.has(d.driverName) ? "text-faint" : ""}>
                            <Swatch color={colorFor(d.driverName)} />
                            {d.driverName}
                            {hiddenDrivers.has(d.driverName) && (
                              <span className="ml-2">
                                <Tag>hidden</Tag>
                              </span>
                            )}
                          </Td>
                          {raceSummary.driverRatings && (
                            <>
                              <Td align="left" className="text-muted">
                                {rating?.license ?? "–"}
                              </Td>
                              <Td>
                                {rating?.iRatingBefore ?? "–"}
                                {rating?.iRatingChange !== undefined && (
                                  <span
                                    className={
                                      rating.iRatingChange > 0
                                        ? "ml-1.5 text-pgreen"
                                        : rating.iRatingChange < 0
                                          ? "ml-1.5 text-danger"
                                          : "ml-1.5 text-faint"
                                    }
                                  >
                                    {rating.iRatingChange > 0 ? "+" : ""}
                                    {rating.iRatingChange}
                                  </span>
                                )}
                              </Td>
                            </>
                          )}
                          <Td>{d.lapsCompleted}</Td>
                          <Td className={d.bestLapTimeMs === bestLapMs ? "text-purple font-semibold" : ""}>
                            {formatLapTime(d.bestLapTimeMs)}
                          </Td>
                          <Td>{formatLapTime(d.averageLapTimeMs)}</Td>
                          <Td>{formatLapTime(d.medianLapTimeMs)}</Td>
                          <Td>{formatSeconds(d.stdDevMs)}</Td>
                          <Td>{formatLapTime(d.top10PctAvgMs)}</Td>
                          <Td className={d.incidentCount > 0 ? "text-danger" : "text-faint"}>
                            {d.incidentCount}
                          </Td>
                          <Td className={d.stints.length === 0 ? "text-faint" : ""}>
                            {d.stints.length > 0 ? d.stints.length : "n/a"}
                          </Td>
                        </Tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </TableWrap>
                {raceSummary.ourTeam.drivers.some((d) => d.stints.length === 0) && (
                  <p className="mt-3 text-[11px] text-faint">
                    &quot;n/a&quot; stints means no Garage61 data matched that driver&apos;s laps —
                    the iRacing export alone carries no fuel or pit signal.
                  </p>
                )}
              </Panel>
            </section>

            <section className="mt-11">
              <SectionHeading
                eyebrow="02 · Session"
                title="Race timeline"
                tagline="every lap we ran"
                note={
                  <>
                    One point per lap, coloured by who was driving.{" "}
                    <b className="text-muted">Our pace</b> is a rolling median over ±5 laps — the
                    trend through the noise. The <b className="text-muted">field median</b> is the
                    reference that makes it readable: a rise our line shows{" "}
                    <i>and the field&apos;s line shows too</i> is the track or the weather, not us.
                    Hollow <span className="text-amber">amber diamonds</span> are pit laps, excluded
                    from the trend. Drag below the chart to zoom.
                  </>
                }
              />
              <Panel className="mt-3.5">
                <PaceOverTimeChart
                  driverNames={visibleDriverNames}
                  laps={timelineLaps}
                  smoothed={smoothedPace}
                  fieldMedian={fieldMedianLine}
                  maxLap={maxLap}
                />
              </Panel>
            </section>

            <section className="mt-11">
              <SectionHeading
                eyebrow="03 · Position"
                title="Track position"
                tagline="where the pace actually put us"
                note="Sawteeth are pit cycles — the car climbs while others stop, then drops back as they rejoin. The floor of each cycle is the honest signal; the stint table below strips the noise out entirely."
              />
              <Panel className="mt-3.5">
                <TrackPositionChart
                  driverNames={visibleDriverNames}
                  data={trackPositionChartData}
                  maxLap={maxLap}
                />
              </Panel>
            </section>

            <section className="mt-11">
              <SectionHeading
                eyebrow="04 · Strategy"
                title="Stints"
                tagline="who was in the car, and what it cost"
                note="Comparing position at the two stint boundaries — just after our out-lap against just before our next in-lap — sidesteps the pit-cycle sawtooth, because both endpoints are green-flag-running snapshots. Available without a Garage61 upload: it only needs track position."
              />
              <Panel className="mt-3.5">
                <PanelHeading
                  title="Timeline of stints"
                  hint="One bar per stint, coloured by driver. Hover for detail."
                />
                <StintGanttChart
                  driverNames={visibleDriverNames}
                  positionStints={visibleStints}
                  raceLengthLaps={raceSummary.raceLengthLaps}
                />
              </Panel>
              <Panel className="mt-4">
                <PanelHeading
                  title="Net position per stint"
                  hint="Did we actually gain ground once the pit cycle is factored out?"
                />
                <TableWrap>
                  <Table>
                    <thead>
                      <tr>
                        <Th align="left">#</Th>
                        <Th align="left">Driver</Th>
                        <Th align="left">Laps</Th>
                        <Th>Start</Th>
                        <Th>End</Th>
                        <Th>Net</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleStints.map((s) => (
                        <Tr key={s.stintNumber}>
                          <Td align="left">{s.stintNumber}</Td>
                          <Td align="left">
                            <Swatch color={colorFor(s.driverName)} />
                            {s.driverName}
                          </Td>
                          <Td align="left" className="text-muted">
                            {s.startLap}–{s.endLap}
                          </Td>
                          <Td>P{s.positionAtStart}</Td>
                          <Td>P{s.positionAtEnd}</Td>
                          <Td>
                            <Delta
                              value={s.netPositionChange}
                              format={(v) => `${v > 0 ? "+" : ""}${v}`}
                            />
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </Panel>
            </section>

            <section className="mt-11">
              <SectionHeading
                eyebrow="05 · Pace"
                title="Pace vs the field"
                tagline="quick relative to what?"
                note={
                  <>
                    Each lap read against the field&apos;s own median clean lap at that same lap
                    number — same car class, pit and incident laps excluded, smoothed over a few
                    laps. <span className="text-pgreen">Below zero</span> means we were quicker than
                    the field right then, not quicker than some fixed target, so an early-race lap is
                    fairly comparable to a 3am one. Our own pit laps are excluded from the line and
                    shown as <span className="text-amber">amber bands</span> — a pit stop being slow
                    isn&apos;t a pace signal, and leaving it in swamps the scale.
                  </>
                }
              />
              <Panel className="mt-3.5">
                <PaceVsFieldChart data={paceVsFieldChartData} maxLap={maxLap} />
              </Panel>

              {raceSummary.fieldStrength && raceSummary.fieldStrength.length > 0 && (
                <Panel className="mt-4">
                  <PanelHeading
                    title="Who you were racing"
                    hint="Average iRating of the drivers actually on track, lap by lap — the same set of cars the delta above is measured against."
                  />
                  <FieldStrengthChart
                    data={raceSummary.fieldStrength}
                    publishedStrengthOfField={raceSummary.eventMeta?.strengthOfField}
                    maxLap={maxLap}
                  />
                  <p className="mt-3 max-w-[104ch] text-[11px] leading-relaxed text-faint">
                    This is our own plain mean of the iRatings on track, not iRacing&apos;s Strength
                    of Field — iRacing appears to compute SoF at registration, and we can&apos;t
                    reproduce their published figure from the results file, so the dashed line shows
                    their number for reference rather than as something we derived. It moves for two
                    real reasons: cars retire, and in a team race the driver in each car swaps. One
                    caveat to read it with — late in a long race only cars on the leaders&apos; lap
                    count have recorded that lap, so the right-hand end over-represents the faster
                    cars.
                  </p>
                </Panel>
              )}
            </section>

            {raceSummary.ratingVsPace && raceSummary.ratingVsPace.length > 0 && (
              <section className="mt-11">
                <SectionHeading
                  eyebrow="06 · Ratings"
                  title="Pace against rating"
                  tagline="who punched above their weight"
                  note={
                    <>
                      One dot per driver in the class: how highly rated they were entering the race,
                      against how their pace actually came out. The y value is their{" "}
                      <b className="text-muted">median lap delta to the field median</b>, so it
                      already cancels out track evolution and time of day — a driver who only ran at
                      3am is measured against what the field did at 3am. The dashed line is what a
                      driver&apos;s rating predicted;{" "}
                      <span className="text-pgreen">above it is over-performing</span>. Quicker is
                      up, matching every other pace view here.
                      {raceSummary.ratingPaceTrend && (
                        <>
                          {" "}
                          In this race the field trend was{" "}
                          <b className="text-muted">
                            {(raceSummary.ratingPaceTrend.msPerIRatingPoint * 1000).toFixed(2)}s per
                            1000 iRating
                          </b>
                          .
                        </>
                      )}
                    </>
                  }
                />
                <Panel className="mt-3.5">
                  <RatingVsPaceChart
                    points={raceSummary.ratingVsPace}
                    trend={raceSummary.ratingPaceTrend}
                  />
                </Panel>
              </section>
            )}

            <section className="mt-11">
              <SectionHeading
                eyebrow="07 · Gap"
                title="Gap to leader"
                tagline="the raw scoreboard view"
                note="From iRacing's own per-lap interval. Breaks in the line are laps where we were a full lap down and iRacing reported a lap count instead of a time — the two aren't the same unit, so they aren't joined up."
              />
              <Panel className="mt-3.5">
                <GapTrendChart data={gapChartData} maxLap={maxLap} />
              </Panel>
            </section>

            <section className="mt-11">
              <SectionHeading
                eyebrow="08 · Field"
                title="Field standings"
                tagline="the whole entry list"
                note="Fuel, stint and pace-trend data only ever exists for your own team via the optional Garage61 upload — the iRacing export carries no fuel or pit signal for anyone else, so those columns are deliberately absent here rather than blank."
              />
              <Panel className="mt-3.5">
                <TableWrap maxHeight={540}>
                  <Table>
                    <thead>
                      <tr>
                        <Th align="left">Pos</Th>
                        <Th align="left">Team</Th>
                        <Th align="left">Class</Th>
                        <Th>Laps</Th>
                        <Th>Inc</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {standings.map((t) => (
                        <Tr key={t.teamId} highlight={t.teamId === raceSummary.ourTeam.teamId}>
                          <Td align="left">{t.finishPosition + 1}</Td>
                          <Td align="left">{t.teamName}</Td>
                          <Td align="left" className="text-muted">
                            {t.carClassName}
                          </Td>
                          <Td>{t.lapsCompleted}</Td>
                          <Td className={t.totalIncidents > 0 ? "" : "text-faint"}>
                            {t.totalIncidents}
                          </Td>
                        </Tr>
                      ))}
                    </tbody>
                  </Table>
                </TableWrap>
              </Panel>
            </section>
          </>
        )}
      </div>
    </>
  );
}
