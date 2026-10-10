// Data access for server components. They run next to the API code, so they
// query the database directly instead of calling /api/v1 over HTTP.
import 'server-only';
import type { SharedPlace } from './postcode';
import { getSharedPlace } from './server/claims';
import { getDeps } from './server/deps';

/** Returns the shared place behind a claim link, or null if it doesn't exist. */
export async function fetchSharedPlace(id: string): Promise<SharedPlace | null> {
  return (await getSharedPlace(getDeps().db, id)) as SharedPlace | null;
}
