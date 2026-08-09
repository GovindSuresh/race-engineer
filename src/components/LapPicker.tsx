"use client";

import { useState } from "react";
import { Tag } from "./Controls";

export interface PickerLap {
  lapNumber: number;
  /** Pre-formatted lap time, or null when the source never timed this lap. */
  time: string | null;
  /** True when the user has ticked this lap off by hand. */
  handDropped: boolean;
  /** Short labels for the ACTIVE rules that already exclude this lap, e.g.
   *  ["pit"]. Empty when no rule touches it. A lap can be dropped by a rule and
   *  hand-picked independently — the checkbox only ever controls the latter. */
  droppedBy: string[];
}

export interface PickerStint {
  /** Stable identity for expansion state — the page owns its format. */
  key: string;
  stintNumber: number;
  startLap: number;
  endLap: number;
  handDroppedCount: number;
  laps: PickerLap[];
}

export interface PickerDriver {
  driverName: string;
  stints: PickerStint[];
}

export interface PickerRun {
  slot: number;
  label: string;
  /** Where the run came from — an uploaded filename, or a Garage61 session
   *  description on the account path. */
  sourceLabel: string;
  color: string;
  handDroppedCount: number;
  drivers: PickerDriver[];
}

/** A caret + label row that opens a nested level. One component for both tiers
 *  so the run and stint rows can't drift apart visually. */
function Disclosure({
  open,
  onToggle,
  children,
  className,
}: {
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      className={`flex w-full items-center gap-2 py-1 text-left transition-colors hover:text-text ${className ?? ""}`}
    >
      <span aria-hidden className="w-2 shrink-0 text-faint">
        {open ? "▾" : "▸"}
      </span>
      {children}
    </button>
  );
}

/** Run → driver → stint → lap tree for ticking individual laps out of the
 *  analysis.
 *
 *  This is the ONLY place laps are picked by hand. It used to sit inside the
 *  stint explorer at the bottom of the page, which meant a control three
 *  sections down silently changed every number above it. Same nesting as the
 *  stint explorer so it's the familiar shape, but here it's next to the rules
 *  and the lap count it affects.
 *
 *  Everything is collapsed by default: with four runs loaded this would
 *  otherwise open as several hundred rows of laps. */
export function LapPicker({
  runs,
  onToggleLap,
}: {
  runs: PickerRun[];
  onToggleLap: (slot: number, driverName: string, lapNumber: number) => void;
}) {
  const [openRuns, setOpenRuns] = useState<Set<number>>(new Set());
  const [openStints, setOpenStints] = useState<Set<string>>(new Set());

  function toggleRun(slot: number) {
    setOpenRuns((prev) => {
      const next = new Set(prev);
      if (next.has(slot)) next.delete(slot);
      else next.add(slot);
      return next;
    });
  }

  function toggleStint(key: string) {
    setOpenStints((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (runs.length === 0) return null;

  return (
    <div className="mt-2.5 rounded-sm border border-line">
      {runs.map((run, runIndex) => {
        const runOpen = openRuns.has(run.slot);
        return (
          <div key={run.slot} className={runIndex > 0 ? "border-t border-line" : undefined}>
            <div className="px-2.5">
              <Disclosure open={runOpen} onToggle={() => toggleRun(run.slot)}>
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: run.color }}
                />
                <span className="font-display text-[13px] uppercase tracking-[0.08em] text-text">
                  {run.label}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-faint">
                  {run.sourceLabel}
                </span>
                {run.handDroppedCount > 0 && (
                  <Tag tone="warn">−{run.handDroppedCount}</Tag>
                )}
              </Disclosure>
            </div>

            {runOpen && (
              <div className="border-t border-line bg-panel2/40 px-2.5 pb-2">
                {run.drivers.map((driver) => (
                  <div key={driver.driverName} className="pt-2">
                    {run.drivers.length > 1 && (
                      <div className="pb-0.5 pl-4 font-display text-[11px] uppercase tracking-[0.1em] text-muted">
                        {driver.driverName}
                      </div>
                    )}
                    {driver.stints.map((stint) => {
                      const stintOpen = openStints.has(stint.key);
                      return (
                        <div key={stint.key} className="pl-4">
                          <Disclosure
                            open={stintOpen}
                            onToggle={() => toggleStint(stint.key)}
                            className="font-mono text-[11px] text-muted"
                          >
                            <span className="text-text">Stint {stint.stintNumber}</span>
                            <span>
                              laps {stint.startLap}–{stint.endLap} ({stint.laps.length})
                            </span>
                            <span className="flex-1" />
                            {stint.handDroppedCount > 0 && (
                              <Tag tone="warn">−{stint.handDroppedCount}</Tag>
                            )}
                          </Disclosure>

                          {stintOpen && (
                            <table className="mb-2 ml-4 w-full max-w-[380px] border-collapse font-mono text-[11px]">
                              <thead>
                                <tr className="text-faint">
                                  <th className="pr-4 text-left font-normal">Lap</th>
                                  <th className="pr-4 text-right font-normal">Time</th>
                                  <th className="pr-3 text-left font-normal">Count</th>
                                  <th className="text-left font-normal">Dropped by rule</th>
                                </tr>
                              </thead>
                              <tbody>
                                {stint.laps.map((lap, lapIndex) => {
                                  const out = lap.handDropped || lap.droppedBy.length > 0;
                                  return (
                                    // Lap number alone isn't a unique key — a
                                    // Garage61 export can repeat one when its
                                    // own `Run` counter restarts the lap count.
                                    <tr key={`${lap.lapNumber}:${lapIndex}`}>
                                      <td className="pr-4 tabular-nums text-muted">
                                        {lap.lapNumber}
                                      </td>
                                      <td
                                        className={`pr-4 text-right tabular-nums ${
                                          out ? "text-faint line-through" : "text-text"
                                        }`}
                                      >
                                        {lap.time ?? "–"}
                                      </td>
                                      <td className="pr-3">
                                        <input
                                          type="checkbox"
                                          checked={!lap.handDropped}
                                          className="accent-amber"
                                          aria-label={`Count lap ${lap.lapNumber}`}
                                          onChange={() =>
                                            onToggleLap(
                                              run.slot,
                                              driver.driverName,
                                              lap.lapNumber,
                                            )
                                          }
                                        />
                                      </td>
                                      <td className="text-faint">
                                        {lap.droppedBy.length > 0 ? lap.droppedBy.join(", ") : ""}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
