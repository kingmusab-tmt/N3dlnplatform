// GET /api/v1/buildings/at?lng=7.48&lat=9.07 — "what building is under this pin?"
import { LOOKUP_BY_POINT_SQL, buildingBody } from '@/lib/server/buildings';
import { apiRoute, isLngLat, jsonError } from '@/lib/server/http';

// How far from a click we'll still snap to a footprint: covers taps that land
// just outside an outline, small enough not to grab the building across the road.
const CLICK_TOLERANCE_M = 12;

export const GET = apiRoute(async (req, { deps }) => {
  const query = new URL(req.url).searchParams;
  // Number(null) is 0, so check presence first.
  const lng = query.has('lng') ? Number(query.get('lng')) : NaN;
  const lat = query.has('lat') ? Number(query.get('lat')) : NaN;
  if (!isLngLat(lng, lat)) {
    return jsonError(400, 'INVALID_COORDINATES', 'lng and lat must be valid WGS84 coordinates.');
  }

  const { rows } = await deps.db.query(LOOKUP_BY_POINT_SQL, [lng, lat, CLICK_TOLERANCE_M]);
  if (rows.length === 0) return jsonError(404, 'NO_BUILDING_HERE', 'No mapped building at this location.');

  const row = rows[0];
  return Response.json(
    buildingBody(row.nipost_code, row, {
      source: 'platform',
      pin: { lng, lat, distance_m: Math.round(row.distance_m * 10) / 10 },
    }),
  );
});
