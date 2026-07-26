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
import { CHART_ANNOTATION, CHART_AXIS, CHART_GRIDLINE, CHART_TEXT_MUTED, seriesColor } from "./chart-theme";

export interface PaceVsFieldChartProps {
  /** One row per lap we completed. `deltaSeconds` is null both when the
   *  field didn't have enough clean samples at that lap number to trust a
   *  median, and when the lap itself was pit-affected (see
   *  PaceVsFieldPoint) — a pit in/out lap is tens of seconds slower for
   *  reasons that have nothing to do with race pace, so it's excluded from
   *  the line entirely rather than plotted as a misleading spike that also
   *  wrecks the y-axis scale for every other lap. `pitAffected` still marks
   *  where it happened, as a vertical band rather than a line point. */
  data: Array<{ lapNumber: number; deltaSeconds: number | null; pitAffected: boolean }>;
}

export function PaceVsFieldChart({ data }: PaceVsFieldChartProps) {
  const pitLapNumbers = data.filter((d) => d.pitAffected).map((d) => d.lapNumber);

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
              value: "Delta to field median (s)",
              angle: -90,
              position: "insideLeft",
              fill: CHART_TEXT_MUTED,
            }}
          />
          <ReferenceLine y={0} stroke={CHART_AXIS} />
          {pitLapNumbers.map((lapNumber) => (
            <ReferenceLine
              key={lapNumber}
              x={lapNumber}
              stroke={CHART_ANNOTATION}
              strokeDasharray="3 3"
              strokeOpacity={0.6}
            />
          ))}
          <Tooltip
            formatter={(value, _name, entry) => {
              const pitAffected = (entry?.payload as { pitAffected?: boolean } | undefined)
                ?.pitAffected;
              if (pitAffected) return "pit in/out lap — excluded from the pace line";
              return value === null || value === undefined
                ? "no field data this lap"
                : `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(2)}s`;
            }}
            labelFormatter={(lap) => `Lap ${lap}`}
          />
          <Line
            type="monotone"
            dataKey="deltaSeconds"
            name="Delta to field"
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
