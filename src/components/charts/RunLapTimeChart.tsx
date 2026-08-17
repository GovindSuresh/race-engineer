"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { AXIS, C, GRID_BOTTOM_WITH_ZOOM, LEGEND, MONO, TOOLTIP, axisRows, dataZoom, lapCategoryAxis, rowValue, stintColor, stintDash } from "./chart-theme";
import { formatLapTime } from "@/lib/format";

export interface RunLapTimeSeries {
  /** Matches a key in each `data` row. */
  key: string;
  /** Legend/tooltip label, e.g. "Run 1" or "Stint 3". */
  label: string;
  /** Run slot 0-3, carrying the hue. Colour identity follows the RUN, not the
   *  series' position in this list — stable even if a slot is cleared. */
  slot: number;
  /** Stint index within the run, carrying the shade and the dash pattern. 0
   *  for a whole-run series, which is what keeps runs mode looking exactly as
   *  it did before stint mode existed. */
  stintIndex: number;
  /** x -> stint number, for this series only. Omitted in stint mode, where
   *  the series IS a stint and the annotation would only repeat its name.
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
  /** What the x-axis counts: session laps when comparing runs, laps into the
   *  stint when comparing stints. */
  xLabel: string;
}

export function RunLapTimeChart({ series, data, maxLap, xLabel }: RunLapTimeChartProps) {
  const option = useMemo<EChartsOption>(() => {
    const seriesByLabel = new Map(series.map((s) => [s.label, s]));

    // Best counted lap of each STINT, per series. Derived here from the points
    // the chart is actually plotting rather than passed in, so the markers
    // always agree with the line — a lap dropped by a filter is not in `data`,
    // so it can never be marked as a stint's best.
    //
    // Laps with no stint (a series that supplied no `stintByLap`) fall into a
    // single group, which degrades to one marker for the whole line rather
    // than to none.
    const stintBests = new Map<string, { lapNumber: number; seconds: number }[]>();
    for (const s of series) {
      const bestByStint = new Map<number, { lapNumber: number; seconds: number }>();
      for (const row of data) {
        const value = row[s.key];
        if (typeof value !== "number") continue;
        const stint = s.stintByLap?.[row.lapNumber] ?? -1;
        const current = bestByStint.get(stint);
        if (!current || value < current.seconds) {
          bestByStint.set(stint, { lapNumber: row.lapNumber, seconds: value });
        }
      }
      if (bestByStint.size > 0) stintBests.set(s.key, [...bestByStint.values()]);
    }

    const overallBest = [...stintBests.values()]
      .flat()
      .reduce((min, entry) => Math.min(min, entry.seconds), Infinity);
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
          return `${xLabel} ${lap}<br/>${body}`;
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
        const bests = stintBests.get(s.key);

        return {
          name: s.label,
          type: "line" as const,
          showSymbol: false,
          connectNulls: false,
          // Hue by run, shade AND dash pattern by stint. The dash is not
          // decoration: two shades of one hue are only ΔE 7.4 apart, which is
          // under the threshold at which colour alone tells them apart.
          lineStyle: {
            color: stintColor(s.slot, s.stintIndex),
            width: 1.8,
            type: stintDash(s.stintIndex),
          },
          itemStyle: { color: stintColor(s.slot, s.stintIndex) },
          data: data.map((row) => [row.lapNumber, row[s.key]] as [number, number | null]),

          // A diamond on each stint's best counted lap, so a run reads as the
          // sequence of stints it was rather than as one line with a single
          // high point. Unlabelled on purpose: four runs' worth of permanent
          // time labels collide with each other and with the lines, and the
          // axis tooltip already names the lap, its stint and its time.
          markPoint: bests
            ? {
                symbol: "diamond",
                symbolSize: 8,
                itemStyle: {
                  color: stintColor(s.slot, s.stintIndex),
                  borderColor: C.panel,
                  borderWidth: 1.5,
                },
                label: { show: false },
                data: bests.map((best) => {
                  const stint = s.stintByLap?.[best.lapNumber];
                  return {
                    name:
                      stint === undefined
                        ? `${s.label} best`
                        : `${s.label} stint ${stint} best`,
                    coord: [best.lapNumber, best.seconds],
                    value: best.seconds,
                  };
                }),
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
  }, [series, data, maxLap, xLabel]);

  return (
    <EChart
      option={option}
      height={340}
      ariaLabel="Lap times across the compared runs or stints"
    />
  );
}
