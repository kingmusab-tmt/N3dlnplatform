// Server-side calls from Next.js to the Express API (not used in the browser,
// which goes through the /api/v1 rewrite instead).
import 'server-only';
import type { SharedPlace } from './postcode';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

/** Returns the shared place behind a claim link, or null if it doesn't exist. */
export async function fetchSharedPlace(id: string): Promise<SharedPlace | null> {
  const res = await fetch(`${API_URL}/api/v1/claims/${encodeURIComponent(id)}`, { cache: 'no-store' });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Claim lookup failed (HTTP ${res.status})`);
  return (await res.json()) as SharedPlace;
}
