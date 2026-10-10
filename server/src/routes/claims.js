import { Router } from 'express';
import { BUILDING_COLUMNS, buildingBody } from '../lib/buildings.js';

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
 * @param {{ query: (text: string, values: unknown[]) => Promise<{ rows: any[] }> }} db
 */
export function createClaimsRouter(db) {
  const router = Router();

  // GET /api/v1/claims/:id — the home profile behind a shareable link.
  // The UUID is the capability: anyone holding the link can view it.
  router.get('/:id', async (req, res, next) => {
    if (!UUID_PATTERN.test(req.params.id)) {
      return res.status(404).json({ error: 'CLAIM_NOT_FOUND', message: 'This link is invalid or has expired.' });
    }

    try {
      const { rows } = await db.query(CLAIM_WITH_BUILDING_SQL, [req.params.id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'CLAIM_NOT_FOUND', message: 'This link is invalid or has expired.' });
      }
      const row = rows[0];
      res.set('Cache-Control', 'private, no-store');
      return res.json(
        buildingBody(row.nipost_code, row, {
          source: 'platform',
          claim: {
            id: row.claim_id,
            label: row.label,
            delivery_notes: row.delivery_notes,
            status: row.status,
            created_at: row.created_at,
          },
        }),
      );
    } catch (err) {
      return next(err);
    }
  });

  return router;
}
