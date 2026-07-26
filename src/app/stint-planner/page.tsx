"use client";

import { useState } from "react";
import {
  deriveStints,
  computeStintPaceTrend,
  computeFuelBurnRate,
  garage61OnlyToLapRecords,
  parseGarage61Csv,
  type Stint,
} from "@/core";
import { formatLapTime } from "@/lib/format";
import { SectionHeading } from "@/components/SectionHeading";
import { Panel } from "@/components/Panel";

interface DriverStints {
  driverName: string;
  stints: Stint[];
}

function formatTrend(msPerLap: number | undefined): string {
  if (msPerLap === undefined) return "n/a";
  const secPerLap = msPerLap / 1000;
  const sign = secPerLap > 0 ? "+" : "";
  return `${sign}${secPerLap.toFixed(2)}s/lap`;
}

export default function StintPlanner() {
  const [driverStints, setDriverStints] = useState<DriverStints[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError(null);
    setDriverStints(null);
    setFileName(file.name);

    try {
      const csvText = await file.text();
      const rows = parseGarage61Csv(csvText);
      const laps = garage61OnlyToLapRecords(rows, file.name);

      const lapsByDriver = new Map<string, typeof laps>();
      for (const lap of laps) {
        if (!lapsByDriver.has(lap.driverName)) lapsByDriver.set(lap.driverName, []);
        lapsByDriver.get(lap.driverName)!.push(lap);
      }

      const result: DriverStints[] = [...lapsByDriver.entries()].map(
        ([driverName, driverLaps]) => ({
          driverName,
          stints: deriveStints(driverLaps),
        }),
      );

      setDriverStints(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="flex min-h-screen flex-col gap-6 p-8">
      <SectionHeading as="h1" eyebrow="Practice session" title="Stint Planner" />

      <Panel className="w-fit">
        <label className="flex flex-col gap-2">
          <span className="text-sm text-zinc-500 dark:text-zinc-400">
            Upload a Garage61 CSV export
          </span>
          <input type="file" accept=".csv" onChange={handleFileChange} />
        </label>
        {fileName && (
          <p className="mt-2 font-mono text-sm text-zinc-500 dark:text-zinc-400">{fileName}</p>
        )}
      </Panel>

      {error && (
        <p className="text-sm text-red-600 dark:text-red-400">Couldn&apos;t parse this file: {error}</p>
      )}

      {driverStints?.map(({ driverName, stints }) => (
        <section key={driverName} className="flex flex-col gap-2">
          <SectionHeading title={driverName} />
          <Panel className="max-w-3xl overflow-x-auto">
            <table className="w-full min-w-max border-collapse text-sm">
              <thead>
                <tr className="border-b border-zinc-300 text-left dark:border-zinc-700">
                  <th className="py-1 pr-4">Stint</th>
                  <th className="py-1 pr-4">Laps</th>
                  <th className="py-1 pr-4 text-right">Avg</th>
                  <th className="py-1 pr-4 text-right">Best</th>
                  <th className="py-1 pr-4 text-right">Fuel</th>
                  <th className="py-1 pr-4 text-right">Burn rate</th>
                  <th className="py-1 pr-4 text-right">Pace trend</th>
                </tr>
              </thead>
              <tbody>
                {stints.map((stint) => {
                  const trend = computeStintPaceTrend(stint);
                  const burnRate = computeFuelBurnRate(stint);
                  return (
                    <tr
                      key={stint.stintNumber}
                      className="border-b border-zinc-200 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50"
                    >
                      <td className="py-1 pr-4 font-mono tabular-nums">{stint.stintNumber}</td>
                      <td className="py-1 pr-4 font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                        {stint.startLap}–{stint.endLap} ({stint.laps.length})
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {formatLapTime(stint.avgLapTimeMs)}
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {formatLapTime(stint.bestLapTimeMs)}
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {stint.fuelAtStart.toFixed(1)}L → {stint.fuelAtEnd.toFixed(1)}L
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {burnRate.toFixed(2)}L/lap
                      </td>
                      <td className="py-1 pr-4 text-right font-mono tabular-nums">
                        {formatTrend(trend)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        </section>
      ))}
    </div>
  );
}
