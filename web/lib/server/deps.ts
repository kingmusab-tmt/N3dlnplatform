// Wires the API's dependencies from environment variables, once per instance.
// Tests swap them out with setDepsForTesting().
import 'server-only';
import { createKeyStore, type KeyStore } from './apiKeys';
import { createAuthReader, type AuthReader } from './auth';
import { getPool, type Db } from './db';
import { createDirectionsClient, type DirectionsClient } from './directions';
import { createNipostClient, type NipostClient } from './nipost';
import { createPostgresLimiter, type Limiter } from './rateLimit';

export type Deps = {
  db: Db;
  nipost: NipostClient | null;
  directions: DirectionsClient | null;
  limiter: Limiter;
  keys: KeyStore;
  /** The signed-in website user, from the Supabase session cookie. */
  auth: AuthReader;
};

let deps: Deps | null = null;

export function getDeps(): Deps {
  if (deps) return deps;

  const db = getPool();
  const nipost = process.env.NIPOST_API_KEY
    ? createNipostClient({
        apiKey: process.env.NIPOST_API_KEY,
        baseUrl: process.env.NIPOST_API_URL || undefined,
        level: Number(process.env.NIPOST_LOOKUP_LEVEL || 1),
      })
    : null;
  // Server-side routing token; falls back to the public map token, which works for Directions.
  const mapboxToken = process.env.MAPBOX_TOKEN || process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const directions = mapboxToken ? createDirectionsClient({ accessToken: mapboxToken }) : null;

  if (!nipost) console.warn('NIPOST_API_KEY not set: postcodes will not be verified against NIPOST.');
  if (!directions) console.warn('No Mapbox token: /navigate/:code/route is disabled.');

  deps = { db, nipost, directions, limiter: createPostgresLimiter(db), keys: createKeyStore(db), auth: createAuthReader() };
  return deps;
}

export function setDepsForTesting(next: Deps | null) {
  deps = next;
}
