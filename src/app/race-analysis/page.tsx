"use client";

import { useMemo, useState } from "react";
import {
  buildRaceSummary,
  computeRaceKpis,
  listTeams,
  mergeGarage61IntoIracing,
  parseGarage61Csv,
  parseIracingJson,
  type LapRecord,
  type RawIracingExport,
  type TeamOption,
} from "@/core";
import { ChartTheme } from "@/components/charts/chart-theme";
import { KpiStrip, type KpiCardData } from "@/components/KpiStrip";
import { PaceOverTimeChart } from "@/components/charts/PaceOverTimeChart";
import { TrackPositionChart } from "@/components/charts/TrackPositionChart";
import { StintGanttChart } from "@/components/charts/StintGanttChart";
import { GapTrendChart } from "@/components/charts/GapTrendChart";
import { PaceVsFieldChart } from "@/components/charts/PaceVsFieldChart";
import { formatLapTime, formatSeconds } from "@/lib/format";
import { SectionHeading } from "@/components/SectionHeading";
import { Panel } from "@/components/Panel";

export default function RaceAnalysis() {
  const [raw, setRaw] = useState<RawIracingExport | null>(null);
  const [allLaps, setAllLaps] = useState<LapRecord[]>([]);
  const [teams, setTeams] = useState<TeamOption[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<number | null>(null);
  const [garage61UnmatchedCount, setGarage61UnmatchedCount] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleIracingFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setGarage61UnmatchedCount(null);
    setSelectedTeamId(null);

    try {
      const parsedRaw = JSON.parse(await file.text()) as RawIracingExport;
      const laps = parseIracingJson(parsedRaw);
      setRaw(parsedRaw);
      setAllLaps(laps);
      setTeams(listTeams(parsedRaw));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  async function handleGarage61File(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !raw) return;
    setError(null);

    try {
      const rows = parseGarage61Csv(await file.text());
      const { merged, unmatchedGarage61Rows } = mergeGarage61IntoIracing(allLaps, rows);
      setAllLaps(merged);
      setGarage61UnmatchedCount(unmatchedGarage61Rows.length);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  // Derived, not stored as its own state — computed fresh from raw/allLaps/
  // selectedTeamId each render. Bundled with its own error into one memo so
  // buildRaceSummary only runs once per input change (not once for the
  // value and again for the error).
  const { raceSummary, summaryError } = useMemo(() => {
    if (!raw || selectedTeamId === null) return { raceSummary: null, summaryError: null };
    try {
      return { raceSummary: buildRaceSummary(raw, allLaps, selectedTeamId), summaryError: null };
    } catch (err) {
      return {
        raceSummary: null,
        summaryError: err instanceof Error ? err.message : String(err),
      };
    }
  }, [raw, allLaps, selectedTeamId]);

  const kpiItems = useMemo<KpiCardData[]>(() => {
    if (!raceSummary) return [];
    const kpis = computeRaceKpis(raceSummary);
    return [
      {
        label: "Finish",
        value: `P${kpis.finishPosition}`,
        sublabel: `of ${kpis.fieldSize} · P${kpis.finishPositionInClass} of ${kpis.classSize} in class`,
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
      },
      { label: "Incidents", value: String(kpis.totalIncidents) },
      {
        label: "Pit stops",
        value: kpis.pitStopCount !== undefined ? String(kpis.pitStopCount) : "n/a",
        sublabel: kpis.pitStopCount === undefined ? "needs Garage61 upload" : undefined,
      },
      {
        label: "Fuel used",
        value:
          kpis.totalFuelUsedLiters !== undefined
            ? `${kpis.totalFuelUsedLiters.toFixed(1)} L`
            : "n/a",
        sublabel: kpis.totalFuelUsedLiters === undefined ? "needs Garage61 upload" : undefined,
      },
    ];
  }, [raceSummary]);

  const paceChartData = useMemo(() => {
    if (!raceSummary) return { driverNames: [], data: [] };
    const driverNames = raceSummary.ourTeam.drivers.map((d) => d.driverName);

    const rows = raceSummary.ourTeamLaps
      .filter((l) => l.lapTimeMs > 0)
      .map((l) => {
        const row: { lapNumber: number } & Record<string, number | null> = {
          lapNumber: l.lapNumber,
        };
        for (const name of driverNames) row[name] = null;
        row[l.driverName] = l.lapTimeMs / 1000;
        return row;
      });

    return { driverNames, data: rows };
  }, [raceSummary]);

  const trackPositionChartData = useMemo(() => {
    if (!raceSummary) return { driverNames: [], data: [] };
    const driverNames = raceSummary.ourTeam.drivers.map((d) => d.driverName);

    const rows = raceSummary.ourTeamLaps
      .filter((l) => l.trackPositionAtLap !== undefined)
      .map((l) => {
        const row: { lapNumber: number } & Record<string, number | null> = {
          lapNumber: l.lapNumber,
        };
        for (const name of driverNames) row[name] = null;
        row[l.driverName] = l.trackPositionAtLap!;
        return row;
      });

    return { driverNames, data: rows };
  }, [raceSummary]);

  const gapChartData = useMemo(() => {
    if (!raceSummary) return [];
    return raceSummary.gapTrend.map((p) => ({
      lapNumber: p.lapNumber,
      gapSeconds: p.gapToLeaderMs !== undefined ? p.gapToLeaderMs / 1000 : null,
    }));
  }, [raceSummary]);

  const paceVsFieldChartData = useMemo(() => {
    if (!raceSummary) return [];
    return raceSummary.paceVsField.map((p) => ({
      lapNumber: p.lapNumber,
      deltaSeconds: p.deltaMs !== undefined ? p.deltaMs / 1000 : null,
      pitAffected: p.pitAffected,
    }));
  }, [raceSummary]);

  const standings = useMemo(() => {
    if (!raceSummary) return [];
    return [raceSummary.ourTeam, ...raceSummary.fieldResults].sort(
      (a, b) => a.finishPosition - b.finishPosition,
    );
  }, [raceSummary]);

  return (
    <div className="flex min-h-screen flex-col gap-6 p-8">
      <SectionHeading as="h1" eyebrow="Post-race" title="Race Analysis" />

      <Panel className="flex w-fit flex-col gap-4 sm:flex-row">
        <label className="flex w-fit flex-col gap-2">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Upload an iRacing race export (required)
          </span>
          <input type="file" accept=".json" onChange={handleIracingFile} />
        </label>
        <label className="flex w-fit flex-col gap-2">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Upload a Garage61 CSV (optional — enriches your team&apos;s fuel/stint data)
          </span>
          <input type="file" accept=".csv" onChange={handleGarage61File} disabled={!raw} />
        </label>
      </Panel>

      {(error || summaryError) && (
        <p className="text-sm text-red-600 dark:text-red-400">{error ?? summaryError}</p>
      )}

      {garage61UnmatchedCount !== null && garage61UnmatchedCount > 0 && (
        <p className="text-sm text-amber-600 dark:text-amber-400">
          {garage61UnmatchedCount} Garage61 row(s) couldn&apos;t be matched to a driver in the
          iRacing export (likely a Garage61 nickname that doesn&apos;t match their iRacing name) —
          that data was skipped rather than misattributed.
        </p>
      )}

      {teams.length > 0 && (
        <label className="flex w-fit flex-col gap-2">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">Which team is yours?</span>
          <select
            value={selectedTeamId ?? ""}
            onChange={(e) => setSelectedTeamId(e.target.value ? Number(e.target.value) : null)}
            className="rounded border border-zinc-300 bg-white px-2 py-1 dark:border-zinc-700 dark:bg-zinc-900"
          >
            <option value="">Select a team…</option>
            {teams.map((t) => (
              <option key={t.teamId} value={t.teamId}>
                {t.teamName} ({t.carClassName})
              </option>
            ))}
          </select>
        </label>
      )}

      {raceSummary && (
        <>
          <section className="flex flex-col gap-3">
            <SectionHeading
              eyebrow="Team"
              title={`${raceSummary.ourTeam.teamName} — P${raceSummary.ourTeam.finishPosition + 1} overall`}
              subtitle={raceSummary.ourTeam.carClassName}
            />
            <KpiStrip items={kpiItems} />
            <Panel className="w-full max-w-3xl overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-300 text-left dark:border-zinc-700">
                    <th className="py-1 pr-4">Driver</th>
                    <th className="py-1 pr-4 text-right">Laps</th>
                    <th className="py-1 pr-4 text-right">Best</th>
                    <th className="py-1 pr-4 text-right">Avg</th>
                    <th className="py-1 pr-4 text-right">Median</th>
                    <th className="py-1 pr-4 text-right">Std dev</th>
                    <th className="py-1 pr-4 text-right">Top 10%</th>
                    <th className="py-1 pr-4 text-right">Incidents</th>
                    <th className="py-1 pr-4 text-right">Stints</th>
                  </tr>
                </thead>
                <tbody>
                  {raceSummary.ourTeam.drivers.map((d) => (
                    <tr
                      key={d.driverName}
                      className="border-b border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                    >
                      <td className="py-1 pr-4">{d.driverName}</td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {d.lapsCompleted}
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {formatLapTime(d.bestLapTimeMs)}
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {formatLapTime(d.averageLapTimeMs)}
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {formatLapTime(d.medianLapTimeMs)}
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {formatSeconds(d.stdDevMs)}
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {formatLapTime(d.top10PctAvgMs)}
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {d.incidentCount}
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {d.stints.length > 0 ? d.stints.length : "n/a"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {raceSummary.ourTeam.drivers.some((d) => d.stints.length === 0) && (
                <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                  &quot;n/a&quot; stints means no Garage61 data matched that driver&apos;s laps —
                  upload a Garage61 CSV to see stint/fuel data for a driver.
                </p>
              )}
            </Panel>
          </section>

          <ChartTheme />

          <section className="flex flex-col gap-2">
            <SectionHeading eyebrow="Pace" title="Pace over time" />
            <Panel>
              <PaceOverTimeChart
                driverNames={paceChartData.driverNames}
                data={paceChartData.data}
              />
            </Panel>
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeading eyebrow="Position" title="Track position" />
            <Panel>
              <TrackPositionChart
                driverNames={trackPositionChartData.driverNames}
                data={trackPositionChartData.data}
              />
            </Panel>
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeading eyebrow="Strategy" title="Stint timeline" />
            <Panel>
              <StintGanttChart
                driverNames={trackPositionChartData.driverNames}
                positionStints={raceSummary.positionStints}
                raceLengthLaps={raceSummary.raceLengthLaps}
              />
            </Panel>
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeading
              eyebrow="Strategy"
              title="Position by stint"
              subtitle="Position at the start vs. end of each pit-to-pit stint — a fairer read on whether we
              actually gained ground than the sawtooth above, since it skips past the temporary
              swings caused by pit-timing offsets against the rest of the field (dropping places
              the lap we stop and others haven't yet, then climbing back as they cycle through).
              Available without a Garage61 upload — it only needs track position, which the
              iRacing export always has."
            />
            <Panel className="w-full max-w-2xl overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-300 text-left dark:border-zinc-700">
                    <th className="py-1 pr-4">Stint</th>
                    <th className="py-1 pr-4">Driver</th>
                    <th className="py-1 pr-4">Laps</th>
                    <th className="py-1 pr-4 text-right">Start</th>
                    <th className="py-1 pr-4 text-right">End</th>
                    <th className="py-1 pr-4 text-right">Net change</th>
                  </tr>
                </thead>
                <tbody>
                  {raceSummary.positionStints.map((s) => (
                    <tr
                      key={s.stintNumber}
                      className="border-b border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                    >
                      <td className="py-1 pr-4 font-mono tabular-nums">{s.stintNumber}</td>
                      <td className="py-1 pr-4">{s.driverName}</td>
                      <td className="py-1 pr-4 font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                        {s.startLap}–{s.endLap}
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        P{s.positionAtStart}
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        P{s.positionAtEnd}
                      </td>
                      <td
                        className={
                          s.netPositionChange > 0
                            ? "py-1 pr-4 text-right font-mono tabular-nums text-green-600 dark:text-green-400"
                            : s.netPositionChange < 0
                              ? "py-1 pr-4 text-right font-mono tabular-nums text-red-600 dark:text-red-400"
                              : "py-1 pr-4 text-right font-mono tabular-nums text-zinc-500 dark:text-zinc-400"
                        }
                      >
                        {s.netPositionChange > 0 ? "+" : ""}
                        {s.netPositionChange}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeading eyebrow="Gap" title="Gap to leader" />
            <Panel>
              <GapTrendChart data={gapChartData} />
            </Panel>
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeading
              eyebrow="Pace"
              title="Pace vs. the field"
              subtitle="Each lap read against the field's own median clean lap at that same lap number
              (same car class, pit/incident-affected laps excluded, smoothed over a few laps) —
              below zero means we were quicker than the field right then, not just quicker than
              some fixed target. This cancels out track evolution and weather, so an early-race
              lap is fairly comparable to a late-race one. Our own pit in/out laps are excluded
              from the line too (dashed markers show where they happened) — a pit stop being
              slower isn't a pace signal, and leaving it in would swamp the scale for everything
              else."
            />
            <Panel>
              <PaceVsFieldChart data={paceVsFieldChartData} />
            </Panel>
          </section>

          <section className="flex flex-col gap-2">
            <SectionHeading
              eyebrow="Field"
              title="Field standings"
              subtitle="Fuel, stint, and pace-trend data is only ever available for your own team (via the
              optional Garage61 upload) — the iRacing export alone has no fuel/pit signal for
              other teams, so those columns are intentionally absent here, not missing/broken."
            />
            <Panel className="w-full max-w-3xl overflow-x-auto">
              <table className="w-full min-w-max border-collapse text-sm">
                <thead>
                  <tr className="border-b border-zinc-300 text-left dark:border-zinc-700">
                    <th className="py-1 pr-4">Pos</th>
                    <th className="py-1 pr-4">Team</th>
                    <th className="py-1 pr-4">Class</th>
                    <th className="py-1 pr-4 text-right">Incidents</th>
                  </tr>
                </thead>
                <tbody>
                  {standings.map((t) => (
                    <tr
                      key={t.teamId}
                      className={
                        t.teamId === raceSummary.ourTeam.teamId
                          ? "border-b border-zinc-200 bg-zinc-100 font-medium dark:border-zinc-800 dark:bg-zinc-800"
                          : "border-b border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                      }
                    >
                      <td className="py-1 pr-4 font-mono tabular-nums">{t.finishPosition + 1}</td>
                      <td className="py-1 pr-4">{t.teamName}</td>
                      <td className="py-1 pr-4">{t.carClassName}</td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {t.totalIncidents}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}
