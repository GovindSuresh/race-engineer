"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import {
  AXIS,
  C,
  GRID_BOTTOM_WITH_ZOOM,
  LEGEND,
  TOOLTIP,
  axisRows,
  dataZoom,
  lapCategoryAxis,
  rowValue,
  runColor,
} from "./chart-theme";
import { formatLapTime } from "@/lib/format";
import type { RunLapDeltaBaselinePoint, RunLapDeltaSeries } from "@/core";

export interface RunLapDeltaChartProps {
  series: RunLapDeltaSeries[];
  /** The per-lap median each delta was taken against, so the tooltip can name
   *  the lap time zero actually stands for at that lap. */
  baseline: RunLapDeltaBaselinePoint[];
  /** Last lap carrying a baseline, so the axis ends at the real comparison
   *  distance rather than at a "nice" number past the data. */
  maxLap: number;
}

/** Each run's lap times against the median of the runs at that same lap.
 *
 *  Zero is not a fixed lap time — it moves lap by lap with what the runs did
 *  in common, so anything the runs shared (fuel burning off, the track
 *  rubbering in, a cold opening stint) flattens out and what's left is the
 *  difference between them. That is what separates this from the absolute
 *  lap-time chart: a single constant baseline would translate every line by
 *  the same amount and leave the shape untouched.
 *
 *  Markers on every lap, unlike the lap-time chart. That chart is scaled for a
 *  600-lap race where symbols would collapse into a solid band; a practice run
 *  is tens of laps, and at that density the dots are what make a single scruffy
 *  lap distinguishable from a line that genuinely moved.
 *
 *  Expect one line to touch zero repeatedly when an ODD number of runs is
 *  loaded: the median of three values is one of them, so whichever run is
 *  middle at that lap has a delta of exactly 0. It looks like a bug and isn't —
 *  the panel copy says so, and the alternative (a mean baseline) trades it for
 *  a baseline that every scruffy lap drags. */
export function RunLapDeltaChart({ series, baseline, maxLap }: RunLapDeltaChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const baselineByLap = new Map(baseline.map((b) => [b.lapNumber, b]));

    // Actual lap time behind each plotted delta, for the tooltip. Keyed by
    // series LABEL because that is all an axis-trigger tooltip row carries;
    // labels are unique per run/driver, which is what the legend needs anyway.
    const lapTimeByLabelAndLap = new Map<string, Map<number, number>>();
    for (const s of series) {
      lapTimeByLabelAndLap.set(
        s.label,
        new Map(s.points.map((p) => [p.lapNumber, p.lapTimeMs])),
      );
    }

    return {
      grid: { left: 62, right: 20, top: series.length > 1 ? 30 : 14, bottom: GRID_BOTTOM_WITH_ZOOM },
      legend: series.length > 1 ? { ...LEGEND, data: series.map((s) => s.label) } : { show: false },
      tooltip: {
        ...TOOLTIP,
        trigger: "axis",
        axisPointer: { type: "line", lineStyle: { color: C.line2 } },
        formatter: (params) => {
          const rows = axisRows(params);
          const lapNumber = Number(rows[0]?.axisValue);
          const base = baselineByLap.get(lapNumber);

          const head = base
            ? `Lap ${lapNumber} <span style="color:${C.faint}">· baseline ${formatLapTime(base.medianLapTimeMs)} over ${base.runCount} runs</span>`
            : `Lap ${lapNumber}`;

          const body = rows
            .map((r) => ({ r, v: rowValue(r) }))
            .filter((x): x is { r: typeof x.r; v: number } => x.v !== null)
            .map(({ r, v }) => {
              const lapTimeMs = lapTimeByLabelAndLap.get(r.seriesName ?? "")?.get(lapNumber);
              const color = v < 0 ? C.pgreen : C.danger;
              const actual =
                lapTimeMs === undefined
                  ? ""
                  : ` <span style="color:${C.faint}">${formatLapTime(lapTimeMs)}</span>`;
              return `${r.marker ?? ""}${r.seriesName} <b style="color:${color}">${v > 0 ? "+" : ""}${v.toFixed(2)}s</b>${actual}`;
            })
            .join("<br/>");

          return `${head}<br/>${body}`;
        },
      },
      xAxis: lapCategoryAxis(maxLap),
      yAxis: {
        type: "value",
        scale: true,
        ...AXIS,
        axisLabel: {
          ...AXIS.axisLabel,
          formatter: (v: number) => `${v > 0 ? "+" : ""}${v.toFixed(1)}s`,
        },
      },
      dataZoom: dataZoom(1),
      series: series.map((s, seriesIndex) => ({
        name: s.label,
        type: "line" as const,
        // A lap with no baseline is absent from `points`, so the line must
        // break there rather than bridge a stretch that wasn't compared.
        connectNulls: false,
        showSymbol: true,
        symbolSize: 4,
        lineStyle: { color: runColor(s.slot), width: 1.6 },
        itemStyle: { color: runColor(s.slot) },
        data: s.points.map((p) => [p.lapNumber, p.deltaMs / 1000] as [number, number]),

        // Zero is the moving baseline itself — the line the whole chart is read
        // against, so it's brighter than a gridline. Drawn once, on the first
        // series only, or identical lines stack on top of each other.
        markLine:
          seriesIndex === 0
            ? {
                silent: true,
                symbol: "none",
                label: { show: false },
                lineStyle: { color: C.muted, width: 1 },
                data: [{ yAxis: 0 }],
              }
            : undefined,
      })),
    };
  }, [series, baseline, maxLap]);

  return (
    <EChart
      option={option}
      height={320}
      ariaLabel="Each run's lap times relative to the median of the loaded runs at the same lap number"
    />
  );
}
