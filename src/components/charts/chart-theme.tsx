// Shared chart theming — categorical palette from the dataviz skill's
// validated default (references/palette.md). Fixed hue order: colors are
// assigned by index and must never be reassigned/cycled when a filter
// changes which series are visible — identity follows the driver, not
// their rank in the list.
const SERIES_VARS = [
  "--chart-series-1", // blue
  "--chart-series-2", // orange
  "--chart-series-3", // aqua
  "--chart-series-4", // yellow
  "--chart-series-5", // magenta
  "--chart-series-6", // green
  "--chart-series-7", // violet
  "--chart-series-8", // red
] as const;

export function seriesColor(index: number): string {
  return `var(${SERIES_VARS[index % SERIES_VARS.length]})`;
}

export const CHART_TEXT_MUTED = "var(--chart-text-muted)";
export const CHART_GRIDLINE = "var(--chart-gridline)";
export const CHART_AXIS = "var(--chart-axis)";
export const CHART_SURFACE = "var(--chart-surface)";
export const CHART_TEXT_PRIMARY = "var(--chart-text-primary)";
// Semantic marker color for "this point is flagged/excluded, not a normal
// data value" annotations (e.g. a pit lap on a pace chart) — deliberately
// separate from the categorical series palette so it never collides with
// an actual driver/series identity.
export const CHART_ANNOTATION = "var(--chart-annotation)";

/** Renders once per page (wrap the chart(s) in a `.chart-root` container) —
 *  defines the CSS custom properties every chart in this app reads colors
 *  from, so light/dark switches in one place. */
export function ChartTheme() {
  return (
    <style>{`
      .chart-root {
        --chart-series-1: #2a78d6;
        --chart-series-2: #eb6834;
        --chart-series-3: #1baf7a;
        --chart-series-4: #eda100;
        --chart-series-5: #e87ba4;
        --chart-series-6: #008300;
        --chart-series-7: #4a3aa7;
        --chart-series-8: #e34948;
        --chart-text-primary: #0b0b0b;
        --chart-text-muted: #898781;
        --chart-gridline: #e1e0d9;
        --chart-axis: #c3c2b7;
        --chart-surface: #fcfcfb;
        --chart-annotation: #c98500;
      }
      @media (prefers-color-scheme: dark) {
        .chart-root {
          --chart-series-1: #3987e5;
          --chart-series-2: #d95926;
          --chart-series-3: #199e70;
          --chart-series-4: #c98500;
          --chart-series-5: #d55181;
          --chart-series-6: #008300;
          --chart-series-7: #9085e9;
          --chart-series-8: #e66767;
          --chart-text-primary: #ffffff;
          --chart-text-muted: #898781;
          --chart-gridline: #2c2c2a;
          --chart-axis: #383835;
          --chart-surface: #1a1a19;
          --chart-annotation: #eda100;
        }
      }
    `}</style>
  );
}
