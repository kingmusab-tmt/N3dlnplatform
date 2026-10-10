import { Router } from 'express';
import { DirectionsError, PROFILES } from '../lib/directions.js';
import { NipostError } from '../lib/nipost.js';
import { LOOKUP_BY_CODE_SQL, LOOKUP_BY_POINT_SQL, baseBody, buildingBody } from '../lib/buildings.js';
import { formatPostcode, normalizePostcode } from '../lib/postcode.js';

const FOOTPRINT_MATCH_RADIUS_M = 30;

/**
 * @param {{ query: (text: string, values: unknown[]) => Promise<{ rows: any[] }> }} db
 * @param {{ lookup: (code: string) => Promise<import('../lib/nipost.js').NipostLookup>, level: number } | null} nipost
 * @param {{ route: (from: [number, number], to: [number, number], profile?: string) => Promise<import('../lib/directions.js').Route> } | null} directions
 */
export function createNavigateRouter(db, nipost = null, directions = null) {
  const router = Router();

  // GET /api/v1/navigate/:code/route?from=lng,lat&profile=driving
  // Road route from a rider's position to the building, plus the on-foot
  // "last mile" from where the road ends to the gate (or building center).
  router.get('/:code/route', async (req, res, next) => {
    const code = normalizePostcode(req.params.code);
    if (!code) {
      return res.status(400).json({ error: 'INVALID_POSTCODE', message: 'Expected an 11-character NIPOST code.' });
    }
    const from = parseLngLat(req.query.from);
    if (!from) {
      return res.status(400).json({ error: 'INVALID_ORIGIN', message: 'from must be "lng,lat", e.g. from=7.4790,9.0700.' });
    }
    const profile = req.query.profile ?? 'driving';
    if (!PROFILES.includes(profile)) {
      return res.status(400).json({ error: 'INVALID_PROFILE', message: `profile must be one of: ${PROFILES.join(', ')}.` });
    }
    if (!directions) {
      return res.status(503).json({ error: 'ROUTING_NOT_CONFIGURED', message: 'Routing is not configured on this server.' });
    }

    try {
      const { rows } = await db.query(LOOKUP_BY_CODE_SQL, [code]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'POSTCODE_NOT_FOUND', message: `No building is registered for ${formatPostcode(code)}.` });
      }
      const row = rows[0];
      const destination = destinationFor(row);

      let route;
      try {
        route = await directions.route(from, destination.point, profile);
      } catch (err) {
        if (!(err instanceof DirectionsError)) throw err;
        return res.status(err.httpStatus).json({ error: err.code.toUpperCase(), message: err.message });
      }

      const { snappedDestination, ...routeBody } = route;
      return res.json(
        buildingBody(code, row, {
          source: 'platform',
          profile,
          origin: from,
          destination,
          route: routeBody,
          lastMile: lastMileLeg(snappedDestination, destination.point),
        }),
      );
    } catch (err) {
      return next(err);
    }
  });

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
        return res.json(buildingBody(code, rows[0], { verification, source: 'platform' }));
      }

      const lookup = nipostResult.lookup;
      if (lookup?.valid && lookup.point) {
        // NIPOST knows where it is: snap to the footprint at that point.
        const [lng, lat] = lookup.point;
        const match = await db.query(LOOKUP_BY_POINT_SQL, [lng, lat, FOOTPRINT_MATCH_RADIUS_M]);
        if (match.rows.length > 0) {
          return res.json(buildingBody(code, match.rows[0], {
            verification,
            source: 'nipost',
            nipostPoint: lookup.point,
            footprintMatch: { distance_m: Math.round(match.rows[0].distance_m * 10) / 10 },
          }));
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

function parseLngLat(value) {
  if (typeof value !== 'string') return null;
  const [lng, lat] = value.split(',').map(Number);
  const ok = Number.isFinite(lng) && Number.isFinite(lat) && Math.abs(lng) <= 180 && Math.abs(lat) <= 90;
  return ok ? [lng, lat] : null;
}

/** Riders should end at the gate when one is mapped, otherwise the building center. */
function destinationFor(row) {
  const gate = row.metadata?.gate;
  if (Number.isFinite(gate?.lng) && Number.isFinite(gate?.lat)) {
    return { point: [gate.lng, gate.lat], kind: 'gate' };
  }
  return { point: row.center.coordinates, kind: 'center' };
}

/** Straight on-foot leg from where the road route ends to the destination. */
function lastMileLeg(snapped, destination) {
  const distance = haversineMetres(snapped.point, destination);
  if (distance < 3) return null;
  return {
    geometry: { type: 'LineString', coordinates: [snapped.point, destination] },
    distance_m: Math.round(distance),
  };
}

function haversineMetres([lng1, lat1], [lng2, lat2]) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLng = (lng2 - lng1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(a));
}

function notFoundMessage(code, status) {
  const formatted = formatPostcode(code);
  if (status === 'unregistered') return `${formatted} is not a registered NIPOST postcode.`;
  if (status === 'not_in_sandbox') {
    return `${formatted} isn't mapped on this platform, and NIPOST's test sandbox doesn't include it. A test API key can't check real postcodes; that needs a live key.`;
  }
  return `No building is registered for ${formatted}.`;
}

