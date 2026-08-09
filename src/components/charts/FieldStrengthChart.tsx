"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { AXIS, C, GRID_BOTTOM_WITH_ZOOM, TOOLTIP, axisRows, dataZoom, lapCategoryAxis } from "./chart-theme";

export interface FieldStrengthChartProps {
  data: Array<{
    lapNumber: number;
    averageIRating: number;
    sampleSize: number;
    driversOnTrack: number;
  }>;
  /** iRacing's own published SoF for the event, drawn as a reference line so
   *  the moving on-track average can be read against the number iRacing
   *  actually assigned the race. */
  publishedStrengthOfField?: number;
  maxLap: number;
}

/** Average iRating of the drivers circulating at each lap — the field you were
 *  actually being measured against, as it changed through the race.
 *
 *  Its own chart rather than a second y-axis on the race timeline: a dual-axis
 *  chart invites reading the crossing point of two lines as meaningful when it
 *  is an artifact of the chosen scales. Sharing the x-axis and zoom instead
 *  keeps the laps aligned for comparison without implying a correlation. */
export function FieldStrengthChart({
  data,
  publishedStrengthOfField,
  maxLap,
}: FieldStrengthChartProps) {
  const option = useMemo<EChartsOption>(
    () => ({
      grid: { left: 62, right: 20, top: 14, bottom: GRID_BOTTOM_WITH_ZOOM },
      tooltip: {
        ...TOOLTIP,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.line2 } },
        formatter: (params) => {
          const rows = axisRows(params);
          const lap = Number(rows[0]?.axisValue);
          const point = data.find((d) => d.lapNumber === lap);
          if (!point) return `Lap ${lap}`;
          return [
            `Lap ${lap}`,
            `<b>${point.averageIRating}</b> avg iRating`,
            `<span style="color:${C.faint}">${point.driversOnTrack} cars on track · ${point.sampleSize} rated</span>`,
          ].join("<br/>");
        },
      },
      xAxis: lapCategoryAxis(maxLap),
      yAxis: {
        type: "value",
        // iRating sits in the thousands, so anchoring at zero would flatten the
        // whole signal into a thin band at the top.
        scale: true,
        ...AXIS,
        axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => String(Math.round(v)) },
      },
      dataZoom: dataZoom(1),
      series: [
        {
          name: "Avg iRating on track",
          type: "line" as const,
          showSymbol: false,
          lineStyle: { color: C.wet, width: 1.8 },
          itemStyle: { color: C.wet },
          data: data.map((d) => [d.lapNumber, d.averageIRating] as [number, number]),
          markLine:
            publishedStrengthOfField !== undefined
              ? {
                  silent: true,
                  symbol: "none",
                  lineStyle: { color: C.faint, width: 1, type: "dashed" },
                  label: {
                    formatter: `iRacing SoF ${publishedStrengthOfField}`,
                    color: C.faint,
                    fontSize: 10,
                    position: "insideEndTop",
                  },
                  data: [{ yAxis: publishedStrengthOfField }],
                }
              : undefined,
        },
      ],
    }),
    [data, publishedStrengthOfField, maxLap],
  );

  return (
    <EChart
      option={option}
      height={240}
      ariaLabel="Average iRating of drivers on track, lap by lap"
    />
  );
}
