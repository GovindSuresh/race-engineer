"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_AXIS, CHART_GRIDLINE, CHART_TEXT_MUTED, seriesColor } from "./chart-theme";

export interface TrackPositionChartProps {
  /** Fixed order — colors are assigned by index, same convention as
   *  PaceOverTimeChart (don't re-sort based on current position/rank). */
  driverNames: string[];
  /** One row per lap; each driver's key holds their track position that
   *  lap, or null if they weren't driving. */
  data: Array<{ lapNumber: number } & Record<string, number | null>>;
}

export function TrackPositionChart({ driverNames, data }: TrackPositionChartProps) {
  return (
    <div className="chart-root h-80 w-full">
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
            reversed
            allowDecimals={false}
            stroke={CHART_AXIS}
            tick={{ fill: CHART_TEXT_MUTED, fontSize: 12 }}
            tickFormatter={(v) => `P${v}`}
            label={{
              value: "Track position",
              angle: -90,
              position: "insideLeft",
              fill: CHART_TEXT_MUTED,
            }}
          />
          <Tooltip
            formatter={(value) => (value === null || value === undefined ? "n/a" : `P${value}`)}
            labelFormatter={(lap) => `Lap ${lap}`}
          />
          {driverNames.length > 1 && <Legend />}
          {driverNames.map((name, i) => (
            <Line
              key={name}
              type="stepAfter"
              dataKey={name}
              name={name}
              stroke={seriesColor(i)}
              strokeWidth={2}
              dot={false}
              connectNulls={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
