import { describeGarage61LapShape, parseGarage61ApiLaps } from "@/core";
import {
  garage61ErrorResponse,
  garage61Get,
  notConnectedResponse,
  readGarage61Token,
} from "@/lib/garage61-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Garage61's documented maximum, and its default. One page per request. */
const PAGE_SIZE = 1000;

/** Filters the client is allowed to set. Everything else about the query is
 *  fixed below — see FORCED_PARAMS for why that isn't negotiable. */
const CLIENT_PARAMS = [
  "tracks",
  "cars",
  "teams",
  "drivers",
  "extraDrivers",
  "seasons",
  "age",
  "after",
  "sessionTypes",
  "event",
] as const;

/** The three `/laps` defaults that would silently return the wrong data.
 *
 *  Each one fails quietly rather than erroring, which is what makes them
 *  dangerous — you get a plausible-looking response containing the wrong laps:
 *
 *  - `group` defaults to `driver`, which returns only each driver's PERSONAL
 *    BEST lap. A stint analysis fed one lap per driver looks empty, not broken.
 *  - `lapTypes` defaults to normal laps only, stripping in- and out-laps. That
 *    removes the pit flags `deriveStints` splits on, so every session would
 *    collapse into a single stint, and the "No pit laps" filter would have
 *    nothing left to drop.
 *  - `unclean` defaults false. The CSV export includes unclean laps and
 *    "Clean laps only" is a user-facing toggle, so the data has to arrive
 *    unfiltered for that toggle to mean anything.
 *
 *  Forced here rather than in the client so no caller can get it wrong. */
const FORCED_PARAMS: Record<string, string> = {
  group: "none",
  lapTypes: "1,2,3,4",
  unclean: "true",
  limit: String(PAGE_SIZE),
};

/** One page of laps.
 *
 *  Paginating from the client rather than looping here is deliberate: a loop
 *  would be a single long-running invocation that hits a serverless function
 *  timeout the moment this is hosted, and it couldn't report progress while a
 *  long session loaded. */
export async function GET(request: Request) {
  const token = await readGarage61Token();
  if (!token) return notConnectedResponse();

  const requested = new URL(request.url).searchParams;

  // `/laps` requires a track — there is no unfiltered lap search.
  const tracks = requested.get("tracks");
  if (!tracks) {
    return Response.json(
      {
        error: "bad_request",
        message: "Choose a track first — Garage61 requires one to search laps.",
      },
      { status: 400 },
    );
  }

  const offset = Number(requested.get("offset") ?? "0");
  if (!Number.isInteger(offset) || offset < 0) {
    return Response.json(
      { error: "bad_request", message: "`offset` must be a non-negative integer." },
      { status: 400 },
    );
  }

  const params = new URLSearchParams();
  for (const key of CLIENT_PARAMS) {
    const value = requested.get(key);
    if (value !== null && value !== "") params.set(key, value);
  }
  for (const [key, value] of Object.entries(FORCED_PARAMS)) params.set(key, value);
  params.set("offset", String(offset));

  try {
    const payload = await garage61Get<unknown>("/laps", token, params);
    const items = parseGarage61ApiLaps(payload);

    return Response.json({
      items,
      // Garage61 reports no cursor, so a full page is the only signal there
      // may be another one.
      hasMore: items.length === PAGE_SIZE,
      offset,
      total: (payload as { total?: number })?.total ?? null,
      // Cheap self-diagnosis for the first run against the live API: names any
      // field the documented schema doesn't cover and reports the `sectors`
      // key shape, which the docs leave unspecified.
      shape: describeGarage61LapShape(items),
    });
  } catch (error) {
    return garage61ErrorResponse(error);
  }
}
