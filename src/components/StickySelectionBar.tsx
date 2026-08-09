"use client";

import { LapCountReadout } from "./LapSelectionPanel";

/** A sticky stand-in for the Lap Selection block, shown only once that block has
 *  scrolled out of view. The lap count on the left reports the current selection
 *  and does nothing else; the button on the right expands the whole block in
 *  place, under the header, so the controls come to you rather than the page
 *  jumping back to them.
 *
 *  `children` is expected to be the SAME `<LapSelectionPanel>` element the page
 *  renders in the block itself, driven by the same props and state — so this is
 *  one control surface temporarily relocated, not a second copy of the controls
 *  that could disagree with the first.
 *
 *  Only the panel's own internal disclosure state (which runs and stints are
 *  expanded in the lap picker) is per-instance, since that lives inside
 *  LapPicker. The page closes this bar when you scroll back up, so the two are
 *  never on screen at once and the difference isn't visible. */
export function StickySelectionBar({
  counted,
  total,
  /** Display labels of the rules currently switched on. */
  activeRules,
  handPickCount,
  open,
  onToggle,
  children,
}: {
  counted: number;
  total: number;
  activeRules: string[];
  handPickCount: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const parts = [...activeRules];
  if (handPickCount > 0) {
    parts.push(`${handPickCount} by hand`);
  }
  const summary = parts.length > 0 ? parts.join(" · ") : "no filters";

  return (
    <div className="border-t border-line">
      <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2">
        <LapCountReadout counted={counted} total={total} />
        <span
          className="min-w-0 flex-1 truncate font-display text-[11px] uppercase tracking-[0.12em] text-faint"
          title={summary}
        >
          {summary}
        </span>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className={`flex shrink-0 select-none items-center gap-2 rounded-sm border px-2.5 py-1 font-display text-[12px] uppercase tracking-[0.08em] transition-colors ${
            open ? "border-amber text-amber" : "border-line2 text-muted hover:text-text"
          }`}
        >
          Lap selection
          <span aria-hidden className="text-faint">
            {open ? "▴" : "▾"}
          </span>
        </button>
      </div>

      {open && (
        // Capped and scrollable: with a run expanded in the lap picker this
        // content is far taller than the viewport, and it's inside the sticky
        // header, so it can't be allowed to grow past the screen.
        <div className="border-t border-line bg-bg">
          <div className="mx-auto max-h-[min(70vh,620px)] max-w-[1320px] overflow-y-auto px-5 py-4">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}
