// POST /api/v1/buildings/:code/claims { label, delivery_notes?, gate?: { lng, lat } }
import { formatPostcode, normalizePostcode } from '@/lib/postcode';
import { apiRoute, callerBucket, isLngLat, jsonError, rateLimited } from '@/lib/server/http';

const LABEL_MAX = 80;
const NOTES_MAX = 500;
const CLAIMS_PER_HOUR = 20;
// A gate further than this from the footprint is almost certainly a mis-tap.
const GATE_MAX_DISTANCE_M = 30;

// Building id, plus how far the proposed gate ($2,$3) is from its footprint (null without a gate).
const BUILDING_SQL = `
  SELECT id,
         CASE WHEN $2::float IS NULL THEN NULL
              ELSE ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($2::float, $3::float), 4326)::geography)
         END AS gate_distance_m
  FROM buildings
  WHERE nipost_code = $1
`;

const INSERT_CLAIM_SQL = `
  INSERT INTO claims (building_id, label, delivery_notes, gate)
  VALUES ($1, $2, $3, CASE WHEN $4::float IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($4::float, $5::float), 4326) END)
  RETURNING id, label, delivery_notes, status, created_at, ST_X(gate) AS gate_lng, ST_Y(gate) AS gate_lat
`;

export const POST = apiRoute<{ code: string }>(async (req, { params, deps, caller }) => {
  // Claims are public writes: cap them per caller on top of the general limit.
  const limit = await deps.limiter.hit(`claims:${callerBucket(caller)}`, CLAIMS_PER_HOUR, 3600);
  if (!limit.allowed) return rateLimited(limit.retryAfterSec);

  const code = normalizePostcode(params.code);
  if (!code) return jsonError(400, 'INVALID_POSTCODE', 'Expected an 11-character NIPOST code.');

  const body = await req.json().catch(() => null);
  const label = cleanText(body?.label);
  const notes = cleanText(body?.delivery_notes);
  const gate = body?.gate == null ? null : [Number(body.gate.lng), Number(body.gate.lat)];
  const problems = [];
  if (!label) problems.push('label is required');
  if (label.length > LABEL_MAX) problems.push(`label must be at most ${LABEL_MAX} characters`);
  if (notes.length > NOTES_MAX) problems.push(`delivery_notes must be at most ${NOTES_MAX} characters`);
  if (gate && !isLngLat(gate[0], gate[1])) problems.push('gate must be { lng, lat } in WGS84');
  if (problems.length) return jsonError(400, 'INVALID_CLAIM', problems.join('; '));

  const { rows: buildings } = await deps.db.query(BUILDING_SQL, [code, gate?.[0] ?? null, gate?.[1] ?? null]);
  if (buildings.length === 0) {
    return jsonError(404, 'POSTCODE_NOT_FOUND', `No building is registered for ${formatPostcode(code)}.`);
  }
  const { id: buildingId, gate_distance_m } = buildings[0];
  if (gate && gate_distance_m > GATE_MAX_DISTANCE_M) {
    return jsonError(
      400,
      'GATE_TOO_FAR',
      `The gate must be within ${GATE_MAX_DISTANCE_M} m of the building (it is ${Math.round(gate_distance_m)} m away).`,
    );
  }

  const { rows } = await deps.db.query(INSERT_CLAIM_SQL, [buildingId, label, notes || null, gate?.[0] ?? null, gate?.[1] ?? null]);
  const claim = rows[0];
  return Response.json(
    {
      id: claim.id,
      code,
      formatted: formatPostcode(code),
      label: claim.label,
      delivery_notes: claim.delivery_notes,
      gate: claim.gate_lng == null ? null : { lng: claim.gate_lng, lat: claim.gate_lat },
      status: claim.status,
      created_at: claim.created_at,
    },
    { status: 201 },
  );
});

/** Trims and strips control characters (keeping newlines in notes). */
function cleanText(value: unknown) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
}
