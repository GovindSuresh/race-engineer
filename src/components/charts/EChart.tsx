"use client";

import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, CustomChart, LineChart, ScatterChart } from "echarts/charts";
import {
  DataZoomComponent,
  GridComponent,
  LegendComponent,
  MarkAreaComponent,
  MarkLineComponent,
  TooltipComponent,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";

// Tree-shaken registration: importing from "echarts/core" + only the pieces we
// use keeps the bundle far smaller than the ~1MB full `echarts` build. Any new
// chart/component type has to be added here or ECharts silently renders
// nothing for it.
echarts.use([
  LineChart,
  ScatterChart,
  BarChart,
  CustomChart,
  GridComponent,
  TooltipComponent,
  LegendComponent,
  DataZoomComponent,
  MarkAreaComponent,
  MarkLineComponent,
  CanvasRenderer,
]);

export interface EChartProps {
  option: EChartsOption;
  /** CSS height. ECharts needs a definite pixel height — it cannot size
   *  itself from content the way an SVG chart can. */
  height?: number | string;
  className?: string;
  /** Accessible description of what the chart shows, for screen readers —
   *  the canvas itself is opaque to them. */
  ariaLabel?: string;
}

/** Thin React seam over ECharts' imperative API: owns the instance lifecycle
 *  (init / setOption / resize / dispose) so every chart component above it
 *  stays purely declarative — typed props in, an `option` object out.
 *
 *  `notMerge: true` on update: our option objects are always built fresh from
 *  props, so merging into the previous option would leave stale series behind
 *  when a driver is filtered out. */
export function EChart({ option, height = 320, className, ariaLabel }: EChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const chart = echarts.init(containerRef.current, undefined, { renderer: "canvas" });
    chartRef.current = chart;

    // ECharts doesn't track its container's size, so a flex/grid reflow (or a
    // window resize) would otherwise leave the canvas at its initial width.
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ height, width: "100%" }}
      role="img"
      aria-label={ariaLabel}
    />
  );
}
