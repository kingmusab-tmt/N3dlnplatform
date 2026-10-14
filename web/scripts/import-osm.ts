// Imports OpenStreetMap building footprints for a bounding box into `buildings`,
// assigning simulated NIPOST codes. Safe to re-run: existing buildings keep
// their codes and only get their footprint/metadata refreshed.
//
//   npm run import:osm                       # Wuse 2, Abuja (default pilot)
//   npm run import:osm -- --area lagos-island,lagos-yaba   # named areas (scripts/lib/areas.ts)
//   npm run import:osm -- --area all         # every named area, one after another
//   npm run import:osm -- --bbox 3.33,6.58,3.36,6.61 --state LA --lga 10
//   npm run import:osm -- --dry-run          # fetch + allocate, write nothing
// Reads DATABASE_URL from web/.env.local (see the npm script).
import { parseArgs } from 'node:util';
import { normalizePostcode } from '../lib/postcode';
import { getPool } from '../lib/server/db';
import { AREAS } from './lib/areas';
import { allocateCodes, buildOverpassQuery, elementsToBuildings, type OverpassElement } from './lib/osm';

const pool = getPool();

// Wuse 2 sits in Abuja Municipal: state FC, LGA 02 (from NIPOST /v1/reference/lgas).
// District "SIM" is valid NIPOST syntax but never a real district (real ones look
// like "A09"), so simulated codes can't collide with genuine addresses.
const DEFAULTS = { bbox: '7.462,9.068,7.492,9.088', state: 'FC', lga: '02', district: 'SIM' };
const OVERPASS_URLS = process.env.OVERPASS_URL
  ? [process.env.OVERPASS_URL]
  : ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
const BATCH_SIZE = 500;

const { values: args } = parseArgs({
  options: {
    bbox: { type: 'string', default: DEFAULTS.bbox },
    state: { type: 'string', default: DEFAULTS.state },
    lga: { type: 'string', default: DEFAULTS.lga },
    district: { type: 'string', default: DEFAULTS.district },
    area: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
  },
});

type Job = { label: string; bbox: number[]; prefix: string };

function job(label: string, bbox: number[], state: string, lga: string): Job {
  if (bbox.length !== 4 || bbox.some((n) => !Number.isFinite(n))) {
    throw new Error('--bbox must be minLng,minLat,maxLng,maxLat');
  }
  const prefix = `${state}${lga}${args.district}`.toUpperCase();
  if (!normalizePostcode(`${prefix}AA01`)) {
    throw new Error(`state/LGA/district don't form a valid NIPOST prefix: ${prefix}`);
  }
  return { label, bbox, prefix };
}

const jobs: Job[] = args.area
  ? (args.area === 'all' ? Object.keys(AREAS) : args.area.split(',')).map((id) => {
      const area = AREAS[id.trim()];
      if (!area) throw new Error(`Unknown area "${id}". Known: ${Object.keys(AREAS).join(', ')}`);
      return job(area.label, area.bbox, area.state, area.lga);
    })
  : [job('Custom area', args.bbox.split(',').map(Number), args.state, args.lga)];

// Fixes self-intersections with ST_MakeValid, keeping the result only if it is still one polygon.
const UPSERT_SQL = `
  WITH input AS (
    SELECT r.code, r.osm_id, r.metadata, ST_SetSRID(ST_GeomFromGeoJSON(r.geometry), 4326) AS g
    FROM jsonb_to_recordset($1::jsonb) AS r(code text, osm_id bigint, geometry jsonb, metadata jsonb)
  ),
  fixed AS (
    SELECT code, osm_id, metadata,
           CASE WHEN ST_IsValid(g) THEN g
                ELSE ST_CollectionExtract(ST_MakeValid(g), 3) END AS g
    FROM input
  )
  INSERT INTO buildings (nipost_code, osm_id, geom, metadata)
  SELECT code, osm_id, g::geometry(Polygon, 4326), metadata
  FROM fixed
  WHERE GeometryType(g) = 'POLYGON' AND ST_IsValid(g) AND ST_Area(g::geography) > 1
  ON CONFLICT (osm_id) DO UPDATE
    SET geom = EXCLUDED.geom, metadata = EXCLUDED.metadata
  RETURNING (xmax = 0) AS inserted
`;

// Public Overpass servers are shared and often answer 429/504 under load, so
// retry with backoff and alternate between the main server and a mirror.
async function fetchOverpass(bbox: number[], attempts = 6): Promise<OverpassElement[]> {
  console.log(`Fetching OSM buildings in [${bbox.join(', ')}] from Overpass…`);
  for (let attempt = 1; ; attempt++) {
    const url = OVERPASS_URLS[(attempt - 1) % OVERPASS_URLS.length];
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'tmtecheasy-delivery-mvp/0.1' },
        body: new URLSearchParams({ data: buildOverpassQuery(bbox, 300) }),
        signal: AbortSignal.timeout(320_000),
      });
      if (res.ok) return (await res.json()).elements ?? [];
      const retryable = res.status === 429 || res.status >= 500;
      if (!retryable || attempt >= attempts) {
        throw new Error(`Overpass returned HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      console.warn(`  ${new URL(url).host} returned HTTP ${res.status}, retrying…`);
    } catch (err) {
      const message = (err as Error).message;
      if (attempt >= attempts || message.startsWith('Overpass returned')) throw err;
      console.warn(`  ${new URL(url).host} failed (${message}), retrying…`);
    }
    await new Promise((r) => setTimeout(r, 5000 * attempt));
  }
}

/**
 * Retries a dropped database connection (common on long imports over the
 * internet). Safe because each batch is one idempotent upsert statement.
 */
async function withRetry<T>(fn: () => Promise<T>, attempts = 6): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const code = (err as { code?: string }).code ?? '';
      const transient = ['ECONNRESET', 'ETIMEDOUT', 'EPIPE', 'ECONNREFUSED', '57P01'].includes(code) || /Connection terminated/i.test((err as Error).message);
      if (!transient || attempt >= attempts) throw err;
      console.warn(`
  database connection dropped (${code || 'terminated'}), retrying batch…`);
      await new Promise((r) => setTimeout(r, 3000 * attempt));
    }
  }
}

async function main() {
  for (const j of jobs) {
    console.log(`
=== ${j.label} (${j.prefix}) ===`);
    await importArea(j);
  }
}

async function importArea({ bbox, prefix }: Job) {
  const elements = await fetchOverpass(bbox);
  const { buildings, skipped } = elementsToBuildings(elements);
  console.log(`Parsed ${buildings.length} building footprints (${skipped} unclosed ways skipped).`);

  const { rows: existingRows } = await withRetry(() =>
    pool.query('SELECT osm_id, nipost_code FROM buildings WHERE osm_id IS NOT NULL OR nipost_code LIKE $1', [`${prefix}%`]),
  );
  const existing = new Map<unknown, string>(
    existingRows.filter((r) => r.osm_id).map((r) => [Number(r.osm_id), r.nipost_code]),
  );
  // Codes in this district held by non-OSM rows must not be handed out again.
  for (const r of existingRows) if (!r.osm_id) existing.set(`reserved:${r.nipost_code}`, r.nipost_code);

  const allocated = allocateCodes(buildings, { prefix, existing });
  const newCount = allocated.filter((b) => b.isNew).length;
  console.log(`${newCount} new buildings, ${allocated.length - newCount} already imported (codes kept).`);

  if (args['dry-run']) {
    console.log('Dry run, nothing written. First codes:', allocated.slice(0, 5).map((b) => b.code).join(', '));
    return;
  }

  let inserted = 0;
  let updated = 0;
  for (let i = 0; i < allocated.length; i += BATCH_SIZE) {
    const batch = allocated.slice(i, i + BATCH_SIZE).map((b) => ({
      code: b.code,
      osm_id: b.osm_id,
      geometry: { type: 'Polygon', coordinates: [b.ring] },
      metadata: b.metadata,
    }));
    const { rows } = await withRetry(() => pool.query(UPSERT_SQL, [JSON.stringify(batch)]));
    for (const r of rows) r.inserted ? inserted++ : updated++;
    process.stdout.write(`\r  written ${Math.min(i + BATCH_SIZE, allocated.length)}/${allocated.length}`);
  }
  const dropped = allocated.length - inserted - updated;
  console.log(`\nDone: ${inserted} inserted, ${updated} updated, ${dropped} dropped (invalid or degenerate geometry).`);

  const { rows: samples } = await withRetry(() => pool.query(
    `SELECT nipost_code, metadata->>'name' AS name, metadata ? 'gate' AS has_gate
     FROM buildings WHERE nipost_code LIKE $1
     ORDER BY (metadata ? 'name') DESC, (metadata ? 'gate') DESC, nipost_code LIMIT 8`,
    [`${prefix}%`],
  ));
  console.log('Sample codes to try:');
  for (const s of samples) console.log(`  ${s.nipost_code}  ${s.name ?? ''}${s.has_gate ? '  [gate]' : ''}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
