import { seriesColor } from "./chart-theme";
import type { PositionStint } from "@/core";

export interface StintGanttChartProps {
  /** Fixed order — colors are assigned by index, same convention as every
   *  other chart on this page (keeps one driver's color consistent
   *  across pace/position/gantt views). */
  driverNames: string[];
  positionStints: PositionStint[];
  raceLengthLaps: number;
}

/** A pit-to-pit stint timeline, one row per driver — not a Recharts chart,
 *  since Recharts has no native "range bar" primitive and forcing one
 *  through its stacked-bar tricks would be more fragile than a handful of
 *  absolutely-positioned divs. Built on PositionStint rather than the
 *  fuel-based Stint type so it renders even without a Garage61 upload. */
export function StintGanttChart({ driverNames, positionStints, raceLengthLaps }: StintGanttChartProps) {
  const totalLaps = Math.max(raceLengthLaps, 1);

  return (
    <div className="chart-root flex flex-col gap-2">
      {driverNames.map((name, i) => {
        const stints = positionStints.filter((s) => s.driverName === name);
        return (
          <div key={name} className="flex items-center gap-3">
            <div
              className="w-32 shrink-0 truncate text-sm font-medium"
              style={{ color: seriesColor(i) }}
            >
              {name}
            </div>
            <div className="relative h-6 flex-1 rounded bg-zinc-100 dark:bg-zinc-800">
              {stints.map((s) => {
                const leftPct = (s.startLap / totalLaps) * 100;
                const widthPct = Math.max(((s.endLap - s.startLap) / totalLaps) * 100, 0.4);
                const sign = s.netPositionChange > 0 ? "+" : "";
                return (
                  <div
                    key={s.stintNumber}
                    className="absolute top-0 h-full rounded"
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: seriesColor(i),
                    }}
                    title={
                      `Stint ${s.stintNumber} · laps ${s.startLap}–${s.endLap} · ` +
                      `P${s.positionAtStart} → P${s.positionAtEnd} (${sign}${s.netPositionChange})`
                    }
                  />
                );
              })}
            </div>
          </div>
        );
      })}
      <div className="flex justify-between pl-[8.75rem] text-xs text-zinc-500 dark:text-zinc-400">
        <span>Lap 1</span>
        <span>Lap {totalLaps}</span>
      </div>
    </div>
  );
}
