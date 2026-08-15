import { cookies } from "next/headers";
import { DRIVING_DATA_PERMISSION, type Garage61Profile } from "./garage61-types";

// Server-side only. Nothing here may be imported from a client component: it
// reads the user's Garage61 token. There's no `server-only` package in this
// project to enforce that at build time, but `next/headers` below already
// throws if this module is pulled into a client bundle.

/** Garage61's REST API. Server-side only — the API sends no CORS headers at
 *  all (verified: an `OPTIONS` preflight returns 200 with no
 *  `Access-Control-Allow-*`), so the browser physically cannot call it. Every
 *  request goes through the route handlers in `src/app/api/g61/`, which is
 *  also what keeps the user's token out of client JavaScript. */
export const GARAGE61_API_BASE = "https://garage61.net/api/v1";

/** Name of the httpOnly cookie holding the Personal Access Token. */
export const G61_COOKIE = "g61_token";

/** Upstream calls shouldn't be able to hang a route handler indefinitely. */
const UPSTREAM_TIMEOUT_MS = 20_000;

export class Garage61Error extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter?: string,
  ) {
    super(message);
    this.name = "Garage61Error";
  }
}

/** Reads the token from the request's cookie. Never returned to the client and
 *  never logged — the only thing that happens to it is being put in an
 *  `Authorization` header. */
export async function readGarage61Token(): Promise<string | null> {
  const store = await cookies();
  const value = store.get(G61_COOKIE)?.value;
  return value && value.length > 0 ? value : null;
}

/** `Secure` is set only on https so the cookie still works on
 *  `http://localhost`, and hardens itself automatically if this is ever
 *  deployed — no environment flag to remember to flip. */
export function cookieOptions(request: Request) {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: new URL(request.url).protocol === "https:",
    path: "/",
    // Roughly a season of practice. The cookie is the only place the token
    // lives, so this is also how long "stay connected" lasts.
    maxAge: 60 * 60 * 24 * 90,
  };
}

/** One authenticated GET against the Garage61 API.
 *
 *  Upstream failures are translated into `Garage61Error` with a stable `code`
 *  the UI can branch on, rather than leaking Garage61's own response body —
 *  which for a 401 is a generic "supply a Bearer token" message that would be
 *  actively confusing to show a user who just pasted one. */
export async function garage61Get<T>(
  path: string,
  token: string,
  searchParams?: URLSearchParams,
): Promise<T> {
  const query = searchParams?.toString();
  const url = `${GARAGE61_API_BASE}${path}${query ? `?${query}` : ""}`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "TimeoutError";
    throw new Garage61Error(
      504,
      timedOut ? "upstream_timeout" : "upstream_unreachable",
      timedOut
        ? "Garage61 took too long to respond."
        : "Could not reach Garage61.",
    );
  }

  if (response.ok) return (await response.json()) as T;

  switch (response.status) {
    case 401:
      throw new Garage61Error(401, "invalid_token", "Garage61 rejected that token.");
    case 403:
      throw new Garage61Error(
        403,
        "forbidden",
        `Your token is valid but lacks the "${DRIVING_DATA_PERMISSION}" permission for this data.`,
      );
    case 429:
      // Garage61 rate-limits but doesn't document the limits, so pass their
      // own Retry-After straight through rather than guessing a backoff.
      throw new Garage61Error(
        429,
        "rate_limited",
        "Garage61 is rate-limiting this token. Wait a moment and try again.",
        response.headers.get("retry-after") ?? undefined,
      );
    default:
      throw new Garage61Error(
        502,
        "upstream_error",
        `Garage61 returned ${response.status}.`,
      );
  }
}

/** Garage61's list endpoints are not consistently shaped, so never assume.
 *
 *  Verified against the live API: `/laps` returns a `{ items: [...] }`
 *  envelope, but `/tracks`, `/cars` and `/teams` return a **bare array**.
 *  Reading `.items` off the latter yields `undefined` and, with the obvious
 *  `?? []` fallback, an empty list rather than an error — which presents as
 *  dropdowns that are simply empty, with nothing in any log to explain why.
 *  Accept either shape. */
export function garage61List<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const items = (payload as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? (items as T[]) : [];
}

/** Turns any thrown error into the JSON envelope the client hook expects.
 *  Deliberately does not include the upstream body or the token. */
export function garage61ErrorResponse(error: unknown): Response {
  if (error instanceof Garage61Error) {
    return Response.json(
      { error: error.code, message: error.message },
      {
        status: error.status,
        headers: error.retryAfter ? { "Retry-After": error.retryAfter } : undefined,
      },
    );
  }
  return Response.json(
    { error: "internal_error", message: "Something went wrong talking to Garage61." },
    { status: 500 },
  );
}

/** The 401 used when there's no cookie at all — answered locally, without
 *  touching Garage61. */
export function notConnectedResponse(): Response {
  return Response.json(
    { error: "not_connected", message: "No Garage61 token is connected." },
    { status: 401 },
  );
}

interface RawMeResponse {
  slug?: string;
  firstName?: string;
  lastName?: string;
  nickName?: string;
  subscriptionPlan?: string;
  apiPermissions?: string[];
  teams?: { id?: string; name?: string; slug?: string }[];
}

/** Fetches `/me` and narrows it to what the UI needs. Doubles as token
 *  validation: it's the cheapest authenticated call Garage61 offers. */
export async function fetchGarage61Profile(token: string): Promise<Garage61Profile> {
  const me = await garage61Get<RawMeResponse>("/me", token);
  const name =
    [me.firstName, me.lastName].filter(Boolean).join(" ").trim() ||
    me.nickName?.trim() ||
    me.slug?.trim() ||
    "Garage61 user";

  return {
    slug: me.slug ?? "",
    name,
    subscriptionPlan: me.subscriptionPlan ?? null,
    apiPermissions: Array.isArray(me.apiPermissions) ? me.apiPermissions : [],
    teams: (me.teams ?? []).map((team) => ({
      id: team.id ?? "",
      name: team.name ?? "",
      slug: team.slug ?? "",
    })),
  };
}
