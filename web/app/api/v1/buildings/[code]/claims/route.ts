// POST /api/v1/buildings/:code/claims { label, delivery_notes?, gate?: { lng, lat } }
//
// On this website the claimant must be signed in, so they can manage the
// claim later (unless accounts aren't configured on this server, in which
// case claims are anonymous). Partners with an API key create unowned claims.
import { randomUUID } from 'node:crypto';
import { formatPostcode, normalizePostcode } from '@/lib/postcode';
import { GATE_MAX_DISTANCE_M, parseClaimFields } from '@/lib/server/claimInput';
import { ownedClaim } from '@/lib/server/claims';
import { apiRoute, callerBucket, jsonError, rateLimited, sessionUser, signInRequired } from '@/lib/server/http';

const CLAIMS_PER_HOUR = 20;

// Building id, plus how far the proposed gate ($2,$3) is from its footprint (null without a gate).
const BUILDING_SQL = `
  SELECT id, metadata->>'name' AS building_name,
         CASE WHEN $2::float IS NULL THEN NULL
              ELSE ST_Distance(geom::geography, ST_SetSRID(ST_MakePoint($2::float, $3::float), 4326)::geography)
         END AS gate_distance_m
  FROM buildings
  WHERE nipost_code = $1
`;

// The share token starts equal to the id; owners can rotate it later to revoke a link.
const INSERT_CLAIM_SQL = `
  INSERT INTO claims (id, share_token, building_id, user_id, label, delivery_notes, gate)
  VALUES ($1, $1, $2, $3, $4, $5,
          CASE WHEN $6::float IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($6::float, $7::float), 4326) END)
  RETURNING id, share_token, label, delivery_notes, status, created_at, ST_X(gate) AS gate_lng, ST_Y(gate) AS gate_lat
`;

export const POST = apiRoute<{ code: string }>(async (req, { params, deps, caller }) => {
  const user = await sessionUser(req, deps, caller);
  if (caller.kind === 'web' && !user && deps.auth.configured) return signInRequired();

  // Claims are public writes: cap them per caller on top of the general limit.
  const limit = await deps.limiter.hit(`claims:${user ? `user:${user.id}` : callerBucket(caller)}`, CLAIMS_PER_HOUR, 3600);
  if (!limit.allowed) return rateLimited(limit.retryAfterSec);

  const code = normalizePostcode(params.code);
  if (!code) return jsonError(400, 'INVALID_POSTCODE', 'Expected an 11-character NIPOST code.');

  const { fields, problems } = parseClaimFields(await req.json().catch(() => null));
  if (problems.length) return jsonError(400, 'INVALID_CLAIM', problems.join('; '));
  const gate = fields.gate ?? null;

  const { rows: buildings } = await deps.db.query(BUILDING_SQL, [code, gate?.[0] ?? null, gate?.[1] ?? null]);
  if (buildings.length === 0) {
    return jsonError(404, 'POSTCODE_NOT_FOUND', `No building is registered for ${formatPostcode(code)}.`);
  }
  const building = buildings[0];
  if (gate && building.gate_distance_m > GATE_MAX_DISTANCE_M) {
    return jsonError(
      400,
      'GATE_TOO_FAR',
      `The gate must be within ${GATE_MAX_DISTANCE_M} m of the building (it is ${Math.round(building.gate_distance_m)} m away).`,
    );
  }

  const { rows } = await deps.db.query(INSERT_CLAIM_SQL, [
    randomUUID(),
    building.id,
    user?.id ?? null,
    fields.label,
    fields.delivery_notes ?? null,
    gate?.[0] ?? null,
    gate?.[1] ?? null,
  ]);
  return Response.json(ownedClaim({ ...rows[0], nipost_code: code, building_name: building.building_name }), { status: 201 });
});
