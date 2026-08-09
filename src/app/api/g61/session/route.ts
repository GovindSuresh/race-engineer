import { cookies } from "next/headers";
import {
  G61_COOKIE,
  cookieOptions,
  fetchGarage61Profile,
  garage61ErrorResponse,
  notConnectedResponse,
  readGarage61Token,
} from "@/lib/garage61-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Who, if anyone, is connected. Lets the UI restore the connected state on
 *  load without the token ever being readable by client JavaScript. */
export async function GET() {
  const token = await readGarage61Token();
  if (!token) return notConnectedResponse();

  try {
    return Response.json(await fetchGarage61Profile(token));
  } catch (error) {
    return garage61ErrorResponse(error);
  }
}

/** Connects a Personal Access Token.
 *
 *  The token is validated against `/me` BEFORE the cookie is set, so a typo
 *  produces an error message instead of a connected-looking UI that fails on
 *  the first lap fetch. */
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
