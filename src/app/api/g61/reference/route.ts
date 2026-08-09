import {
  garage61ErrorResponse,
  garage61Get,
  notConnectedResponse,
  readGarage61Token,
} from "@/lib/garage61-server";
import type { Garage61Reference } from "@/lib/garage61-types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ListEnvelope<T> {
  items?: T[];
}

interface RawTrack {
  id?: number;
  name?: string;
  variant?: string;
  platform?: string;
}

interface RawCar {
  id?: number;
  name?: string;
  platform?: string;
}

interface RawTeam {
  id?: string;
  name?: string;
  slug?: string;
}

/** Everything the session picker's dropdowns need, in one round trip.
 *
 *  `tracks` exists because `/laps` REQUIRES a track id — there is no "give me
 *  everything" lap search, so the UI can't fetch anything until a track is
 *  chosen. All three lists are personalised to the token's user. */
export async function GET() {
  const token = await readGarage61Token();
  if (!token) return notConnectedResponse();

  try {
    const [tracks, cars, teams] = await Promise.all([
      garage61Get<ListEnvelope<RawTrack>>("/tracks", token),
      garage61Get<ListEnvelope<RawCar>>("/cars", token),
      garage61Get<ListEnvelope<RawTeam>>("/teams", token),
    ]);

    const reference: Garage61Reference = {
      tracks: (tracks.items ?? [])
        .filter((track): track is RawTrack & { id: number } => typeof track.id === "number")
        .map((track) => ({
          id: track.id,
          name: track.name ?? `Track ${track.id}`,
          variant: track.variant ?? null,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      cars: (cars.items ?? [])
        .filter((car): car is RawCar & { id: number } => typeof car.id === "number")
        .map((car) => ({ id: car.id, name: car.name ?? `Car ${car.id}` }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      teams: (teams.items ?? [])
        .filter((team): team is RawTeam & { slug: string } => typeof team.slug === "string")
        .map((team) => ({ slug: team.slug, name: team.name ?? team.slug })),
    };

    return Response.json(reference);
  } catch (error) {
    return garage61ErrorResponse(error);
  }
}
