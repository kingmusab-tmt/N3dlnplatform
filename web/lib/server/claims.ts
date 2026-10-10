import { BUILDING_COLUMNS, buildingBody } from './buildings';
import type { Db } from './db';
import type { LngLat } from './directions';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isClaimId = (id: string) => UUID_PATTERN.test(id);

// The lateral subquery keeps the shared building columns unambiguous next to claims.id.
const CLAIM_WITH_BUILDING_SQL = `
  SELECT c.id AS claim_id, c.label, c.delivery_notes, c.status, c.created_at,
         ST_X(c.gate) AS gate_lng, ST_Y(c.gate) AS gate_lat, b.*
  FROM claims c
  CROSS JOIN LATERAL (
    SELECT ${BUILDING_COLUMNS} FROM buildings WHERE buildings.id = c.building_id
  ) b
  WHERE c.id = $1 AND c.status <> 'rejected'
`;

const CLAIM_GATE_SQL = `
  SELECT ST_X(c.gate) AS lng, ST_Y(c.gate) AS lat
  FROM claims c JOIN buildings b ON b.id = c.building_id
  WHERE c.id = $1 AND b.nipost_code = $2 AND c.gate IS NOT NULL AND c.status <> 'rejected'
`;

/**
 * A claim with its building, as served at /api/v1/claims/:id and rendered on
 * the /h/:id share page. Null for unknown, malformed or rejected ids.
 */
export async function getSharedPlace(db: Db, id: string) {
  if (!isClaimId(id)) return null;
  const { rows } = await db.query(CLAIM_WITH_BUILDING_SQL, [id]);
  if (rows.length === 0) return null;

  const row = rows[0];
  return buildingBody(row.nipost_code, row, {
    source: 'platform',
    claim: {
      id: row.claim_id,
      label: row.label,
      delivery_notes: row.delivery_notes,
      gate: row.gate_lng == null ? null : { lng: row.gate_lng, lat: row.gate_lat },
      status: row.status,
      created_at: row.created_at,
    },
  });
}

/** The gate an owner marked on their claim, if the claim belongs to this building. */
export async function getClaimGate(db: Db, claimId: string, code: string): Promise<LngLat | null> {
  if (!isClaimId(claimId)) return null;
  const { rows } = await db.query(CLAIM_GATE_SQL, [claimId, code]);
  return rows.length ? [rows[0].lng, rows[0].lat] : null;
}
