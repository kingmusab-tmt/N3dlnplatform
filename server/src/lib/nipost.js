// Client for the NIPOST Digital Postcode API (https://docs.postcode.gov.ng).
//
// GET /v1/lookup?code=EK-01-A03-FK-01&level=N with an X-API-Key header.
// Levels are cumulative: L1 = validity only, L2 = address, L3 = building use,
// L4 = other building info, L5 = point geometry. Use a *secret* key here
// (nipost_test_… / nipost_live_…); it must never be shipped to a browser.
import { hyphenatePostcode } from './postcode.js';

export class NipostError extends Error {
  constructor(code, message, httpStatus) {
    super(message);
    this.name = 'NipostError';
    this.code = code;
    this.httpStatus = httpStatus;
  }
}

/**
 * @typedef {{
 *   valid: boolean,
 *   postcode: string,
 *   level: number,
 *   point: [number, number] | null,   // [lng, lat], L5 only
 *   address: Record<string, unknown> | null,
 *   buildingUse: string | null,
 * }} NipostLookup
 */

export function createNipostClient({
  apiKey,
  baseUrl = 'https://api.postcode.gov.ng',
  level = 1,
  timeoutMs = 5000,
  cacheTtlMs = 10 * 60_000,
  cacheMax = 1000,
  fetchImpl = fetch,
}) {
  if (!apiKey) throw new Error('createNipostClient: apiKey is required');
  if (/^nipost_pk_/.test(apiKey)) {
    throw new Error('NIPOST_API_KEY is a publishable key; the server needs a secret key (nipost_test_… or nipost_live_…).');
  }

  // Test keys only resolve NIPOST's small curated sandbox, never the live
  // postcode database, so a "not found" under a test key says nothing about
  // whether a real code exists.
  const environment = /^nipost_live_/.test(apiKey) ? 'live' : 'test';

  // Short-lived in-memory cache so repeat searches don't re-hit NIPOST's rate limits.
  const cache = new Map();

  /** @returns {Promise<NipostLookup>} */
  async function lookup(canonicalCode) {
    const hit = cache.get(canonicalCode);
    if (hit && hit.expires > Date.now()) return hit.value;

    const url = new URL('/v1/lookup', baseUrl);
    url.searchParams.set('code', hyphenatePostcode(canonicalCode));
    url.searchParams.set('level', String(level));

    let res;
    try {
      res = await fetchImpl(url, {
        headers: { 'X-API-Key': apiKey, Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new NipostError('network_error', `NIPOST API unreachable: ${err.message}`, 0);
    }

    const body = await res.json().catch(() => null);

    if (!res.ok) {
      // NIPOST reports an unknown or malformed code as a client error; treat it as "not registered".
      if (res.status === 404 || res.status === 400 || res.status === 422) {
        return remember(canonicalCode, notRegistered(canonicalCode));
      }
      throw new NipostError(
        body?.error?.code ?? `http_${res.status}`,
        body?.error?.message ?? `NIPOST API returned HTTP ${res.status}`,
        res.status,
      );
    }

    const data = body?.data ?? {};
    return remember(canonicalCode, {
      valid: data.valid === true,
      postcode: data.postcode ?? hyphenatePostcode(canonicalCode),
      level,
      point: parsePoint(data.point_geometry),
      address: data.administrative_address ?? null,
      buildingUse: data.building_use_status ?? null,
    });
  }

  function remember(key, value) {
    if (cache.size >= cacheMax) cache.delete(cache.keys().next().value);
    cache.set(key, { value, expires: Date.now() + cacheTtlMs });
    return value;
  }

  function notRegistered(canonicalCode) {
    return { valid: false, postcode: hyphenatePostcode(canonicalCode), level, point: null, address: null, buildingUse: null };
  }

  return { lookup, level, environment };
}

// NIPOST doesn't document the L5 point shape, so accept the common encodings:
// GeoJSON Point, {lng|lon|longitude, lat|latitude}, or a bare [lng, lat] pair.
export function parsePoint(geom) {
  if (!geom || typeof geom !== 'object') return null;
  const pair = Array.isArray(geom) ? geom : Array.isArray(geom.coordinates) ? geom.coordinates : null;
  const lng = pair ? pair[0] : (geom.lng ?? geom.lon ?? geom.longitude);
  const lat = pair ? pair[1] : (geom.lat ?? geom.latitude);
  const ok = Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
  return ok ? [lng, lat] : null;
}
