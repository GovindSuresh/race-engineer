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
import { formatLapTime } from "@/lib/format";

export interface PaceOverTimeChartProps {
  /** Fixed order — colors are assigned by index, so this order must stay
   *  stable across re-renders (don't re-sort based on current pace/rank). */
  driverNames: string[];
  /** One row per lap; each driver's key holds their lap time in seconds for
   *  that lap, or null if they weren't driving that lap (drivers don't
   *  overlap within one car, so most rows have exactly one non-null key). */
  data: Array<{ lapNumber: number } & Record<string, number | null>>;
}

export function PaceOverTimeChart({ driverNames, data }: PaceOverTimeChartProps) {
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
            stroke={CHART_AXIS}
            tick={{ fill: CHART_TEXT_MUTED, fontSize: 12 }}
            label={{
              value: "Lap time (s)",
              angle: -90,
              position: "insideLeft",
              fill: CHART_TEXT_MUTED,
            }}
          />
          <Tooltip
            formatter={(value) => formatLapTime(Number(value) * 1000)}
            labelFormatter={(lap) => `Lap ${lap}`}
          />
          {driverNames.length > 1 && <Legend />}
          {driverNames.map((name, i) => (
            <Line
              key={name}
              type="monotone"
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
