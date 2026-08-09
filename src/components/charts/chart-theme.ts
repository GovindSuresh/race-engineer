import type { EChartsOption } from "echarts";

/** Categorical series palette — the dataviz skill's validated default, dark
 *  steps. Re-validated against this app's panel surface (#171C24): all 8 pass
 *  the lightness band, chroma floor, CVD separation (worst adjacent ΔE 8.4),
 *  normal-vision floor (19.3) and 3:1 contrast checks.
 *
 *  Deliberately NOT the prototype's own six driver colors — those fail
 *  validation (all six sit above the dark lightness band, and its pink/purple
 *  pair is only ΔE 12.5 apart, below the 15 floor for normal colour vision).
 *
 *  Fixed hue order: a color is assigned by INDEX and must never be reassigned
 *  when a filter changes which series are visible — identity follows the
 *  driver, not their position in the current list. */
const SERIES_COLORS = [
  "#3987e5", // blue
  "#d95926", // orange
  "#199e70", // aqua
  "#c98500", // yellow
  "#d55181", // magenta
  "#008300", // green
  "#9085e9", // violet
  "#e66767", // red
] as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index % SERIES_COLORS.length];
}

// Design tokens, mirrored from globals.css. ECharts builds a canvas, not DOM,
// so it can't read CSS custom properties — these have to be literal values.
// Keep in sync with globals.css :root.
export const C = {
  panel: "#171c24",
  panel2: "#1d232d",
  line: "#28303c",
  line2: "#333d4b",
  text: "#e9ecf1",
  muted: "#8c95a4",
  faint: "#5b6474",
  amber: "#ffb224",
  purple: "#b96cff",
  pgreen: "#33d69f",
  wet: "#45b8e8",
  danger: "#ff5c5c",
  night: "rgba(103,110,241,.10)",
  wetBand: "rgba(69,184,232,.10)",
} as const;

const MONO = "var(--font-plex-mono), ui-monospace, monospace";
const DISPLAY = "var(--font-barlow-condensed), sans-serif";

/** Shared axis styling: no ticks, mono labels in muted ink, dashed gridlines.
 *  Recessive by design — the data should be the only assertive thing on the
 *  canvas. Spread into both xAxis and yAxis, then override per chart. */
export const AXIS = {
  axisLine: { lineStyle: { color: C.line2 } },
  axisTick: { show: false },
  axisLabel: { color: C.muted, fontFamily: MONO, fontSize: 11 },
  splitLine: { lineStyle: { color: C.line, type: "dashed" as const } },
} as const;

/** Shared tooltip styling — darker than the panel it floats over, so it reads
 *  as lifted rather than inline. */
export const TOOLTIP = {
  backgroundColor: "#10141b",
  borderColor: C.line2,
  padding: [8, 12] as [number, number],
  textStyle: { color: C.text, fontFamily: MONO, fontSize: 12 },
} as const;

export const LEGEND = {
  textStyle: { color: C.muted, fontFamily: MONO, fontSize: 11 },
  itemWidth: 14,
  itemHeight: 8,
  top: 0,
} as const;

/** Picks a round tick step giving at most `targetTicks` ticks across 0..max,
 *  from the standard 1 / 2 / 5 × 10ⁿ ladder. Always an integer, since the only
 *  thing this scales is lap numbers. */
function niceStep(max: number, targetTicks = 7): number {
  if (max <= targetTicks) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(max / targetTicks)));
  for (const multiplier of [1, 2, 5]) {
    const step = multiplier * magnitude;
    if (max / step <= targetTicks) return Math.max(1, Math.round(step));
  }
  return Math.max(1, Math.round(10 * magnitude));
}

/** The shared x-axis for every lap-indexed chart: ends exactly at the session's
 *  last lap, with round tick labels.
 *
 *  Both halves of that need care. Letting ECharts pick the max rounds up to the
 *  next "nice" number and leaves dead space (a 609-lap race would run the axis
 *  to 700). Pinning `max` to the real end instead makes ECharts add a tick AT
 *  the max, which lands just past the last round tick — "600" and "609"
 *  overlapping. So: pin the max, set the tick interval ourselves so labels stay
 *  on round numbers, and drop the max label only when it isn't already on the
 *  grid (609 → hidden; a 40-lap session → shown, since 40 IS a tick). */
export function lapAxis(maxLap: number) {
  const interval = niceStep(maxLap);
  const maxIsOnGrid = maxLap % interval === 0;
  return {
    type: "value" as const,
    min: 0,
    max: maxLap,
    interval,
    ...AXIS,
    splitLine: { show: false },
    axisLabel: { ...AXIS.axisLabel, showMaxLabel: maxIsOnGrid },
    name: "Lap",
    nameLocation: "middle" as const,
    nameGap: 26,
    nameTextStyle: { color: C.faint, fontSize: 11 },
  };
}

/** Category-axis label styling for the axis that names things (drivers, teams)
 *  rather than measures them — condensed display font, brighter than a value
 *  axis, since these are labels the reader looks up rather than scans past. */
export const CATEGORY_LABEL = {
  color: C.text,
  fontFamily: DISPLAY,
  fontSize: 12,
} as const;

/** Bottom padding for a chart carrying a dataZoom slider. The plot area has to
 *  clear three stacked things: the axis tick labels, the "Lap" axis name
 *  (nameGap 26 below the axis line), and the slider itself (18px tall, 8px off
 *  the container bottom). At the default 54 the axis name and the slider
 *  overlap by a few pixels. */
export const GRID_BOTTOM_WITH_ZOOM = 66;

/** A draggable zoom range below the plot plus scroll/pinch zoom inside it.
 *  Worth having on any lap-indexed chart: a 24h race is 600+ laps, far more
 *  than fits legibly at once. */
export function dataZoom(): NonNullable<EChartsOption["dataZoom"]> {
  return [
    {
      type: "inside",
      filterMode: "none",
    },
    {
      type: "slider",
      height: 18,
      bottom: 8,
      backgroundColor: C.panel2,
      borderColor: C.line,
      fillerColor: "rgba(255,178,36,.12)",
      handleStyle: { color: C.amber, borderColor: C.amber },
      moveHandleStyle: { color: C.line2 },
      dataBackground: {
        lineStyle: { color: C.line2 },
        areaStyle: { color: C.line },
      },
      selectedDataBackground: {
        lineStyle: { color: C.faint },
        areaStyle: { color: C.line2 },
      },
      textStyle: { color: C.faint, fontFamily: MONO, fontSize: 10 },
      filterMode: "none",
    },
  ];
}

/** One row handed to an axis-trigger tooltip formatter. ECharts' published
 *  `CallbackDataParams` union doesn't declare `axisValue` — it only exists on
 *  axis-triggered (as opposed to item-triggered) tooltips — so this narrows to
 *  exactly the fields our formatters read. */
export interface AxisTooltipRow {
  axisValue?: string | number;
  seriesName?: string;
  /** Pre-rendered colored swatch span for this series, supplied by ECharts. */
  marker?: string;
  value?: unknown;
}

/** Normalizes a tooltip formatter's argument to an array of typed rows.
 *  ECharts passes a single object for item triggers and an array for axis
 *  triggers; every chart here uses the axis trigger but the declared parameter
 *  type covers both. */
export function axisRows(params: unknown): AxisTooltipRow[] {
  return (Array.isArray(params) ? params : [params]) as AxisTooltipRow[];
}

/** Reads the y value out of a `[x, y]` tooltip row, or null if absent. */
export function rowValue(row: AxisTooltipRow): number | null {
  const v = row.value;
  if (!Array.isArray(v)) return null;
  const y = v[1];
  return typeof y === "number" ? y : null;
}

/** A markArea entry is a PAIR of coordinates (start, end) — ECharts types it
 *  as a 2-tuple, which `Array.map` can't infer on its own, hence the explicit
 *  tuple type here rather than at each call site. */
type MarkAreaBand = [{ xAxis: number; itemStyle?: { color: string } }, { xAxis: number }];

/** Builds `markArea` data for a set of one-unit-wide vertical bands — used to
 *  shade individual flagged laps (e.g. pit in/out) without turning them into
 *  line points. */
export function verticalBands(xs: number[], color: string, halfWidth = 0.5): MarkAreaBand[] {
  return xs.map((x) => [
    { xAxis: x - halfWidth, itemStyle: { color } },
    { xAxis: x + halfWidth },
  ]);
}
