"use client";

import { useMemo } from "react";
import type { EChartsOption } from "echarts";
import { EChart } from "./EChart";
import { AXIS, C, MONO, TOOLTIP, stintColor } from "./chart-theme";
import { formatLapTime } from "@/lib/format";
import type { UnitLapDistribution } from "@/core";

export interface RunPaceBoxplotProps {
  distributions: UnitLapDistribution[];
}

interface OutlierPoint {
  value: [number, number];
  lapNumber: number;
}

function unitHeading(unit: UnitLapDistribution | undefined): string {
  if (!unit) return "";
  return (
    `<b>${unit.name}</b> ` +
    `<span style="color:${C.faint}">${unit.detail}</span>`
  );
}

/** Lap-time distribution, one box per comparison unit — a run or a stint,
 *  depending on the page's mode.
 *
 *  The comparison table answers "which was quicker on average"; this answers
 *  "which could actually repeat it". Two units can share a mean and look
 *  nothing alike — a tight box is a car the driver can lean on, a tall one is a
 *  lap they got right once. Outliers are drawn separately rather than
 *  stretching the whiskers, so a single traffic-ruined lap doesn't disguise an
 *  otherwise consistent stint.
 *
 *  This is the one chart in the set that needs no dash-pattern encoding to go
 *  with `stintColor`'s shades: every box is named on the category axis, which
 *  is already a direct label and a stronger identity channel than colour. */
export function RunPaceBoxplot({ distributions }: RunPaceBoxplotProps) {
  const option = useMemo<EChartsOption>(() => {
    const withData = distributions.filter((d) => d.box !== null);

    const outliers: OutlierPoint[] = withData.flatMap((dist, index) =>
      dist.outliers.map((outlier) => ({
        value: [index, outlier.lapTimeMs / 1000] as [number, number],
        lapNumber: outlier.lapNumber,
      })),
    );

    return {
      grid: { left: 62, right: 20, top: 16, bottom: 34 },
      tooltip: {
        ...TOOLTIP,
        trigger: "item",
        formatter: (params) => {
          const p = params as { seriesType?: string; dataIndex: number };

          // Both branches index back into our own arrays rather than reading
          // `params.data`. ECharts hands back whatever object was put in —
          // and for boxplot it also prepends the category index to the value
          // array — so destructuring it is shape-dependent and breaks silently
          // at hover time, which no build step catches.
          if (p.seriesType === "scatter") {
            const point = outliers[p.dataIndex];
            if (!point) return "";
            // Unit, lap, time — nothing else. An outlier is a single lap, and
            // the session it belongs to is already on the axis and in the
            // box's own tooltip.
            const run = withData[point.value[0]];
            return (
              `<b>${run?.name ?? ""}</b> ` +
              `<span style="color:${C.faint}">lap ${point.lapNumber}</span><br/>` +
              `<b>${formatLapTime(point.value[1] * 1000)}</b>`
            );
          }

          const run = withData[p.dataIndex];
          if (!run?.box) return "";
          const [min, q1, median, q3, max] = run.box;
          const rows: [string, number][] = [
            ["max", max],
            ["upper quartile", q3],
            ["median", median],
            ["lower quartile", q1],
            ["min", min],
          ];
          return (
            `${unitHeading(run)}<br/>` +
            rows
              .map(
                ([name, value]) =>
                  `<span style="color:${C.faint}">${name}</span> <b>${formatLapTime(
                    value,
                  )}</b>`,
              )
              .join("<br/>")
          );
        },
      },
      xAxis: {
        type: "category",
        // The unit's short name ("Run 1", "Stint 3"), not its descriptor —
        // the axis matches how units are labelled everywhere else (legend,
        // swatches, table), and a date · driver · car string would wrap or
        // truncate under a narrow box. The detail is in the tooltip, where
        // there's room for it.
        data: withData.map((d) => d.name),
        ...AXIS,
        splitLine: { show: false },
        axisLabel: { ...AXIS.axisLabel, fontFamily: MONO },
      },
      yAxis: {
        type: "value",
        scale: true,
        ...AXIS,
        axisLabel: { ...AXIS.axisLabel, formatter: (v: number) => formatLapTime(v * 1000) },
      },
      series: [
        {
          type: "boxplot" as const,
          // Hue by run, shade by stint — the same mapping every other
          // surface uses, so a swatch means one thing across the page.
          itemStyle: { borderWidth: 1.5 },
          data: withData.map((dist) => ({
            value: (dist.box as [number, number, number, number, number]).map(
              (ms) => ms / 1000,
            ),
            itemStyle: {
              borderColor: stintColor(dist.runSlot, dist.stintIndex),
              color: `${stintColor(dist.runSlot, dist.stintIndex)}22`,
            },
          })),
        },
        {
          type: "scatter" as const,
          symbolSize: 5,
          data: outliers,
          itemStyle: {
            color: C.faint,
          },
        },
      ],
    };
  }, [distributions]);

  return (
    <EChart
      option={option}
      height={300}
      ariaLabel="Lap-time distribution for each compared run or stint, as a boxplot"
    />
  );
}
