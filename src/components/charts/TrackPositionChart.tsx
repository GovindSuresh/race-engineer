"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { AXIS, C, GRID_BOTTOM_WITH_ZOOM, LEGEND, TOOLTIP, axisRows, dataZoom, lapCategoryAxis, rowValue, seriesColor } from "./chart-theme";

export interface TrackPositionChartProps {
  /** Fixed order — colors are assigned by index, same convention as
   *  PaceOverTimeChart (don't re-sort based on current position/rank). */
  driverNames: string[];
  /** One row per lap; each driver's key holds their track position that
   *  lap, or null if they weren't driving. */
  data: Array<{ lapNumber: number } & Record<string, number | null>>;
  /** Last lap to show, so the axis ends at the real race/session distance
   *  instead of ECharts rounding up to a "nice" number and leaving dead
   *  space to the right. */
  maxLap: number;
}

export function TrackPositionChart({ driverNames, data, maxLap }: TrackPositionChartProps) {
  const option = useMemo<EChartsOption>(
    () => ({
      grid: { left: 54, right: 20, top: driverNames.length > 1 ? 30 : 14, bottom: GRID_BOTTOM_WITH_ZOOM },
      legend: driverNames.length > 1 ? { ...LEGEND, data: [...driverNames] } : { show: false },
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
            .map(({ r, v }) => `${r.marker ?? ""}${r.seriesName} <b>P${v}</b>`)
            .join("<br/>");
          return `Lap ${lap}<br/>${body}`;
        },
      },
      xAxis: lapCategoryAxis(maxLap),
      yAxis: {
        type: "value",
        // P1 belongs at the TOP — a lower position number is a better result,
        // so the axis runs backwards relative to a normal value axis.
        inverse: true,
        min: 1,
        minInterval: 1,
        ...AXIS,
        axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => `P${v}` },
      },
      dataZoom: dataZoom(1),
      series: driverNames.map((name, i) => ({
        name,
        type: "line" as const,
        // Position is a discrete state held for a whole lap, not a value that
        // slides continuously between laps — a step reads that honestly.
        step: "end" as const,
        showSymbol: false,
        connectNulls: false,
        lineStyle: { color: seriesColor(i), width: 1.8 },
        itemStyle: { color: seriesColor(i) },
        data: data.map((row) => [row.lapNumber, row[name]] as [number, number | null]),
      })),
    }),
    [driverNames, data, maxLap],
  );

  return (
    <EChart
      option={option}
      height={300}
      ariaLabel="Track position lap by lap, per driver"
    />
  );
}
