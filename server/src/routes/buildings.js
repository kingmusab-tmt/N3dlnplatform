import { Router } from 'express';
import { LOOKUP_BY_POINT_SQL, buildingBody } from '../lib/buildings.js';
import { formatPostcode, normalizePostcode } from '../lib/postcode.js';
import { rateLimit } from '../lib/rateLimit.js';

// How far from a click we'll still snap to a footprint: covers taps that land
// just outside an outline, small enough not to grab the building across the road.
const CLICK_TOLERANCE_M = 12;
const LABEL_MAX = 80;
const NOTES_MAX = 500;

const INSERT_CLAIM_SQL = `
  INSERT INTO claims (building_id, label, delivery_notes)
  SELECT id, $2, $3 FROM buildings WHERE nipost_code = $1
  RETURNING id, label, delivery_notes, status, created_at
`;

/**
 * @param {{ query: (text: string, values: unknown[]) => Promise<{ rows: any[] }> }} db
 */
export function createBuildingsRouter(db, { claimLimit = { windowMs: 60 * 60_000, max: 20 } } = {}) {
  const router = Router();

  // GET /api/v1/buildings/at?lng=7.48&lat=9.07 — "what building is under this pin?"
  router.get('/at', async (req, res, next) => {
    const lng = Number(req.query.lng);
    const lat = Number(req.query.lat);
    if (!isLngLat(lng, lat)) {
      return res.status(400).json({ error: 'INVALID_COORDINATES', message: 'lng and lat must be valid WGS84 coordinates.' });
    }

    try {
      const { rows } = await db.query(LOOKUP_BY_POINT_SQL, [lng, lat, CLICK_TOLERANCE_M]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'NO_BUILDING_HERE', message: 'No mapped building at this location.' });
      }
      const row = rows[0];
      return res.json(
        buildingBody(row.nipost_code, row, {
          source: 'platform',
          pin: { lng, lat, distance_m: Math.round(row.distance_m * 10) / 10 },
        }),
      );
    } catch (err) {
      return next(err);
    }
  });

  // POST /api/v1/buildings/:code/claims { label, delivery_notes? }
  router.post('/:code/claims', rateLimit(claimLimit), async (req, res, next) => {
    const code = normalizePostcode(req.params.code);
    if (!code) {
      return res.status(400).json({ error: 'INVALID_POSTCODE', message: 'Expected an 11-character NIPOST code.' });
    }

    const label = cleanText(req.body?.label);
    const notes = cleanText(req.body?.delivery_notes);
    const problems = [];
    if (!label) problems.push('label is required');
    if (label && label.length > LABEL_MAX) problems.push(`label must be at most ${LABEL_MAX} characters`);
    if (notes && notes.length > NOTES_MAX) problems.push(`delivery_notes must be at most ${NOTES_MAX} characters`);
    if (problems.length) {
      return res.status(400).json({ error: 'INVALID_CLAIM', message: problems.join('; ') });
    }

    try {
      const { rows } = await db.query(INSERT_CLAIM_SQL, [code, label, notes || null]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'POSTCODE_NOT_FOUND', message: `No building is registered for ${formatPostcode(code)}.` });
      }
      const claim = rows[0];
      return res.status(201).json({
        id: claim.id,
        code,
        formatted: formatPostcode(code),
        label: claim.label,
        delivery_notes: claim.delivery_notes,
        status: claim.status,
        created_at: claim.created_at,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

function isLngLat(lng, lat) {
  return Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
}

/** Trims and strips control characters (keeping newlines in notes). */
function cleanText(value) {
  if (typeof value !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, '').trim();
}
