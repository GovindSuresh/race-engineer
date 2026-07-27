"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { AXIS, C, LEGEND, TOOLTIP, seriesColor } from "./chart-theme";
import type { RatingVsPacePoint } from "@/core";

export interface RatingVsPaceChartProps {
  points: RatingVsPacePoint[];
  /** Least-squares fit through the field, drawn as the "expected pace for this
   *  rating" line. Undefined when too few drivers to fit one. */
  trend?: { msPerIRatingPoint: number; interceptMs: number };
}

/** iRating against actual pace, one dot per driver in the class — the chart
 *  that answers "who punched above their rating".
 *
 *  The y value is each driver's median lap delta to the field median at the
 *  laps they drove, so it already cancels out track evolution and time of day:
 *  a driver who only ran at 3am is measured against what the field did at 3am.
 *  Below the trend line = quicker than their rating predicted. */
export function RatingVsPaceChart({ points, trend }: RatingVsPaceChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const toPoint = (p: RatingVsPacePoint) => ({
      value: [p.iRating, p.medianDeltaMs / 1000] as [number, number],
      point: p,
    });

    const field = points.filter((p) => !p.isOurTeam).map(toPoint);
    const ours = points.filter((p) => p.isOurTeam).map(toPoint);

    const series: NonNullable<EChartsOption["series"]> = [
      {
        name: "Field",
        type: "scatter",
        symbolSize: 7,
        // Recessive: the field is context, our drivers are the subject.
        itemStyle: { color: C.faint, opacity: 0.65 },
        data: field,
      },
    ];

    if (trend) {
      const iRatings = points.map((p) => p.iRating);
      const minIr = Math.min(...iRatings);
      const maxIr = Math.max(...iRatings);
      const at = (ir: number) => (trend.interceptMs + trend.msPerIRatingPoint * ir) / 1000;
      series.push({
        name: "Expected for rating",
        type: "line",
        showSymbol: false,
        lineStyle: { color: C.muted, width: 1.4, type: "dashed" },
        itemStyle: { color: C.muted },
        data: [
          [minIr, at(minIr)],
          [maxIr, at(maxIr)],
        ],
        // Zero is the field's own pace — worth marking, since "level with the
        // field" is a distinct milestone from "as expected for your rating".
        markLine: {
          silent: true,
          symbol: "none",
          label: { show: false },
          lineStyle: { color: C.line2, width: 1 },
          data: [{ yAxis: 0 }],
        },
      });
    }

    if (ours.length > 0) {
      series.push({
        name: "Our team",
        type: "scatter",
        symbolSize: 12,
        // Ringed in the surface colour so an our-team dot stays readable even
        // when it lands on top of a field dot.
        itemStyle: { color: seriesColor(0), borderColor: C.panel, borderWidth: 1.5 },
        z: 10,
        data: ours,
      });
    }

    return {
      grid: { left: 62, right: 24, top: 30, bottom: 48 },
      legend: { ...LEGEND, data: series.map((s) => (s as { name: string }).name) },
      tooltip: {
        ...TOOLTIP,
        trigger: "item",
        formatter: (params) => {
          const p = Array.isArray(params) ? params[0] : params;
          const point = (p?.data as { point?: RatingVsPacePoint } | undefined)?.point;
          if (!point) {
            // The trend line itself.
            return `${p?.seriesName}`;
          }
          const deltaS = point.medianDeltaMs / 1000;
          const deltaColor = deltaS < 0 ? C.pgreen : C.danger;
          const lines = [
            `<b${point.isOurTeam ? ` style="color:${seriesColor(0)}"` : ""}>${point.driverName}</b>`,
            `<span style="color:${C.faint}">${point.teamName}</span>`,
            `iRating <b>${point.iRating}</b>`,
            `median delta <b style="color:${deltaColor}">${deltaS > 0 ? "+" : ""}${deltaS.toFixed(2)}s</b> · ${point.lapsCounted} laps`,
          ];
          if (trend) {
            const expected = (trend.interceptMs + trend.msPerIRatingPoint * point.iRating) / 1000;
            const vs = deltaS - expected;
            const label = vs < 0 ? "quicker than their rating predicts" : "slower than their rating predicts";
            lines.push(
              `<span style="color:${vs < 0 ? C.pgreen : C.danger}">${Math.abs(vs).toFixed(2)}s ${label}</span>`,
            );
          }
          return lines.join("<br/>");
        },
      },
      xAxis: {
        type: "value",
        scale: true,
        ...AXIS,
        name: "iRating entering the race",
        nameLocation: "middle",
        nameGap: 26,
        nameTextStyle: { color: C.faint, fontSize: 11 },
        splitLine: { show: false },
      },
      yAxis: {
        type: "value",
        scale: true,
        // Quicker-than-field is a BETTER result, so put it at the top —
        // otherwise the chart reads upside down against every other pace view.
        inverse: true,
        ...AXIS,
        axisLabel: {
          ...AXIS.axisLabel,
          formatter: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}s`,
        },
      },
      series,
    };
  }, [points, trend]);

  return (
    <EChart
      option={option}
      height={340}
      ariaLabel="Each driver's iRating plotted against their median lap time delta to the field"
    />
  );
}
