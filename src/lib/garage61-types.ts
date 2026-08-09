/** Shapes the `/api/g61/*` routes exchange with the browser.
 *
 *  Deliberately free of imports so both sides can use it: `garage61-server.ts`
 *  pulls in `next/headers` and must never reach a client bundle, and the UI
 *  hook must never reach the server's token handling. */

export interface Garage61Profile {
  slug: string;
  name: string;
  subscriptionPlan: string | null;
  /** Permissions the token actually carries. `driving_data` is the one `/laps`
   *  needs, and Garage61 grants it per-application with the user's opt-in — so
   *  a token can authenticate fine and still not read laps. */
  apiPermissions: string[];
  teams: { id: string; name: string; slug: string }[];
}

export interface Garage61Reference {
  tracks: { id: number; name: string; variant: string | null }[];
  cars: { id: number; name: string }[];
  teams: { slug: string; name: string }[];
}

/** Error envelope every route returns on failure. `error` is a stable code the
 *  UI can branch on; `message` is already written for a human to read. */
export interface Garage61ErrorBody {
  error: string;
  message: string;
}

export const DRIVING_DATA_PERMISSION = "driving_data";
