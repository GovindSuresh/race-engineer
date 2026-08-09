"use client";

import { useState } from "react";
import { garage61SessionTypeLabel, type Garage61Session } from "@/core";
import { formatLapTime } from "@/lib/format";
import { Select, Tag } from "@/components/Controls";
import { Table, TableWrap, Td, Th, Tr } from "@/components/DataTable";
import type { Garage61FetchProgress, Garage61LapFilters } from "@/hooks/useGarage61";
import type { Garage61Reference } from "@/lib/garage61-types";

export interface Garage61SessionPickerProps {
  reference: Garage61Reference | null;
  referenceError: string | null;
  sessions: Garage61Session[];
  progress: Garage61FetchProgress;
  /** Which session key currently sits in each run slot, by slot index. */
  assignedKeys: (string | null)[];
  slotColors: string[];
  onSearch: (filters: Garage61LapFilters) => void;
  onAssign: (slot: number, session: Garage61Session) => void;
}

/** Garage61's `age` parameter: positive numbers are days. (It also accepts
 *  negatives for season ranges, which don't map onto "recent practice" well
 *  enough to be worth a control.) */
const AGE_OPTIONS = [
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 365, label: "Last year" },
];

function formatSessionDate(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return "—";
  return new Date(parsed).toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Picks practice sessions out of a Garage61 account and drops them into run
 *  slots — the account-flow counterpart to the four CSV upload buttons.
 *
 *  There is no "list my sessions" endpoint, so a search fetches laps and the
 *  sessions are reconstructed from them; that's why the button says how many
 *  laps it loaded rather than how many sessions it expects to find. */
export function Garage61SessionPicker({
  reference,
  referenceError,
  sessions,
  progress,
  assignedKeys,
  slotColors,
  onSearch,
  onAssign,
}: Garage61SessionPickerProps) {
  const [trackId, setTrackId] = useState<string>("");
  const [carId, setCarId] = useState<string>("");
  const [teamSlug, setTeamSlug] = useState<string>("");
  const [ageDays, setAgeDays] = useState<string>("30");

  if (referenceError) {
    return <p className="font-mono text-xs text-danger">{referenceError}</p>;
  }

  if (!reference) {
    return <p className="font-mono text-xs text-faint">Loading tracks and cars…</p>;
  }

  const canSearch = trackId !== "" && !progress.loading;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5">
          <span className="font-display text-[13px] uppercase tracking-[0.1em] text-muted">
            {/* Required by Garage61 — there is no unfiltered lap search. */}
            Track *
          </span>
          <Select value={trackId} onChange={setTrackId} ariaLabel="Track">
            <option value="">Choose a track</option>
            {reference.tracks.map((track) => (
              <option key={track.id} value={track.id}>
                {track.variant ? `${track.name} — ${track.variant}` : track.name}
              </option>
            ))}
          </Select>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="font-display text-[13px] uppercase tracking-[0.1em] text-muted">
            Car
          </span>
          <Select value={carId} onChange={setCarId} ariaLabel="Car">
            <option value="">Any car</option>
            {reference.cars.map((car) => (
              <option key={car.id} value={car.id}>
                {car.name}
              </option>
            ))}
          </Select>
        </label>

        {reference.teams.length > 0 && (
          <label className="flex flex-col gap-1.5">
            <span className="font-display text-[13px] uppercase tracking-[0.1em] text-muted">
              Drivers
            </span>
            <Select value={teamSlug} onChange={setTeamSlug} ariaLabel="Drivers">
              <option value="">You and your teammates</option>
              {reference.teams.map((team) => (
                <option key={team.slug} value={team.slug}>
                  {team.name}
                </option>
              ))}
            </Select>
          </label>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="font-display text-[13px] uppercase tracking-[0.1em] text-muted">
            Age
          </span>
          <Select value={ageDays} onChange={setAgeDays} ariaLabel="Maximum lap age">
            {AGE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </label>

        <button
          type="button"
          disabled={!canSearch}
          onClick={() =>
            onSearch({
              trackId: Number(trackId),
              carId: carId === "" ? null : Number(carId),
              teamSlug: teamSlug === "" ? null : teamSlug,
              ageDays: Number(ageDays),
            })
          }
          className={`rounded-sm border px-3 py-1 font-display text-[13px] uppercase tracking-[0.06em] transition-colors ${
            canSearch
              ? "border-line2 bg-panel2 text-text hover:border-amber hover:text-amber"
              : "cursor-not-allowed border-line text-faint"
          }`}
        >
          {progress.loading ? `Loading ${progress.lapsLoaded} laps…` : "Find sessions"}
        </button>
      </div>

      {progress.error && (
        <p className="font-mono text-[11px] text-danger">{progress.error}</p>
      )}

      {progress.truncated && (
        <p className="font-mono text-[11px] text-amber">
          Stopped after {progress.lapsLoaded} laps — narrow the car or age filter to be
          sure you’re seeing everything.
        </p>
      )}

      {!progress.loading && !progress.error && sessions.length === 0 && (
        <p className="font-mono text-[11px] text-faint">
          No sessions loaded yet. Pick a track and search.
        </p>
      )}

      {sessions.length > 0 && (
        <TableWrap>
          <Table>
            <thead>
              <tr>
                <Th align="left">Session</Th>
                <Th align="left">Drivers</Th>
                <Th align="left">Car</Th>
                <Th>Laps</Th>
                <Th>Best</Th>
                <Th align="left">Load into</Th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((session) => (
                <Tr key={session.key}>
                  <Td align="left">
                    <span className="text-text">{formatSessionDate(session.startedAt)}</span>
                    <span className="ml-2 text-faint">
                      {garage61SessionTypeLabel(session.sessionType)}
                    </span>
                  </Td>
                  <Td align="left" className="text-muted">
                    {session.drivers.join(", ")}
                  </Td>
                  <Td align="left" className="text-muted">
                    {session.carName ?? "—"}
                  </Td>
                  <Td>{session.lapCount}</Td>
                  <Td className="text-purple">
                    {session.bestLapTimeMs > 0 ? formatLapTime(session.bestLapTimeMs) : "n/a"}
                  </Td>
                  <Td align="left">
                    <div className="flex items-center gap-1.5">
                      {assignedKeys.map((assignedKey, slot) => {
                        const isHere = assignedKey === session.key;
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => onAssign(slot, session)}
                            aria-label={`Load into run ${slot + 1}`}
                            aria-pressed={isHere}
                            className="rounded-sm border px-2 py-px font-display text-[11px] uppercase tracking-[0.06em] transition-colors"
                            style={
                              isHere
                                ? { borderColor: slotColors[slot], color: slotColors[slot] }
                                : undefined
                            }
                          >
                            <span className={isHere ? "" : "text-muted"}>R{slot + 1}</span>
                          </button>
                        );
                      })}
                      {assignedKeys.includes(session.key) && <Tag tone="good">loaded</Tag>}
                    </div>
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      )}
    </div>
  );
}
