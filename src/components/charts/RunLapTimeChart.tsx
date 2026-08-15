"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { AXIS, C, GRID_BOTTOM_WITH_ZOOM, LEGEND, MONO, TOOLTIP, axisRows, dataZoom, lapCategoryAxis, rowValue, runColor } from "./chart-theme";
import { formatLapTime } from "@/lib/format";

export interface RunLapTimeSeries {
  /** Matches a key in each `data` row. */
  key: string;
  /** Legend/tooltip label, e.g. "Run 1" or "Run 1 — Alex" when a run has
   *  more than one driver. */
  label: string;
  /** Run slot 0-3. Colour identity follows the RUN, not the driver or the
   *  series' position in this list — stable even if a slot is cleared. */
  slot: number;
  /** True for the 2nd+ driver within the same run — same hue as the run,
   *  dashed to stay distinguishable without a second color dimension. */
  dashed?: boolean;
  /** Lap number -> stint number, for this series only.
   *
   *  Stints are shown in the tooltip rather than drawn on the chart because
   *  every run has its OWN boundaries on a shared lap axis: four runs' worth
   *  of bands or dividers would overlap into noise, while the tooltip is
   *  already per-series and has room to say which stint a lap belongs to. */
  stintByLap?: Record<number, number>;
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
  const option = useMemo<EChartsOption>(() => {
    const seriesByLabel = new Map(series.map((s) => [s.label, s]));

    // Fastest lap per series, and the best of those. Computed here rather than
    // passed in so the markers always describe the data the chart is actually
    // showing — including after a filter change.
    const fastest = new Map<string, { lapNumber: number; seconds: number }>();
    for (const s of series) {
      let best: { lapNumber: number; seconds: number } | null = null;
      for (const row of data) {
        const value = row[s.key];
        if (typeof value === "number" && (best === null || value < best.seconds)) {
          best = { lapNumber: row.lapNumber, seconds: value };
        }
      }
      if (best) fastest.set(s.key, best);
    }
    const overallBest = [...fastest.values()].reduce(
      (min, entry) => Math.min(min, entry.seconds),
      Infinity,
    );
    const hasBest = Number.isFinite(overallBest);

    return {
      grid: { left: 62, right: 20, top: series.length > 1 ? 30 : 14, bottom: GRID_BOTTOM_WITH_ZOOM },
      legend: series.length > 1 ? { ...LEGEND, data: series.map((s) => s.label) } : { show: false },
      tooltip: {
        ...TOOLTIP,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.line2 } },
        formatter: (params) => {
          const rows = axisRows(params);
          const lap = rows[0]?.axisValue;
          const lapNumber = Number(lap);
          const body = rows
            .map((r) => ({ r, v: rowValue(r) }))
            .filter((x): x is { r: typeof x.r; v: number } => x.v !== null)
            .map(({ r, v }) => {
              const stint = seriesByLabel.get(r.seriesName ?? "")?.stintByLap?.[lapNumber];
              const stintTag =
                stint === undefined
                  ? ""
                  : ` <span style="color:${C.faint}">· stint ${stint}</span>`;
              return `${r.marker ?? ""}${r.seriesName} <b>${formatLapTime(v * 1000)}</b>${stintTag}`;
            })
            .join("<br/>");
          return `Lap ${lap}<br/>${body}`;
        },
      },
      xAxis: lapCategoryAxis(maxLap),
      yAxis: {
        type: "value",
        scale: true,
        ...AXIS,
        axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => formatLapTime(v * 1000) },
      },
      dataZoom: dataZoom(1),
      series: series.map((s, seriesIndex) => {
        const best = fastest.get(s.key);

        return {
          name: s.label,
          type: "line" as const,
          showSymbol: false,
          connectNulls: false,
          lineStyle: {
            color: runColor(s.slot),
            width: 1.8,
            type: s.dashed ? ("dashed" as const) : ("solid" as const),
          },
          itemStyle: { color: runColor(s.slot) },
          data: data.map((row) => [row.lapNumber, row[s.key]] as [number, number | null]),

          // A diamond on each run's own fastest lap. Unlabelled on purpose:
          // with four runs, four permanent time labels collide with each other
          // and with the line itself — the tooltip already gives the number.
          markPoint: best
            ? {
                symbol: "diamond",
                symbolSize: 9,
                itemStyle: {
                  color: runColor(s.slot),
                  borderColor: C.panel,
                  borderWidth: 1.5,
                },
                label: { show: false },
                data: [
                  {
                    name: `${s.label} fastest`,
                    coord: [best.lapNumber, best.seconds],
                    value: best.seconds,
                  },
                ],
              }
            : undefined,

          // The session best, drawn once (on the first series only — putting it
          // on every series would stack identical lines on top of each other).
          markLine:
            seriesIndex === 0 && hasBest
              ? {
                  silent: true,
                  symbol: "none",
                  lineStyle: { color: C.amber, type: "dashed" as const, width: 1 },
                  label: {
                    position: "insideEndTop" as const,
                    color: C.amber,
                    fontFamily: MONO,
                    fontSize: 11,
                    formatter: `session best ${formatLapTime(overallBest * 1000)}`,
                  },
                  data: [{ yAxis: overallBest }],
                }
              : undefined,
        };
      }),
    };
  }, [series, data, maxLap]);

  return (
    <EChart
      option={option}
      height={340}
      ariaLabel="Lap times across the uploaded runs"
    />
  );
}
