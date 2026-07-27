"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { AXIS, C, GRID_BOTTOM_WITH_ZOOM, TOOLTIP, axisRows, dataZoom, lapAxis, seriesColor, verticalBands } from "./chart-theme";

export interface PaceVsFieldChartProps {
  /** One row per lap we completed. `deltaSeconds` is null both when the
   *  field didn't have enough clean samples at that lap number to trust a
   *  median, and when the lap itself was pit-affected (see
   *  PaceVsFieldPoint) — a pit in/out lap is tens of seconds slower for
   *  reasons that have nothing to do with race pace, so it's excluded from
   *  the line entirely rather than plotted as a misleading spike that also
   *  wrecks the y-axis scale for every other lap. `pitAffected` still marks
   *  where it happened, as a shaded band rather than a line point. */
  data: Array<{ lapNumber: number; deltaSeconds: number | null; pitAffected: boolean }>;
  /** Last lap to show, so the axis ends at the real race/session distance
   *  instead of ECharts rounding up to a "nice" number and leaving dead
   *  space to the right. */
  maxLap: number;
}

export function PaceVsFieldChart({ data, maxLap }: PaceVsFieldChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const pitLaps = data.filter((d) => d.pitAffected).map((d) => d.lapNumber);
    // One shaded band per pit-affected lap, drawn as a one-lap-wide column so
    // it reads as "this lap", not "from here on". Amber = the reserved
    // "flagged / excluded, not a data point" role.
    const pitBands = verticalBands(pitLaps, "rgba(255,178,36,.14)");

    return {
      grid: { left: 62, right: 20, top: 14, bottom: GRID_BOTTOM_WITH_ZOOM },
      tooltip: {
        ...TOOLTIP,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.line2 } },
        formatter: (params) => {
          const rows = axisRows(params);
          const lap = Number(rows[0]?.axisValue);
          const point = data.find((d) => d.lapNumber === lap);
          if (point?.pitAffected) {
            return `Lap ${lap}<br/><span style="color:${C.amber}">pit in/out lap — excluded from the pace line</span>`;
          }
          const v = point?.deltaSeconds;
          if (v == null) {
            return `Lap ${lap}<br/><span style="color:${C.faint}">no field data this lap</span>`;
          }
          const color = v < 0 ? C.pgreen : C.danger;
          return `Lap ${lap}<br/><b style="color:${color}">${v > 0 ? "+" : ""}${v.toFixed(2)}s</b> vs field median`;
        },
      },
      xAxis: lapAxis(maxLap),
      yAxis: {
        type: "value",
        scale: true,
        ...AXIS,
        axisLabel: {
          ...AXIS.axisLabel,
          formatter: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}s`,
        },
      },
      dataZoom: dataZoom(),
      series: [
        {
          name: "Delta to field",
          type: "line" as const,
          showSymbol: false,
          connectNulls: false,
          lineStyle: { color: seriesColor(0), width: 1.8 },
          itemStyle: { color: seriesColor(0) },
          data: data.map((d) => [d.lapNumber, d.deltaSeconds] as [number, number | null]),
          // Zero is the field's own pace, so it's the line that actually
          // matters on this chart — brighter than a normal gridline.
          markLine: {
            silent: true,
            symbol: "none",
            label: { show: false },
            lineStyle: { color: C.muted, width: 1 },
            data: [{ yAxis: 0 }],
          },
          markArea: { silent: true, data: pitBands },
        },
      ],
    };
  }, [data, maxLap]);

  return (
    <EChart
      option={option}
      height={280}
      ariaLabel="Our lap times relative to the field's median pace, lap by lap"
    />
  );
}
