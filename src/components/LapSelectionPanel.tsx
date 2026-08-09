"use client";

import { Chip, Toggle } from "./Controls";
import { LapPicker, type PickerRun } from "./LapPicker";
import { Panel } from "./Panel";

/** DOM id for the Lap Selection block. Nothing links to it today — the sticky
 *  bar brings the controls to the reader rather than jumping the page — but it
 *  names the section for deep links and is what `useScrolledPast` watches. */
export const LAP_SELECTION_ANCHOR = "lap-selection";

export interface RunScopeOption {
  slot: number;
  label: string;
  color: string;
  visible: boolean;
}

export interface LapRuleOption {
  key: string;
  label: string;
  active: boolean;
  /** How many laps this rule would remove on its own, whether or not it's on.
   *  Rules overlap, so these don't sum to the total dropped. */
  wouldDrop: number;
}

export interface HandPickOption {
  /** Stable identity for removal — the page owns its format. */
  key: string;
  label: string;
  color: string;
}

/** One labelled row of the selection panel. The label column is a fixed width
 *  so RUNS / RULES / BY HAND line up down the left edge, which is what makes
 *  the three tiers read as one funnel rather than three unrelated control
 *  groups. */
function SelectionRow({
  label,
  hint,
  /** Put the hint above the controls instead of below. For a row whose hint
   *  tells you how to drive the control (the lap picker), reading it after the
   *  control is backwards. */
  hintFirst,
  children,
}: {
  label: string;
  hint?: string;
  hintFirst?: boolean;
  children: React.ReactNode;
}) {
  const hintEl = hint ? (
    <p className={`text-[11px] leading-relaxed text-faint ${hintFirst ? "mb-2.5" : "mt-2"}`}>
      {hint}
    </p>
  ) : null;

  return (
    <div className="flex flex-col gap-2 border-b border-line py-3.5 first:pt-0 sm:flex-row sm:gap-5">
      <div className="sm:w-[92px] sm:shrink-0 sm:pt-1">
        <span className="font-display text-[12px] uppercase tracking-[0.16em] text-faint">
          {label}
        </span>
      </div>
      <div className="min-w-0 flex-1">
        {hintFirst && hintEl}
        {children}
        {!hintFirst && hintEl}
      </div>
    </div>
  );
}

/** The count of laps a rule would remove, set beside its toggle. Without this
 *  a rule toggle has no visible effect — you flip it and some number further
 *  down the page changes by an unknown amount. */
function WouldDrop({ count, active }: { count: number; active: boolean }) {
  if (count === 0) {
    return <span className="font-mono text-[11px] text-faint">no laps</span>;
  }
  return (
    <span className={`font-mono text-[11px] ${active ? "text-pgreen" : "text-muted"}`}>
      {active ? "−" : ""}
      {count} lap{count === 1 ? "" : "s"}
    </span>
  );
}

/** The Stint Planner's single home for every control that decides which laps
 *  the analysis is built from: which runs are in scope, the rule-based filters,
 *  and individual laps ticked off by hand.
 *
 *  Sits with the file uploader as CONFIGURATION, above and outside the numbered
 *  analysis sections — it produces the lap set they all read from rather than
 *  being one of them.
 *
 *  Deliberately NOT in the sticky header, which is where the rule toggles used
 *  to live. Three toggles plus four run chips outgrew the header, and more
 *  importantly the header has no room for the per-rule lap counts or the list of
 *  hand-picks — the two things that made the old arrangement confusing, since
 *  hand-picks buried in the stint explorer silently changed every figure above
 *  them with no visible record anywhere. Reachability while scrolled is handled
 *  by `StickySelectionBar`, which re-renders this same element on demand. */
export function LapSelectionPanel({
  runs,
  onToggleRun,
  rules,
  onToggleRule,
  handPicks,
  onRemoveHandPick,
  onClearHandPicks,
  pickerRuns,
  onToggleLap,
  total,
  counted,
  byRule,
  byHand,
}: {
  runs: RunScopeOption[];
  onToggleRun: (slot: number) => void;
  rules: LapRuleOption[];
  onToggleRule: (key: string) => void;
  handPicks: HandPickOption[];
  onRemoveHandPick: (key: string) => void;
  onClearHandPicks: () => void;
  pickerRuns: PickerRun[];
  onToggleLap: (slot: number, driverName: string, lapNumber: number) => void;
  total: number;
  counted: number;
  byRule: number;
  byHand: number;
}) {
  const dropped = total - counted;

  return (
    <Panel>
      <SelectionRow
        label="Runs"
        hint={
          runs.length > 1
            ? "Hiding a run takes it out of every table and chart below, but keeps the file loaded."
            : undefined
        }
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {runs.map((run) => (
            <Chip
              key={run.slot}
              label={run.label}
              color={run.color}
              active={run.visible}
              onToggle={() => onToggleRun(run.slot)}
            />
          ))}
        </div>
      </SelectionRow>

      <SelectionRow
        label="Rules"
        hint="Counts are what each rule would remove on its own. They overlap — a pit lap is often flagged unclean too — so they don't add up to the total below."
      >
        <div className="flex flex-col gap-2">
          {rules.map((rule) => (
            <div key={rule.key} className="flex items-center gap-2.5">
              <span className="w-[132px] shrink-0">
                <Toggle
                  label={rule.label}
                  active={rule.active}
                  onToggle={() => onToggleRule(rule.key)}
                />
              </span>
              <WouldDrop count={rule.wouldDrop} active={rule.active} />
            </div>
          ))}
        </div>
      </SelectionRow>

      <SelectionRow
        label="By hand"
        hintFirst
        hint="Open a run, then a stint, and untick any lap you want out of the analysis — a spin, traffic, a lap you know was scrappy. Whatever you drop also appears as a chip here, so you can restore one without going looking for it."
      >
        {handPicks.length === 0 ? (
          <span className="font-mono text-[11px] text-faint">nothing dropped by hand</span>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            {handPicks.map((pick) => (
              <button
                key={pick.key}
                type="button"
                onClick={() => onRemoveHandPick(pick.key)}
                title={`Restore ${pick.label}`}
                className="flex select-none items-center gap-[7px] rounded-sm border border-line2 px-[9px] py-1 font-mono text-[11px] text-muted transition-colors hover:border-amber hover:text-amber"
              >
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: pick.color }}
                />
                {pick.label}
                <span aria-hidden className="text-faint">
                  ×
                </span>
              </button>
            ))}
            <button
              type="button"
              onClick={onClearHandPicks}
              className="ml-1 font-display text-[11px] uppercase tracking-[0.06em] text-faint transition-colors hover:text-amber"
            >
              restore all
            </button>
          </div>
        )}
        <LapPicker runs={pickerRuns} onToggleLap={onToggleLap} />
      </SelectionRow>

      <div className="flex flex-wrap items-baseline justify-between gap-x-5 gap-y-1 pt-3.5">
        <span className="font-mono text-[13px] text-text">
          {counted} of {total} lap{total === 1 ? "" : "s"} counted
        </span>
        <span className="font-mono text-[11px] text-faint">
          {dropped === 0
            ? "nothing dropped"
            : `${dropped} dropped — ${byRule} by rule, ${byHand} by hand`}
        </span>
      </div>
    </Panel>
  );
}

/** Compact lap count for the sticky bar, so you can tell at a glance you're
 *  looking at filtered data however far down you've scrolled.
 *
 *  Deliberately inert — not a link back to the selection block. The bar's own
 *  disclosure button brings the controls to you, which makes jumping the page
 *  somewhere else redundant, and a box that looks like a readout but silently
 *  moves you 2000px is worse than one that just reports a number. */
export function LapCountReadout({ counted, total }: { counted: number; total: number }) {
  const filtered = counted < total;
  return (
    <span className="flex items-center gap-1.5 rounded-sm border border-line2 px-2.5 py-1 font-mono text-[11px] text-muted">
      <span className={filtered ? "text-pgreen" : "text-text"}>{counted}</span>
      <span className="text-faint">/</span>
      <span>{total} laps</span>
    </span>
  );
}
