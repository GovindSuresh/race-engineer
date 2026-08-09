"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { AXIS, C, GRID_BOTTOM_WITH_ZOOM, TOOLTIP, axisRows, dataZoom, lapAxis, rowValue, seriesColor } from "./chart-theme";

export interface GapTrendChartProps {
  /** One row per lap our team appears in. `gapSeconds` is null for laps
   *  where iRacing reported a laps-down count instead of a time gap (the
   *  car was lapped) — rendered as a break in the line rather than
   *  connecting through, since the two aren't the same unit. */
  data: Array<{ lapNumber: number; gapSeconds: number | null }>;
  /** Last lap to show, so the axis ends at the real race/session distance
   *  instead of ECharts rounding up to a "nice" number and leaving dead
   *  space to the right. */
  maxLap: number;
}

export function GapTrendChart({ data, maxLap }: GapTrendChartProps) {
  const option = useMemo<EChartsOption>(
    () => ({
      grid: { left: 62, right: 20, top: 14, bottom: GRID_BOTTOM_WITH_ZOOM },
      tooltip: {
        ...TOOLTIP,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.line2 } },
        formatter: (params) => {
          const rows = axisRows(params);
          const lap = rows[0]?.axisValue;
          const v = rows[0] ? rowValue(rows[0]) : null;
          const body =
            v === null
              ? `<span style="color:${C.faint}">lapped (no time gap)</span>`
              : `<b>${v.toFixed(1)}s</b>`;
          return `Lap ${lap}<br/>${body}`;
        },
      },
      xAxis: lapAxis(maxLap),
      yAxis: {
        type: "value",
        scale: true,
        ...AXIS,
        axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => `${v.toFixed(0)}s` },
      },
      dataZoom: dataZoom(),
      series: [
        {
          name: "Gap to leader",
          type: "line" as const,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { color: seriesColor(0), width: 1.8 },
          itemStyle: { color: seriesColor(0) },
          data: data.map((d) => [d.lapNumber, d.gapSeconds] as [number, number | null]),
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: C.line2, width: 1, type: "solid" },
            data: [{ yAxis: 0 }],
          },
        },
      ],
    }),
    [data, maxLap],
  );

  return <EChart option={option} height={280} ariaLabel="Gap to the race leader, lap by lap" />;
}
