/** Shared table styling, as composable pieces rather than one generic
 *  <DataTable data={...} columns={...} /> component. Each table here has
 *  genuinely different cell content (tags, colored deltas, driver swatches),
 *  so a column-config abstraction would end up more convoluted than the JSX
 *  it replaced. These just carry the classes so every table looks the same.
 *
 *  House style, ported from the prototype:
 *   - condensed uppercase display font for headers, muted, letter-spaced
 *   - mono + tabular-nums for every cell, so digits align down a column
 *   - numbers right-aligned, names/labels left-aligned
 *   - sticky header, so it survives a long scrolling table
 */

export function TableWrap({
  children,
  className,
  /** Caps the height and scrolls inside, for tables long enough to swamp the
   *  page (the field standings in a 60-car race). */
  maxHeight,
}: {
  children: React.ReactNode;
  className?: string;
  maxHeight?: number;
}) {
  return (
    <div
      className={`overflow-x-auto ${className ?? ""}`}
      style={maxHeight ? { maxHeight, overflowY: "auto" } : undefined}
    >
      {children}
    </div>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <table className="w-full border-collapse whitespace-nowrap font-mono text-[12.5px]">
      {children}
    </table>
  );
}

/** A header cell. `align="left"` for the name/label columns; numeric columns
 *  keep the default right alignment. */
export function Th({
  children,
  align = "right",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <th
      className={`sticky top-0 z-[2] border-b border-line2 bg-panel px-[11px] py-[7px] font-display text-[13px] font-semibold uppercase tracking-[0.08em] text-muted ${
        align === "left" ? "text-left" : "text-right"
      } ${className ?? ""}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children,
  align = "right",
  className,
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
  className?: string;
}) {
  return (
    <td
      className={`border-b border-line px-[11px] py-1.5 tabular-nums ${
        align === "left" ? "text-left" : "text-right"
      } ${className ?? ""}`}
    >
      {children}
    </td>
  );
}

export function Tr({
  children,
  /** Highlights the reader's own team/row so it's findable in a long table. */
  highlight,
}: {
  children: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <tr className={highlight ? "bg-panel2 font-medium" : "transition-colors hover:bg-panel2"}>
      {children}
    </tr>
  );
}

/** Small square color swatch, for tying a table row to its series color in
 *  the charts above. */
export function Swatch({ color }: { color: string }) {
  return (
    <span
      className="mr-2 inline-block h-2 w-2 rounded-sm align-middle"
      style={{ backgroundColor: color }}
    />
  );
}

/** Signed value in the reserved gain/loss colors — green for a gain, red for
 *  a loss, faint for no change. `invert` flips which sign counts as good
 *  (a position gain is a positive number; a lap-time delta is the opposite). */
export function Delta({
  value,
  format,
  invert,
}: {
  value: number;
  format: (v: number) => string;
  invert?: boolean;
}) {
  const good = invert ? value < 0 : value > 0;
  const bad = invert ? value > 0 : value < 0;
  return (
    <span className={good ? "text-pgreen" : bad ? "text-danger" : "text-faint"}>
      {format(value)}
    </span>
  );
}
