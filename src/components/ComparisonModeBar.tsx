"use client";

import type { ComparisonMode, StintCandidate } from "@/core";
import { Swatch } from "@/components/DataTable";
import { stintColor } from "@/components/charts/chart-theme";

export interface ComparisonModeBarProps {
  mode: ComparisonMode;
  onModeChange: (mode: ComparisonMode) => void;
  /** Every stint of every visible run — selected or not. */
  candidates: StintCandidate[];
  selected: ReadonlySet<string>;
  onToggleStint: (key: string) => void;
  /** Replaces the selection with exactly this run's stints. */
  onSelectRun: (slot: number) => void;
}

const CHIP = "rounded-sm border px-2 py-0.5 font-mono text-[11px] transition-colors";
const ON = "border-line2 bg-panel2 text-text";
const OFF = "border-line text-muted hover:text-text";

function Chip({
  active,
  onClick,
  title,
  children,
}: {
  active: boolean;
  onClick: () => void;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <button onClick={onClick} title={title} className={`${CHIP} ${active ? ON : OFF}`}>
      {children}
    </button>
  );
}

/** Chooses what the analysis below compares, and — in stint mode — which
 *  stints are in it.
 *
 *  Sits at the top of the analysis block rather than beside any one chart,
 *  because it re-frames all of them at once: the table's rows, the boxplot's
 *  categories and both charts' series and x-axis all follow from it.
 *
 *  The chip grid is grouped by run and doubles as the legend — each swatch is
 *  the exact colour that stint takes in every chart below, so the mapping is
 *  learnable in one place instead of inferred from four. */
export function ComparisonModeBar({
  mode,
  onModeChange,
  candidates,
  selected,
  onToggleStint,
  onSelectRun,
}: ComparisonModeBarProps) {
  const slots = [...new Set(candidates.map((c) => c.runSlot))];

  return (
    <div className="rounded-sm border border-line bg-panel px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-[11px] uppercase tracking-[0.1em] text-faint">
          Compare
        </span>
        <Chip
          active={mode === "runs"}
          onClick={() => onModeChange("runs")}
          title="One series per loaded run, measured across the session's lap numbers."
        >
          Runs
        </Chip>
        <Chip
          active={mode === "stints"}
          onClick={() => onModeChange("stints")}
          title="One series per selected stint, measured from each stint's own first lap."
        >
          Stints
        </Chip>
      </div>

      {mode === "stints" && (
        <div className="mt-3 flex flex-col gap-1.5 border-t border-line pt-3">
          {slots.map((slot) => (
            <div key={slot} className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => onSelectRun(slot)}
                title={`Compare only Run ${slot + 1}'s stints`}
                className="w-[52px] shrink-0 text-left font-display text-[11px] uppercase tracking-[0.1em] text-faint transition-colors hover:text-text"
              >
                Run {slot + 1}
              </button>
              {candidates
                .filter((candidate) => candidate.runSlot === slot)
                .map((candidate) => (
                  <Chip
                    key={candidate.key}
                    active={selected.has(candidate.key)}
                    onClick={() => onToggleStint(candidate.key)}
                    title={`Laps ${candidate.startLap}–${candidate.endLap} · ${candidate.lapCount} counted`}
                  >
                    <Swatch color={stintColor(candidate.runSlot, candidate.stintIndex)} />
                    {candidate.label}
                    <span className="ml-1.5 text-faint">{candidate.lapCount}</span>
                  </Chip>
                ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
