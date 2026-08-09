"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { AXIS, C, GRID_BOTTOM_WITH_ZOOM, LEGEND, TOOLTIP, dataZoom, lapCategoryAxis, seriesColor, verticalBands } from "./chart-theme";
import { formatLapTime } from "@/lib/format";

export interface PaceLapPoint {
  lapNumber: number;
  driverName: string;
  lapTimeSeconds: number;
  /** Marked with a hollow amber diamond rather than a filled dot. */
  pitAffected?: boolean;
  trackPosition?: number;
  /** Delta to the field median that lap, in seconds, when known. */
  deltaSeconds?: number;
}

export interface PaceOverTimeChartProps {
  /** Fixed order — colors are assigned by index, so this order must stay
   *  stable across re-renders (don't re-sort based on current pace/rank). */
  driverNames: string[];
  laps: PaceLapPoint[];
  /** Rolling-median trend of our own pace (see core's computeSmoothedPace). */
  smoothed?: Array<{ lapNumber: number; lapTimeSeconds: number }>;
  /** The field's own median pace per lap — the reference that makes the
   *  scatter interpretable: a rise our line shows AND the field's line shows
   *  is the track or the weather, not us. */
  fieldMedian?: Array<{ lapNumber: number; lapTimeSeconds: number }>;
  /** Last lap of the race, so the axis ends at the race distance instead of
   *  ECharts rounding up to a "nice" number and leaving dead space. */
  maxLap: number;
}

/** The race timeline: every lap as a point, coloured by who was driving, with
 *  the underlying pace drawn over it as a trend line.
 *
 *  Scatter rather than a line per driver because a line implies continuity
 *  between consecutive laps that isn't meaningful once traffic, pit stops and
 *  driver changes are in play — and with 600+ laps a per-driver line becomes a
 *  solid band of noise. The trend lines carry the shape; the dots carry the
 *  detail and the outliers. */
export function PaceOverTimeChart({
  driverNames,
  laps,
  smoothed,
  fieldMedian,
  maxLap,
}: PaceOverTimeChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const byDriver = new Map<string, PaceLapPoint[]>();
    for (const name of driverNames) byDriver.set(name, []);
    for (const lap of laps) byDriver.get(lap.driverName)?.push(lap);

    const pitLaps = laps.filter((l) => l.pitAffected);

    const series: NonNullable<EChartsOption["series"]> = driverNames.map((name, i) => ({
      name,
      type: "scatter" as const,
      symbolSize: 5,
      itemStyle: { color: seriesColor(i), opacity: 0.8 },
      data: (byDriver.get(name) ?? [])
        .filter((l) => !l.pitAffected)
        .map((l) => ({ value: [l.lapNumber, l.lapTimeSeconds], lap: l })),
    }));

    if (pitLaps.length > 0) {
      series.push({
        name: "Pit laps",
        type: "scatter",
        symbol: "diamond",
        symbolSize: 8,
        // Hollow, so a pit lap is legible as "flagged" rather than reading as
        // just another driver's colour.
        itemStyle: { color: "transparent", borderColor: C.amber, borderWidth: 1.5 },
        data: pitLaps.map((l) => ({ value: [l.lapNumber, l.lapTimeSeconds], lap: l })),
      });
    }

    if (fieldMedian && fieldMedian.length > 0) {
      series.push({
        name: "Field median",
        type: "line",
        showSymbol: false,
        z: 3,
        lineStyle: { color: C.faint, width: 1.4 },
        itemStyle: { color: C.faint },
        data: fieldMedian.map((p) => [p.lapNumber, p.lapTimeSeconds]),
      });
    }

    if (smoothed && smoothed.length > 0) {
      series.push({
        name: "Our pace",
        type: "line",
        showSymbol: false,
        z: 5,
        lineStyle: { color: C.text, width: 1.7 },
        itemStyle: { color: C.text },
        data: smoothed.map((p) => [p.lapNumber, p.lapTimeSeconds]),
        // Shade the pit laps behind everything, so the eye can tie a scatter
        // gap to the stop that caused it.
        markArea: { silent: true, data: verticalBands(pitLaps.map((l) => l.lapNumber), "rgba(255,178,36,.10)") },
      });
    }

    return {
      grid: { left: 62, right: 20, top: 30, bottom: GRID_BOTTOM_WITH_ZOOM },
      legend: { ...LEGEND, data: series.map((s) => (s as { name: string }).name) },
      tooltip: {
        ...TOOLTIP,
        // Item trigger, not axis: with several series stacked at one lap an
        // axis tooltip lists them all, when what's wanted is detail on the
        // single point under the cursor.
        trigger: "item",
        formatter: (params) => {
          const p = Array.isArray(params) ? params[0] : params;
          const lap = (p?.data as { lap?: PaceLapPoint } | undefined)?.lap;
          const value = (p?.value as [number, number] | undefined)?.[1];

          if (!lap) {
            // A trend-line point rather than a lap.
            return `${p?.seriesName}<br/>Lap ${(p?.value as [number, number])?.[0]} · <b>${formatLapTime((value ?? 0) * 1000)}</b>`;
          }

          const color = seriesColor(driverNames.indexOf(lap.driverName));
          const parts = [
            `<b style="color:${color}">${lap.driverName}</b> · lap ${lap.lapNumber}` +
              (lap.trackPosition !== undefined ? ` · P${lap.trackPosition}` : ""),
            `<b>${formatLapTime(lap.lapTimeSeconds * 1000)}</b>` +
              (lap.deltaSeconds !== undefined
                ? ` · field <span style="color:${lap.deltaSeconds < 0 ? C.pgreen : C.danger}">${
                    lap.deltaSeconds > 0 ? "+" : ""
                  }${lap.deltaSeconds.toFixed(2)}s</span>`
                : ""),
          ];
          if (lap.pitAffected) parts.push(`<span style="color:${C.amber}">pit lap</span>`);
          return parts.join("<br/>");
        },
      },
      xAxis: lapCategoryAxis(maxLap),
      yAxis: {
        type: "value",
        // Lap times cluster in a narrow band far from zero — without
        // scale:true ECharts anchors the axis at 0 and squashes the data
        // into the top few pixels.
        scale: true,
        ...AXIS,
        axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => formatLapTime(v * 1000) },
      },
      dataZoom: dataZoom(1),
      series,
    };
  }, [driverNames, laps, smoothed, fieldMedian, maxLap]);

  return (
    <EChart
      option={option}
      height={420}
      ariaLabel="Every lap of the race as a point coloured by driver, with our smoothed pace and the field's median pace"
    />
  );
}
