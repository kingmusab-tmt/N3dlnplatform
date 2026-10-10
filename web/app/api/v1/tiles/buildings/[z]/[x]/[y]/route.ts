// GET /api/v1/tiles/buildings/{z}/{x}/{y}.mvt — the platform's building
// footprints as Mapbox Vector Tiles, so maps can draw every mapped building in
// 3D. Public and CDN-cacheable: a map loads dozens of tiles at once, which
// would blow through per-visitor API limits.
import { renderHeightSql } from '@/lib/server/buildings';
import { apiRoute, jsonError } from '@/lib/server/http';

const MIN_ZOOM = 13; // below this, buildings are too small to matter
const MAX_ZOOM = 22;

// ST_TileEnvelope is in Web Mercator; buildings are WGS84, so transform the
// envelope (not every row) for the index-friendly && filter.
const TILE_SQL = `
  WITH bounds AS (SELECT ST_TileEnvelope($1, $2, $3) AS env),
  features AS (
    SELECT
      ST_AsMVTGeom(ST_Transform(b.geom, 3857), bounds.env, 4096, 64, true) AS geom,
      b.id,
      round((${renderHeightSql('b')})::numeric, 1)::float AS height,
      (b.metadata ? 'height_m') AS height_known,
      b.metadata->>'building_type' AS type
    FROM buildings b, bounds
    WHERE b.geom && ST_Transform(bounds.env, 4326)
  )
  SELECT ST_AsMVT(features.*, 'buildings', 4096, 'geom', 'id') AS mvt
  FROM features
  WHERE geom IS NOT NULL
`;

export const GET = apiRoute<{ z: string; x: string; y: string }>(
  async (_req, { params, deps }) => {
    const z = Number(params.z);
    const x = Number(params.x);
    const y = Number(params.y.replace(/\.mvt$/, ''));
    const max = 2 ** z;
    const valid =
      [z, x, y].every(Number.isInteger) && z >= 0 && z <= MAX_ZOOM && x >= 0 && x < max && y >= 0 && y < max;
    if (!valid) return jsonError(400, 'INVALID_TILE', 'z/x/y must be integer tile coordinates.');

    const empty = () => new Response(null, { status: 204, headers: cacheHeaders() });
    if (z < MIN_ZOOM) return empty();

    const { rows } = await deps.db.query(TILE_SQL, [z, x, y]);
    const tile: Buffer | undefined = rows[0]?.mvt;
    if (!tile || tile.length === 0) return empty();

    return new Response(new Uint8Array(tile), {
      headers: { 'Content-Type': 'application/vnd.mapbox-vector-tile', ...cacheHeaders() },
    });
  },
  { auth: false },
);

function cacheHeaders() {
  // Browsers revalidate hourly; Vercel's CDN keeps tiles for a day.
  return { 'Cache-Control': 'public, max-age=3600, s-maxage=86400' };
}
