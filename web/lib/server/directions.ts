// Road routing via the Mapbox Directions API. Kept behind this small interface
// so the provider can be swapped (OSRM, Valhalla, Google) without touching routes.
export class DirectionsError extends Error {
  constructor(
    public code: string,
    message: string,
    public httpStatus = 502,
  ) {
    super(message);
    this.name = 'DirectionsError';
  }
}

export const PROFILES = ['driving', 'cycling', 'walking'] as const;
export type Profile = (typeof PROFILES)[number];

export type LngLat = [number, number];

export type Route = {
  geometry: { type: 'LineString'; coordinates: LngLat[] };
  distance_m: number;
  duration_s: number;
  steps: { instruction: string; distance_m: number; road: string; maneuver: string; location: LngLat }[];
  snappedDestination: { point: LngLat; offset_m: number };
};

export type DirectionsClient = {
  route: (from: LngLat, to: LngLat, profile?: Profile) => Promise<Route>;
  /** Best visiting order for stops, starting from `from`: indexes into `stops`. */
  optimizeOrder: (from: LngLat, stops: LngLat[], profile?: Profile) => Promise<number[]>;
};

/** Mapbox's Optimization API takes at most 12 coordinates: the start plus 11 stops. */
export const MAX_OPTIMIZED_STOPS = 11;

export function createDirectionsClient({
  accessToken,
  baseUrl = 'https://api.mapbox.com',
  timeoutMs = 8000,
  fetchImpl = fetch,
}: {
  accessToken: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}): DirectionsClient {
  if (!accessToken) throw new Error('createDirectionsClient: accessToken is required');

  async function route(from: LngLat, to: LngLat, profile: Profile = 'driving'): Promise<Route> {
    if (!PROFILES.includes(profile)) throw new DirectionsError('invalid_profile', `Unknown profile ${profile}`, 400);

    const coords = `${from[0]},${from[1]};${to[0]},${to[1]}`;
    const url = new URL(`/directions/v5/mapbox/${profile}/${coords}`, baseUrl);
    url.searchParams.set('geometries', 'geojson');
    url.searchParams.set('overview', 'full');
    url.searchParams.set('steps', 'true');
    url.searchParams.set('access_token', accessToken);

    let res: Response;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new DirectionsError('network_error', `Routing service unreachable: ${(err as Error).message}`);
    }
    const body = await res.json().catch(() => null);

    // Mapbox reports "no route" and bad coordinates as 200/422 with a code field.
    if (body?.code === 'NoRoute' || body?.code === 'NoSegment') {
      throw new DirectionsError('no_route', 'No road route found between these points.', 422);
    }
    if (!res.ok || body?.code !== 'Ok' || !body.routes?.length) {
      throw new DirectionsError('routing_failed', body?.message ?? `Routing service returned HTTP ${res.status}`);
    }

    const r = body.routes[0];
    const end = body.waypoints?.[1];
    return {
      geometry: r.geometry,
      distance_m: Math.round(r.distance),
      duration_s: Math.round(r.duration),
      steps: (r.legs?.[0]?.steps ?? []).map((s: any) => ({
        instruction: s.maneuver?.instruction ?? '',
        distance_m: Math.round(s.distance),
        road: s.name ?? '',
        maneuver: s.maneuver?.type ?? '',
        location: s.maneuver?.location,
      })),
      snappedDestination: { point: end?.location ?? to, offset_m: Math.round(end?.distance ?? 0) },
    };
  }

  async function optimizeOrder(from: LngLat, stops: LngLat[], profile: Profile = 'driving'): Promise<number[]> {
    if (stops.length < 2) return stops.map((_, i) => i);
    if (stops.length > MAX_OPTIMIZED_STOPS) {
      throw new DirectionsError('too_many_stops', `Route optimisation supports up to ${MAX_OPTIMIZED_STOPS} stops.`, 400);
    }
    const coords = [from, ...stops].map(([lng, lat]) => `${lng},${lat}`).join(';');
    const url = new URL(`/optimized-trips/v1/mapbox/${profile}/${coords}`, baseUrl);
    // A round trip from the rider's position gives the best order; the return leg is ignored.
    url.searchParams.set('source', 'first');
    url.searchParams.set('roundtrip', 'true');
    url.searchParams.set('access_token', accessToken);

    let res: Response;
    try {
      res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) });
    } catch (err) {
      throw new DirectionsError('network_error', `Routing service unreachable: ${(err as Error).message}`);
    }
    const body = await res.json().catch(() => null);
    if (!res.ok || body?.code !== 'Ok' || !Array.isArray(body.waypoints)) {
      throw new DirectionsError('optimization_failed', body?.message ?? `Route optimisation returned HTTP ${res.status}`);
    }
    // waypoints[i].waypoint_index is input i's position in the trip; input 0 is the rider.
    return body.waypoints
      .slice(1)
      .map((w: { waypoint_index: number }, i: number) => ({ stop: i, at: w.waypoint_index }))
      .sort((a: { at: number }, b: { at: number }) => a.at - b.at)
      .map((x: { stop: number }) => x.stop);
  }

  return { route, optimizeOrder };
}
