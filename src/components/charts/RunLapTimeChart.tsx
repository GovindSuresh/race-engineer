"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { AXIS, C, GRID_BOTTOM_WITH_ZOOM, LEGEND, TOOLTIP, axisRows, dataZoom, lapAxis, rowValue, seriesColor } from "./chart-theme";
import { formatLapTime } from "@/lib/format";

export interface RunLapTimeSeries {
  /** Matches a key in each `data` row. */
  key: string;
  /** Legend/tooltip label, e.g. "Run 1" or "Run 1 — Alex" when a run has
   *  more than one driver. */
  label: string;
  /** Color identity follows the RUN (upload slot), not the driver or the
   *  series' position in this list — stable even if a slot is cleared. */
  colorIndex: number;
  /** True for the 2nd+ driver within the same run — same hue as the run,
   *  dashed to stay distinguishable without a second color dimension. */
  dashed?: boolean;
}

export interface RunLapTimeChartProps {
  series: RunLapTimeSeries[];
  /** One row per lap number; each series' key holds that driver's lap time
   *  in seconds for that lap, or null if they have no lap at that number. */
  data: Array<{ lapNumber: number } & Record<string, number | null>>;
  /** Last lap to show, so the axis ends at the real race/session distance
   *  instead of ECharts rounding up to a "nice" number and leaving dead
   *  space to the right. */
  maxLap: number;
}

export function RunLapTimeChart({ series, data, maxLap }: RunLapTimeChartProps) {
  const option = useMemo<EChartsOption>(
    () => ({
      grid: { left: 62, right: 20, top: series.length > 1 ? 30 : 14, bottom: GRID_BOTTOM_WITH_ZOOM },
      legend: series.length > 1 ? { ...LEGEND, data: series.map((s) => s.label) } : { show: false },
      tooltip: {
        ...TOOLTIP,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.line2 } },
        formatter: (params) => {
          const rows = axisRows(params);
          const lap = rows[0]?.axisValue;
          const body = rows
            .map((r) => ({ r, v: rowValue(r) }))
            .filter((x): x is { r: typeof x.r; v: number } => x.v !== null)
            .map(({ r, v }) => `${r.marker ?? ""}${r.seriesName} <b>${formatLapTime(v * 1000)}</b>`)
            .join("<br/>");
          return `Lap ${lap}<br/>${body}`;
        },
      },
      xAxis: lapAxis(maxLap),
      yAxis: {
        type: "value",
        scale: true,
        ...AXIS,
        axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => formatLapTime(v * 1000) },
      },
      dataZoom: dataZoom(),
      series: series.map((s) => ({
        name: s.label,
        type: "line" as const,
        showSymbol: false,
        connectNulls: false,
        lineStyle: {
          color: seriesColor(s.colorIndex),
          width: 1.8,
          type: s.dashed ? ("dashed" as const) : ("solid" as const),
        },
        itemStyle: { color: seriesColor(s.colorIndex) },
        data: data.map((row) => [row.lapNumber, row[s.key]] as [number, number | null]),
      })),
    }),
    [series, data, maxLap],
  );

  return <EChart option={option} height={340} ariaLabel="Lap times across the uploaded runs" />;
}
