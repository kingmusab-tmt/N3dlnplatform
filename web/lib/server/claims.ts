import { formatPostcode } from '../postcode';
import { BUILDING_COLUMNS, buildingBody } from './buildings';
import type { ClaimFields } from './claimInput';
import type { Db } from './db';
import type { LngLat } from './directions';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (id: string) => UUID_PATTERN.test(id);

// ---- Public: share links -----------------------------------------------------

// The lateral subquery keeps the shared building columns unambiguous next to claims.id.
const SHARED_PLACE_SQL = `
  SELECT c.share_token, c.label, c.delivery_notes, c.status, c.created_at,
         ST_X(c.gate) AS gate_lng, ST_Y(c.gate) AS gate_lat, b.*
  FROM claims c
  CROSS JOIN LATERAL (
    SELECT ${BUILDING_COLUMNS} FROM buildings WHERE buildings.id = c.building_id
  ) b
  WHERE c.share_token = $1 AND c.status <> 'rejected'
`;

const SHARED_GATE_SQL = `
  SELECT ST_X(c.gate) AS lng, ST_Y(c.gate) AS lat
  FROM claims c JOIN buildings b ON b.id = c.building_id
  WHERE c.share_token = $1 AND b.nipost_code = $2 AND c.gate IS NOT NULL AND c.status <> 'rejected'
`;

/**
 * The place behind a share link (/h/<share_id>), as served at
 * /api/v1/claims/:share_id. Null for unknown, revoked or rejected links. The
 * claim's internal id and owner are never exposed here.
 */
export async function getSharedPlace(db: Db, shareId: string) {
  if (!isUuid(shareId)) return null;
  const { rows } = await db.query(SHARED_PLACE_SQL, [shareId]);
  if (rows.length === 0) return null;

  const row = rows[0];
  return buildingBody(row.nipost_code, row, {
    source: 'platform',
    claim: {
      share_id: row.share_token,
      label: row.label,
      delivery_notes: row.delivery_notes,
      gate: gateOf(row),
      status: row.status,
      created_at: row.created_at,
    },
  });
}

/** The gate an owner marked on a shared place, if the link is for this building. */
export async function getSharedGate(db: Db, shareId: string, code: string): Promise<LngLat | null> {
  if (!isUuid(shareId)) return null;
  const { rows } = await db.query(SHARED_GATE_SQL, [shareId, code]);
  return rows.length ? [rows[0].lng, rows[0].lat] : null;
}

// ---- Owners: "My places" ----------------------------------------------------

const OWNER_COLUMNS = `
  c.id, c.share_token, c.label, c.delivery_notes, c.status, c.created_at,
  ST_X(c.gate) AS gate_lng, ST_Y(c.gate) AS gate_lat,
  b.nipost_code, b.metadata->>'name' AS building_name
`;

const LIST_SQL = `
  SELECT ${OWNER_COLUMNS}
  FROM claims c JOIN buildings b ON b.id = c.building_id
  WHERE c.user_id = $1
  ORDER BY c.created_at DESC
`;

// Distance from a proposed gate ($3,$4) to the claim's building, only for the owner's claim.
const OWNED_GATE_DISTANCE_SQL = `
  SELECT ST_Distance(b.geom::geography, ST_SetSRID(ST_MakePoint($3::float, $4::float), 4326)::geography) AS distance_m
  FROM claims c JOIN buildings b ON b.id = c.building_id
  WHERE c.id = $1 AND c.user_id = $2
`;

// COALESCE keeps fields the edit didn't mention; $5 flags an explicit gate change.
const UPDATE_SQL = `
  UPDATE claims c SET
    label          = COALESCE($3, c.label),
    delivery_notes = CASE WHEN $4::boolean THEN $5 ELSE c.delivery_notes END,
    gate           = CASE WHEN $6::boolean
                          THEN CASE WHEN $7::float IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($7::float, $8::float), 4326) END
                          ELSE c.gate END
  FROM buildings b
  WHERE c.id = $1 AND c.user_id = $2 AND b.id = c.building_id
  RETURNING ${OWNER_COLUMNS}
`;

const DELETE_SQL = 'DELETE FROM claims WHERE id = $1 AND user_id = $2';

const ROTATE_SQL = `
  UPDATE claims c SET share_token = gen_random_uuid()
  FROM buildings b
  WHERE c.id = $1 AND c.user_id = $2 AND b.id = c.building_id
  RETURNING ${OWNER_COLUMNS}
`;

export async function listUserClaims(db: Db, userId: string) {
  const { rows } = await db.query(LIST_SQL, [userId]);
  return rows.map(ownedClaim);
}

/** How far a gate would be from the owner's claimed building; null if the claim isn't theirs. */
export async function ownedGateDistance(db: Db, claimId: string, userId: string, gate: LngLat) {
  if (!isUuid(claimId)) return null;
  const { rows } = await db.query(OWNED_GATE_DISTANCE_SQL, [claimId, userId, gate[0], gate[1]]);
  return rows.length ? Number(rows[0].distance_m) : null;
}

export async function updateUserClaim(db: Db, claimId: string, userId: string, fields: ClaimFields) {
  if (!isUuid(claimId)) return null;
  const notesGiven = fields.delivery_notes !== undefined;
  const gateGiven = fields.gate !== undefined;
  const { rows } = await db.query(UPDATE_SQL, [
    claimId,
    userId,
    fields.label ?? null,
    notesGiven,
    notesGiven ? fields.delivery_notes : null,
    gateGiven,
    fields.gate?.[0] ?? null,
    fields.gate?.[1] ?? null,
  ]);
  return rows.length ? ownedClaim(rows[0]) : null;
}

export async function deleteUserClaim(db: Db, claimId: string, userId: string) {
  if (!isUuid(claimId)) return false;
  const res = await db.query(DELETE_SQL, [claimId, userId]);
  return (res.rowCount ?? 0) > 0;
}

/** Issues a new share token: the old link stops working immediately. */
export async function rotateShareLink(db: Db, claimId: string, userId: string) {
  if (!isUuid(claimId)) return null;
  const { rows } = await db.query(ROTATE_SQL, [claimId, userId]);
  return rows.length ? ownedClaim(rows[0]) : null;
}

/** A claim as its owner sees it: includes the internal id needed to manage it. */
export function ownedClaim(row: any) {
  return {
    id: row.id,
    share_id: row.share_token,
    code: row.nipost_code,
    formatted: formatPostcode(row.nipost_code),
    building_name: row.building_name ?? null,
    label: row.label,
    delivery_notes: row.delivery_notes,
    gate: gateOf(row),
    status: row.status,
    created_at: row.created_at,
  };
}

function gateOf(row: { gate_lng: number | null; gate_lat: number | null }) {
  return row.gate_lng == null ? null : { lng: row.gate_lng, lat: row.gate_lat };
}
