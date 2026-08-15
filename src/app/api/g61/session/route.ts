import { cookies } from "next/headers";
import {
  G61_COOKIE,
  PROFILE_TTL_MS,
  cookieOptions,
  fetchGarage61Profile,
  garage61ErrorResponse,
  notConnectedResponse,
  readGarage61Token,
} from "@/lib/garage61-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who, if anyone, is connected. Lets the UI restore the connected state on
 *  load without the token ever being readable by client JavaScript.
 *
 *  Briefly cached, unlike the POST below: this is a read that runs on every
 *  mount, so a refresh or a tab switch shouldn't cost an upstream call, but the
 *  window is kept to a minute so a token revoked on Garage61 stops looking
 *  connected almost immediately. */
export async function GET() {
  const token = await readGarage61Token();
  if (!token) return notConnectedResponse();

  try {
    return Response.json(await fetchGarage61Profile(token, PROFILE_TTL_MS));
  } catch (error) {
    return garage61ErrorResponse(error);
  }
}

/** Connects a Personal Access Token.
 *
 *  The token is validated against `/me` BEFORE the cookie is set, so a typo
 *  produces an error message instead of a connected-looking UI that fails on
 *  the first lap fetch. That validation is deliberately NOT cached — this is
 *  the call that decides whether to hand out a session, so it has to see the
 *  token's real current state rather than a minute-old one. */
export async function POST(request: Request) {
  let token: unknown;
  try {
    ({ token } = await request.json());
  } catch {
    return Response.json(
      { error: "bad_request", message: "Expected a JSON body with a `token` field." },
      { status: 400 },
    );
  }

  if (typeof token !== "string" || token.trim().length === 0) {
    return Response.json(
      { error: "bad_request", message: "Paste your Garage61 personal access token." },
      { status: 400 },
    );
  }

  const trimmed = token.trim();

  try {
    const profile = await fetchGarage61Profile(trimmed);
    const store = await cookies();
    store.set(G61_COOKIE, trimmed, cookieOptions(request));
    return Response.json(profile);
  } catch (error) {
    return garage61ErrorResponse(error);
  }
}

/** Disconnects. Clearing the cookie is the whole operation — nothing about
 *  the token is persisted anywhere else. */
export async function DELETE(request: Request) {
  const store = await cookies();
  store.set(G61_COOKIE, "", { ...cookieOptions(request), maxAge: 0 });
  return Response.json({ disconnected: true });
}
