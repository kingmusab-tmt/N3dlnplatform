// GET /api/v1/navigate/:code — resolve a postcode to its building.
import { formatPostcode, normalizePostcode } from '@/lib/postcode';
import { LOOKUP_BY_CODE_SQL, LOOKUP_BY_POINT_SQL, baseBody, buildingBody } from '@/lib/server/buildings';
import { apiRoute, jsonError } from '@/lib/server/http';
import { notFoundMessage, verifyWithNipost } from '@/lib/server/navigate';

const FOOTPRINT_MATCH_RADIUS_M = 30;

export const GET = apiRoute<{ code: string }>(async (_req, { params, deps }) => {
  const code = normalizePostcode(params.code);
  if (!code) {
    return jsonError(
      400,
      'INVALID_POSTCODE',
      'Expected an 11-character NIPOST code, e.g. "FC 02 SIM BP 88" (spaces and dashes are optional).',
    );
  }

  // Local footprint lookup and NIPOST verification run in parallel.
  const [{ rows }, nipostResult] = await Promise.all([
    deps.db.query(LOOKUP_BY_CODE_SQL, [code]),
    verifyWithNipost(deps.nipost, code),
  ]);
  const { verification, lookup } = nipostResult;

  if (rows.length > 0) {
    return Response.json(buildingBody(code, rows[0], { verification, source: 'platform' }));
  }

  if (lookup?.valid && lookup.point) {
    // NIPOST knows where it is: snap to the footprint at that point.
    const [lng, lat] = lookup.point;
    const match = await deps.db.query(LOOKUP_BY_POINT_SQL, [lng, lat, FOOTPRINT_MATCH_RADIUS_M]);
    if (match.rows.length > 0) {
      return Response.json(
        buildingBody(code, match.rows[0], {
          verification,
          source: 'nipost',
          nipostPoint: lookup.point,
          footprintMatch: { distance_m: Math.round(match.rows[0].distance_m * 10) / 10 },
        }),
      );
    }
    // No footprint mapped there yet: return NIPOST's point on its own.
    return Response.json({
      ...baseBody(code),
      source: 'nipost',
      verification,
      center: lookup.point,
      bbox: null,
      building: null,
      nipostPoint: lookup.point,
    });
  }

  if (lookup?.valid) {
    return jsonError(
      404,
      'POSTCODE_NOT_MAPPED',
      `${formatPostcode(code)} is a registered NIPOST postcode, but its building hasn't been mapped on this platform yet.`,
      { code, verification },
    );
  }

  return jsonError(404, 'POSTCODE_NOT_FOUND', notFoundMessage(code, verification.status), { code, verification });
});
