"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { AXIS, C, CATEGORY_LABEL, TOOLTIP, lapAxis, seriesColor } from "./chart-theme";
import type { PositionStint } from "@/core";

export interface StintGanttChartProps {
  /** Fixed order — colors are assigned by index, same convention as every
   *  other chart on this page (keeps one driver's color consistent
   *  across pace/position/gantt views). */
  driverNames: string[];
  positionStints: PositionStint[];
  raceLengthLaps: number;
}

/** A pit-to-pit stint timeline, one row per driver. Built on PositionStint
 *  rather than the fuel-based Stint type so it renders even without a
 *  Garage61 upload.
 *
 *  Uses an ECharts `custom` series: a range bar (one rect spanning two x
 *  values on a categorical y) isn't a built-in chart type in any library, but
 *  `renderItem` gives direct access to the coordinate system, so the bar is
 *  drawn from real axis coordinates and stays correct under resize — which is
 *  why this replaced the hand-positioned percentage-width divs it used to be. */
export function StintGanttChart({
  driverNames,
  positionStints,
  raceLengthLaps,
}: StintGanttChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const rows = positionStints.map((s) => ({
      // [driverIndex, startLap, endLap] — encoded positionally because
      // renderItem reads values by index, not by name.
      value: [driverNames.indexOf(s.driverName), s.startLap, s.endLap] as [number, number, number],
      stint: s,
    }));

    return {
      grid: { left: 110, right: 20, top: 12, bottom: 40 },
      tooltip: {
        ...TOOLTIP,
        formatter: (params) => {
          const p = Array.isArray(params) ? params[0] : params;
          const s = (p?.data as (typeof rows)[number] | undefined)?.stint;
          if (!s) return "";
          const i = driverNames.indexOf(s.driverName);
          const net = s.netPositionChange;
          const netColor = net > 0 ? C.pgreen : net < 0 ? C.danger : C.faint;
          const sign = net > 0 ? "+" : "";
          return [
            `<b style="color:${seriesColor(i)}">${s.driverName}</b> · stint ${s.stintNumber}`,
            `laps ${s.startLap}–${s.endLap} (${s.endLap - s.startLap} laps)`,
            `P${s.positionAtStart} → P${s.positionAtEnd} <b style="color:${netColor}">${sign}${net}</b>`,
          ].join("<br/>");
        },
      },
      xAxis: lapAxis(Math.max(raceLengthLaps, 1)),
      yAxis: {
        type: "category",
        data: [...driverNames],
        ...AXIS,
        splitLine: { show: false },
        axisLabel: CATEGORY_LABEL,
      },
      series: [
        {
          type: "custom" as const,
          // Tells ECharts which value indices map to which axis, so tooltips
          // and axis extents know the real span of each bar.
          encode: { x: [1, 2], y: 0 },
          renderItem: (params, api) => {
            const driverIndex = api.value(0) as number;
            const y = api.coord([0, driverIndex])[1];
            const x1 = api.coord([api.value(1) as number, 0])[0];
            const x2 = api.coord([api.value(2) as number, 0])[0];
            const height = 17;
            return {
              type: "rect",
              shape: {
                x: x1,
                y: y - height / 2,
                // A single-lap stint would otherwise render zero-width and
                // vanish; floor it at 2px so every stint stays visible.
                width: Math.max(x2 - x1, 2),
                height,
                r: 2,
              },
              style: { fill: seriesColor(driverIndex), opacity: 0.92 },
            };
          },
          data: rows,
        },
      ],
    };
  }, [driverNames, positionStints, raceLengthLaps]);

  return (
    <EChart
      option={option}
      height={Math.max(driverNames.length * 34 + 70, 170)}
      ariaLabel="Timeline of pit-to-pit stints, one row per driver"
    />
  );
}
