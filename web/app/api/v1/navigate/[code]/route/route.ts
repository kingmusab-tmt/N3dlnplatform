// GET /api/v1/navigate/:code/route?from=lng,lat&profile=driving[&claim=<id>]
// Road route from a rider's position to the building, plus the on-foot
// "last mile" from where the road ends to the gate (or building center).
import { formatPostcode, normalizePostcode } from '@/lib/postcode';
import { LOOKUP_BY_CODE_SQL, buildingBody } from '@/lib/server/buildings';
import { getClaimGate } from '@/lib/server/claims';
import { DirectionsError, PROFILES, type Profile } from '@/lib/server/directions';
import { apiRoute, jsonError, parseLngLat } from '@/lib/server/http';
import { destinationFor, lastMileLeg } from '@/lib/server/navigate';

export const GET = apiRoute<{ code: string }>(async (req, { params, deps }) => {
  const query = new URL(req.url).searchParams;
  const code = normalizePostcode(params.code);
  if (!code) return jsonError(400, 'INVALID_POSTCODE', 'Expected an 11-character NIPOST code.');

  const from = parseLngLat(query.get('from'));
  if (!from) return jsonError(400, 'INVALID_ORIGIN', 'from must be "lng,lat", e.g. from=7.4790,9.0700.');

  const profile = (query.get('profile') ?? 'driving') as Profile;
  if (!PROFILES.includes(profile)) {
    return jsonError(400, 'INVALID_PROFILE', `profile must be one of: ${PROFILES.join(', ')}.`);
  }
  if (!deps.directions) return jsonError(503, 'ROUTING_NOT_CONFIGURED', 'Routing is not configured on this server.');

  const { rows } = await deps.db.query(LOOKUP_BY_CODE_SQL, [code]);
  if (rows.length === 0) {
    return jsonError(404, 'POSTCODE_NOT_FOUND', `No building is registered for ${formatPostcode(code)}.`);
  }
  const row = rows[0];
  // A shared link's owner may have marked their own gate; it beats the building default.
  const claimId = query.get('claim');
  const claimGate = claimId ? await getClaimGate(deps.db, claimId, code) : null;
  const destination = claimGate
    ? { point: claimGate, kind: 'gate' as const, source: 'claim' as const }
    : destinationFor(row);

  try {
    const { snappedDestination, ...route } = await deps.directions.route(from, destination.point, profile);
    return Response.json(
      buildingBody(code, row, {
        source: 'platform',
        profile,
        origin: from,
        destination,
        route,
        lastMile: lastMileLeg(snappedDestination, destination.point),
      }),
    );
  } catch (err) {
    if (!(err instanceof DirectionsError)) throw err;
    return jsonError(err.httpStatus, err.code.toUpperCase(), err.message);
  }
});
