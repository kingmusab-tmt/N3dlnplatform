import { BUILDING_COLUMNS, buildingBody } from './buildings';
import type { Db } from './db';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The lateral subquery keeps the shared building columns unambiguous next to claims.id.
const CLAIM_WITH_BUILDING_SQL = `
  SELECT c.id AS claim_id, c.label, c.delivery_notes, c.status, c.created_at, b.*
  FROM claims c
  CROSS JOIN LATERAL (
    SELECT ${BUILDING_COLUMNS} FROM buildings WHERE buildings.id = c.building_id
  ) b
  WHERE c.id = $1 AND c.status <> 'rejected'
`;

/**
 * A claim with its building, as served at /api/v1/claims/:id and rendered on
 * the /h/:id share page. Null for unknown, malformed or rejected ids.
 */
export async function getSharedPlace(db: Db, id: string) {
  if (!UUID_PATTERN.test(id)) return null;
  const { rows } = await db.query(CLAIM_WITH_BUILDING_SQL, [id]);
  if (rows.length === 0) return null;

  const row = rows[0];
  return buildingBody(row.nipost_code, row, {
    source: 'platform',
    claim: {
      id: row.claim_id,
      label: row.label,
      delivery_notes: row.delivery_notes,
      status: row.status,
      created_at: row.created_at,
    },
  });
}
