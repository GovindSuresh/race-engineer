"use client";

import { useCallback, useEffect, useState } from "react";
import { groupG61ApiLapsIntoSessions, type Garage61Session, type RawGarage61Lap } from "@/core";
import type {
  Garage61ErrorBody,
  Garage61Profile,
  Garage61Reference,
} from "@/lib/garage61-types";

/** Safety net on the client-side pagination loop. 20 pages × 1000 laps is far
 *  more than any practice session, so hitting it means a filter is too broad
 *  rather than that the data is genuinely that large. */
const MAX_PAGES = 20;

export type Garage61ConnectionStatus = "checking" | "disconnected" | "connected";

export interface Garage61LapFilters {
  trackId: number | null;
  carId: number | null;
  /** Team slug to pull teammates' laps for, or null for just your own. */
  teamSlug: string | null;
  /** Maximum lap age in days, as Garage61's `age` parameter. */
  ageDays: number;
}

export interface Garage61FetchProgress {
  loading: boolean;
  /** Laps received so far — the only progress signal Garage61 offers, since
   *  its lap search returns no cursor or total up front. */
  lapsLoaded: number;
  error: string | null;
  /** True when MAX_PAGES was reached with more laps still available. */
  truncated: boolean;
}

const IDLE: Garage61FetchProgress = {
  loading: false,
  lapsLoaded: 0,
  error: null,
  truncated: false,
};

async function readError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as Garage61ErrorBody;
    return body.message || body.error || `Request failed (${response.status}).`;
  } catch {
    return `Request failed (${response.status}).`;
  }
}

/** Owns everything about talking to Garage61 from the browser, so `/core`
 *  stays pure and the page component stays presentational.
 *
 *  Every call goes to this app's own `/api/g61/*` routes, never to Garage61
 *  directly — that API sends no CORS headers, and the token is httpOnly and
 *  deliberately unreachable from here. */
export function useGarage61() {
  const [status, setStatus] = useState<Garage61ConnectionStatus>("checking");
  const [profile, setProfile] = useState<Garage61Profile | null>(null);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);

  const [reference, setReference] = useState<Garage61Reference | null>(null);
  const [referenceError, setReferenceError] = useState<string | null>(null);

  const [progress, setProgress] = useState<Garage61FetchProgress>(IDLE);

  // Restore the connected state on mount. The cookie is httpOnly, so asking
  // the server is the only way to know whether one is present.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/g61/session");
        if (cancelled) return;
        if (response.ok) {
          setProfile((await response.json()) as Garage61Profile);
          setStatus("connected");
        } else {
          setStatus("disconnected");
        }
      } catch {
        if (!cancelled) setStatus("disconnected");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Track and car lists are needed before any lap search can run (`/laps`
  // requires a track), so fetch them as soon as there's a connection.
  useEffect(() => {
    // Clearing on disconnect is `disconnect`'s job, not this effect's —
    // setting state synchronously in an effect body cascades renders.
    if (status !== "connected") return;

    let cancelled = false;

    (async () => {
      try {
        const response = await fetch("/api/g61/reference");
        if (cancelled) return;
        if (response.ok) {
          setReference((await response.json()) as Garage61Reference);
          setReferenceError(null);
        } else {
          setReferenceError(await readError(response));
        }
      } catch {
        if (!cancelled) setReferenceError("Could not load tracks and cars.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [status]);

  const connect = useCallback(async (token: string) => {
    setConnecting(true);
    setConnectError(null);
    try {
      const response = await fetch("/api/g61/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (response.ok) {
        setProfile((await response.json()) as Garage61Profile);
        setStatus("connected");
      } else {
        setConnectError(await readError(response));
      }
    } catch {
      setConnectError("Could not reach the server.");
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    await fetch("/api/g61/session", { method: "DELETE" });
    setProfile(null);
    setStatus("disconnected");
    setReference(null);
    setProgress(IDLE);
  }, []);

  /** Fetches every matching lap and groups it back into sessions.
   *
   *  Pages are walked here rather than looped server-side: one request per
   *  page keeps each invocation short (a server loop would hit a function
   *  timeout once hosted) and lets the lap count tick up while a long search
   *  loads. */
  const fetchSessions = useCallback(
    async (filters: Garage61LapFilters): Promise<Garage61Session[]> => {
      if (filters.trackId === null) {
        setProgress({ ...IDLE, error: "Choose a track first." });
        return [];
      }

      setProgress({ loading: true, lapsLoaded: 0, error: null, truncated: false });

      const laps: RawGarage61Lap[] = [];

      for (let page = 0; page < MAX_PAGES; page++) {
        const params = new URLSearchParams({
          tracks: String(filters.trackId),
          age: String(filters.ageDays),
          offset: String(laps.length),
        });
        if (filters.carId !== null) params.set("cars", String(filters.carId));
        // Without a team, Garage61 defaults to you and all your teammates;
        // naming one narrows it to that team's drivers.
        if (filters.teamSlug) params.set("teams", filters.teamSlug);

        let response: Response;
        try {
          response = await fetch(`/api/g61/laps?${params}`);
        } catch {
          setProgress({
            loading: false,
            lapsLoaded: laps.length,
            error: "Could not reach the server.",
            truncated: false,
          });
          return [];
        }

        if (!response.ok) {
          setProgress({
            loading: false,
            lapsLoaded: laps.length,
            error: await readError(response),
            truncated: false,
          });
          return [];
        }

        const body = (await response.json()) as {
          items: RawGarage61Lap[];
          hasMore: boolean;
        };
        laps.push(...body.items);
        setProgress((prev) => ({ ...prev, lapsLoaded: laps.length }));

        if (!body.hasMore) {
          setProgress({
            loading: false,
            lapsLoaded: laps.length,
            error: null,
            truncated: false,
          });
          return groupG61ApiLapsIntoSessions(laps);
        }
      }

      setProgress({
        loading: false,
        lapsLoaded: laps.length,
        error: null,
        truncated: true,
      });
      return groupG61ApiLapsIntoSessions(laps);
    },
    [],
  );

  return {
    status,
    profile,
    connect,
    connecting,
    connectError,
    disconnect,
    reference,
    referenceError,
    fetchSessions,
    progress,
  };
}
