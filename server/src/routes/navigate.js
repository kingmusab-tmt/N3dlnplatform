import { Router } from 'express';
import { NipostError } from '../lib/nipost.js';
import { formatPostcode, normalizePostcode, parsePostcode } from '../lib/postcode.js';

// Postgres builds the GeoJSON itself, so geometry never round-trips through JS.
// ST_AsGeoJSON(..., 7) keeps 7 decimal places (~1 cm), plenty for a gate.
const BUILDING_COLUMNS = `
    id,
    nipost_code,
    metadata,
    ST_AsGeoJSON(geom, 7)::json         AS polygon,
    ST_AsGeoJSON(center_point, 7)::json AS center,
    json_build_array(ST_XMin(geom), ST_YMin(geom), ST_XMax(geom), ST_YMax(geom)) AS bbox
`;

const LOOKUP_BY_CODE_SQL = `
  SELECT ${BUILDING_COLUMNS}
  FROM buildings
  WHERE nipost_code = $1
  LIMIT 1
`;

// Footprint containing (or nearest within $3 metres of) a NIPOST point.
// The && box (~0.001° ≈ 110 m) lets the GIST index prune before the exact distance.
const LOOKUP_BY_POINT_SQL = `
  WITH p AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS pt)
  SELECT ${BUILDING_COLUMNS},
         ST_Distance(geom::geography, p.pt::geography) AS distance_m
  FROM buildings, p
  WHERE geom && ST_Expand(p.pt, 0.001)
    AND ST_DWithin(geom::geography, p.pt::geography, $3)
  ORDER BY distance_m
  LIMIT 1
`;
const FOOTPRINT_MATCH_RADIUS_M = 30;

/**
 * @param {{ query: (text: string, values: unknown[]) => Promise<{ rows: any[] }> }} db
 * @param {{ lookup: (code: string) => Promise<import('../lib/nipost.js').NipostLookup>, level: number } | null} nipost
 */
export function createNavigateRouter(db, nipost = null) {
  const router = Router();

  // GET /api/v1/navigate/:code  — code may contain spaces or dashes, any case.
  router.get('/:code', async (req, res, next) => {
    const code = normalizePostcode(req.params.code);
    if (!code) {
      return res.status(400).json({
        error: 'INVALID_POSTCODE',
        message:
          'Expected an 11-character NIPOST code, e.g. "FC 02 A09 DB 09" (spaces and dashes are optional).',
      });
    }

    try {
      // Local footprint lookup and NIPOST verification run in parallel.
      const [{ rows }, nipostResult] = await Promise.all([
        db.query(LOOKUP_BY_CODE_SQL, [code]),
        verifyWithNipost(nipost, code),
      ]);
      const verification = nipostResult.verification;

      if (rows.length > 0) {
        return sendBuilding(res, code, rows[0], { verification, source: 'platform' });
      }

      const lookup = nipostResult.lookup;
      if (lookup?.valid && lookup.point) {
        // NIPOST knows where it is: snap to the footprint at that point.
        const [lng, lat] = lookup.point;
        const match = await db.query(LOOKUP_BY_POINT_SQL, [lng, lat, FOOTPRINT_MATCH_RADIUS_M]);
        if (match.rows.length > 0) {
          return sendBuilding(res, code, match.rows[0], {
            verification,
            source: 'nipost',
            nipostPoint: lookup.point,
            footprintMatch: { distance_m: Math.round(match.rows[0].distance_m * 10) / 10 },
          });
        }
        // No footprint mapped there yet: return NIPOST's point on its own.
        return res.json({
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
        return res.status(404).json({
          error: 'POSTCODE_NOT_MAPPED',
          message: `${formatPostcode(code)} is a registered NIPOST postcode, but its building hasn't been mapped on this platform yet.`,
          code,
          verification,
        });
      }

      return res.status(404).json({
        error: 'POSTCODE_NOT_FOUND',
        message: notFoundMessage(code, verification.status),
        code,
        verification,
      });
    } catch (err) {
      return next(err);
    }
  });

  return router;
}

async function verifyWithNipost(nipost, code) {
  if (!nipost) {
    return { lookup: null, verification: { source: 'nipost', status: 'not_configured' } };
  }
  try {
    const lookup = await nipost.lookup(code);
    const status = lookup.valid ? 'verified' : nipost.environment === 'test' ? 'not_in_sandbox' : 'unregistered';
    return {
      lookup,
      verification: {
        source: 'nipost',
        status,
        environment: nipost.environment,
        level: nipost.level,
        ...(lookup.address && { address: lookup.address }),
        ...(lookup.buildingUse && { building_use: lookup.buildingUse }),
      },
    };
  } catch (err) {
    // NIPOST being down or rejecting our key must not take the platform down with it.
    if (!(err instanceof NipostError)) throw err;
    console.warn(`NIPOST lookup failed for ${code}: [${err.code}] ${err.message}`);
    return { lookup: null, verification: { source: 'nipost', status: 'unavailable', reason: err.code } };
  }
}

function notFoundMessage(code, status) {
  const formatted = formatPostcode(code);
  if (status === 'unregistered') return `${formatted} is not a registered NIPOST postcode.`;
  if (status === 'not_in_sandbox') {
    return `${formatted} isn't mapped on this platform, and NIPOST's test sandbox doesn't include it. A test API key can't check real postcodes; that needs a live key.`;
  }
  return `No building is registered for ${formatted}.`;
}

function baseBody(code) {
  return { code, formatted: formatPostcode(code), segments: parsePostcode(code) };
}

function sendBuilding(res, code, row, extra) {
  return res.json({
    ...baseBody(code),
    ...extra,
    center: row.center.coordinates, // [lng, lat]
    bbox: row.bbox, // [minLng, minLat, maxLng, maxLat]
    building: {
      type: 'Feature',
      id: row.id,
      geometry: row.polygon,
      properties: { ...row.metadata, nipost_code: code },
    },
    centerPoint: {
      type: 'Feature',
      geometry: row.center,
      properties: { nipost_code: code, role: 'center' },
    },
  });
}
