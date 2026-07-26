"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_AXIS, CHART_GRIDLINE, CHART_TEXT_MUTED, seriesColor } from "./chart-theme";

export interface GapTrendChartProps {
  /** One row per lap our team appears in. `gapSeconds` is null for laps
   *  where iRacing reported a laps-down count instead of a time gap (the
   *  car was lapped) — rendered as a break in the line rather than
   *  connecting through, since the two aren't the same unit. */
  data: Array<{ lapNumber: number; gapSeconds: number | null }>;
}

export function GapTrendChart({ data }: GapTrendChartProps) {
  return (
    <div className="chart-root h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke={CHART_GRIDLINE} strokeDasharray="0" vertical={false} />
          <XAxis
            dataKey="lapNumber"
            type="number"
            stroke={CHART_AXIS}
            tick={{ fill: CHART_TEXT_MUTED, fontSize: 12 }}
            label={{ value: "Lap", position: "insideBottom", offset: -4, fill: CHART_TEXT_MUTED }}
          />
          <YAxis
            stroke={CHART_AXIS}
            tick={{ fill: CHART_TEXT_MUTED, fontSize: 12 }}
            label={{
              value: "Gap to leader (s)",
              angle: -90,
              position: "insideLeft",
              fill: CHART_TEXT_MUTED,
            }}
          />
          <ReferenceLine y={0} stroke={CHART_AXIS} />
          <Tooltip
            formatter={(value) =>
              value === null || value === undefined
                ? "lapped (no time gap)"
                : `${Number(value).toFixed(1)}s`
            }
            labelFormatter={(lap) => `Lap ${lap}`}
          />
          <Line
            type="monotone"
            dataKey="gapSeconds"
            name="Gap to leader"
            stroke={seriesColor(0)}
            strokeWidth={2}
            dot={false}
            connectNulls={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
