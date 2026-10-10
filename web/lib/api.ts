// Server-side calls from Next.js to the Express API (not used in the browser,
// which goes through the /api/v1 proxy route instead).
import { headers } from 'next/headers';
import 'server-only';
import type { SharedPlace } from './postcode';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';
const API_KEY = process.env.API_KEY;

/** Returns the shared place behind a claim link, or null if it doesn't exist. */
export async function fetchSharedPlace(id: string): Promise<SharedPlace | null> {
  const incoming = await headers();
  const visitorIp = incoming.get('x-real-ip') ?? incoming.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown';

  const res = await fetch(`${API_URL}/api/v1/claims/${encodeURIComponent(id)}`, {
    cache: 'no-store',
    headers: { ...(API_KEY && { 'X-API-Key': API_KEY }), 'X-Forwarded-For': visitorIp },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Claim lookup failed (HTTP ${res.status})`);
  return (await res.json()) as SharedPlace;
}
