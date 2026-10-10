import { formatPostcode } from '../postcode';
import type { BuildingRow } from './buildings';
import type { LngLat } from './directions';
import { NipostError, type NipostClient, type NipostLookup } from './nipost';

export type VerificationStatus = 'verified' | 'unregistered' | 'not_in_sandbox' | 'unavailable' | 'not_configured';

export async function verifyWithNipost(nipost: NipostClient | null, code: string) {
  if (!nipost) {
    return { lookup: null, verification: { source: 'nipost', status: 'not_configured' as VerificationStatus } };
  }
  try {
    const lookup: NipostLookup = await nipost.lookup(code);
    const status: VerificationStatus = lookup.valid
      ? 'verified'
      : nipost.environment === 'test'
        ? 'not_in_sandbox'
        : 'unregistered';
    return {
      lookup,
      verification: {
        source: 'nipost',
        status,
        environment: nipost.environment,
        level: nipost.level,
        ...(lookup.address && { address: lookup.address }),
        ...(lookup.buildingUse && { building_use: lookup.buildingUse }),
      },
    };
  } catch (err) {
    // NIPOST being down or rejecting our key must not take the platform down with it.
    if (!(err instanceof NipostError)) throw err;
    console.warn(`NIPOST lookup failed for ${code}: [${err.code}] ${err.message}`);
    return {
      lookup: null,
      verification: { source: 'nipost', status: 'unavailable' as VerificationStatus, reason: err.code },
    };
  }
}

export function notFoundMessage(code: string, status: VerificationStatus) {
  const formatted = formatPostcode(code);
  if (status === 'unregistered') return `${formatted} is not a registered NIPOST postcode.`;
  if (status === 'not_in_sandbox') {
    return `${formatted} isn't mapped on this platform, and NIPOST's test sandbox doesn't include it. A test API key can't check real postcodes; that needs a live key.`;
  }
  return `No building is registered for ${formatted}.`;
}

export type Destination = { point: LngLat; kind: 'gate' | 'center'; source: 'claim' | 'map' | 'building' };

/**
 * Riders should end at the gate when one is mapped (from OpenStreetMap
 * entrances), otherwise the building center. An owner's own gate on a claim
 * overrides this; see the route endpoint.
 */
export function destinationFor(row: BuildingRow): Destination {
  const gate = row.metadata?.gate;
  if (Number.isFinite(gate?.lng) && Number.isFinite(gate?.lat)) {
    return { point: [gate.lng, gate.lat], kind: 'gate', source: 'map' };
  }
  return { point: row.center.coordinates, kind: 'center', source: 'building' };
}

/** Straight on-foot leg from where the road route ends to the destination. */
export function lastMileLeg(snapped: { point: LngLat }, destination: LngLat) {
  const distance = haversineMetres(snapped.point, destination);
  if (distance < 3) return null;
  return {
    geometry: { type: 'LineString', coordinates: [snapped.point, destination] },
    distance_m: Math.round(distance),
  };
}

export function haversineMetres([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}
