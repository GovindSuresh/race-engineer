"use client";

import { useState } from "react";
import { Tag } from "@/components/Controls";
import type { Garage61ConnectionStatus } from "@/hooks/useGarage61";
import { DRIVING_DATA_PERMISSION, type Garage61Profile } from "@/lib/garage61-types";

export interface Garage61ConnectPanelProps {
  status: Garage61ConnectionStatus;
  profile: Garage61Profile | null;
  connecting: boolean;
  error: string | null;
  onConnect: (token: string) => void;
  onDisconnect: () => void;
}

const TOKEN_PAGE = "https://garage61.net/developer/applications";

/** Connect/disconnect for the Garage61 account flow.
 *
 *  The token goes straight to this app's own server, which validates it and
 *  keeps it in an httpOnly cookie — it is never stored in the browser and
 *  never readable by this component after submission, which is why there's no
 *  "show token" affordance and nothing to display once connected. */
export function Garage61ConnectPanel({
  status,
  profile,
  connecting,
  error,
  onConnect,
  onDisconnect,
}: Garage61ConnectPanelProps) {
  const [token, setToken] = useState("");

  if (status === "checking") {
    return <p className="font-mono text-xs text-faint">Checking Garage61 connection…</p>;
  }

  if (status === "connected" && profile) {
    // A token can authenticate perfectly and still not read laps: Garage61
    // grants driving_data per application, with the user's opt-in. Saying so
    // here beats letting the first lap search fail for no visible reason.
    const canReadLaps = profile.apiPermissions.includes(DRIVING_DATA_PERMISSION);

    return (
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-[13px] uppercase tracking-[0.1em] text-muted">
            Connected as
          </span>
          <span className="font-mono text-sm text-pgreen">{profile.name}</span>
          {profile.subscriptionPlan && <Tag>{profile.subscriptionPlan}</Tag>}
          {canReadLaps ? (
            <Tag tone="good">driving data</Tag>
          ) : (
            <Tag tone="warn">no driving data</Tag>
          )}
          <button
            type="button"
            onClick={onDisconnect}
            className="ml-auto shrink-0 rounded-sm border border-line2 px-3 py-1 font-display text-[13px] uppercase tracking-[0.06em] text-muted transition-colors hover:border-danger hover:text-danger"
          >
            Disconnect
          </button>
        </div>

        {!canReadLaps && (
          <p className="font-mono text-[11px] text-amber">
            This token has no <code>{DRIVING_DATA_PERMISSION}</code> permission, so Garage61
            won’t return any laps. Grant it to the application on{" "}
            <a href={TOKEN_PAGE} target="_blank" rel="noreferrer" className="underline">
              your applications page
            </a>
            .
          </p>
        )}

        {profile.teams.length > 0 && (
          <p className="font-mono text-[11px] text-faint">
            Teams: {profile.teams.map((team) => team.name).join(", ")}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (token.trim()) onConnect(token);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <label
          htmlFor="g61-token"
          className="font-display text-[13px] uppercase tracking-[0.1em] text-muted"
        >
          Personal access token
        </label>
        <input
          id="g61-token"
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          placeholder="paste your Garage61 token"
          className="min-w-[280px] flex-1 rounded-sm border border-line2 bg-panel2 px-2.5 py-1 font-mono text-xs text-text placeholder:text-faint focus:border-amber focus:outline-none"
        />
        <button
          type="submit"
          disabled={connecting || token.trim().length === 0}
          className={`shrink-0 rounded-sm border px-3 py-1 font-display text-[13px] uppercase tracking-[0.06em] transition-colors ${
            connecting || token.trim().length === 0
              ? "cursor-not-allowed border-line text-faint"
              : "border-line2 bg-panel2 text-text hover:border-amber hover:text-amber"
          }`}
        >
          {connecting ? "Connecting…" : "Connect"}
        </button>
      </div>

      {error && <p className="font-mono text-[11px] text-danger">{error}</p>}

      <p className="font-mono text-[11px] text-faint">
        Create one on{" "}
        <a href={TOKEN_PAGE} target="_blank" rel="noreferrer" className="underline">
          garage61.net/developer/applications
        </a>
        . It’s sent to this app’s own server, stored in an httpOnly cookie, and never
        exposed to the page — Garage61’s API can’t be called from a browser directly.
      </p>
    </form>
  );
}
