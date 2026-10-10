import { formatPostcode, parsePostcode } from '../postcode';

/**
 * Height the 3D map draws a building at, as SQL. OSM height/levels when known
 * (the importer stores them as height_m); otherwise an estimate of 1-4 storeys
 * (3.2 m each) from footprint area, varied by id so streets don't look
 * uniform. Shared by the vector tiles and lookup responses, so a highlighted
 * building always matches its neighbours. `t` is an optional table alias.
 */
export function renderHeightSql(t = '') {
  const p = t ? `${t}.` : '';
  return `COALESCE(
    NULLIF(${p}metadata->>'height_m', '')::float,
    CASE WHEN ST_Area(${p}geom::geography) > 800 THEN 9.6
         WHEN ST_Area(${p}geom::geography) > 250 THEN 6.4
         ELSE 3.2 END
    + (abs(hashtext(${p}id::text)) % 2) * 3.2
  )`;
}

// Postgres builds the GeoJSON itself, so geometry never round-trips through JS.
// ST_AsGeoJSON(..., 7) keeps 7 decimal places (~1 cm), plenty for a gate.
export const BUILDING_COLUMNS = `
    id,
    nipost_code,
    metadata,
    ST_AsGeoJSON(geom, 7)::json         AS polygon,
    ST_AsGeoJSON(center_point, 7)::json AS center,
    json_build_array(ST_XMin(geom), ST_YMin(geom), ST_XMax(geom), ST_YMax(geom)) AS bbox,
    ${renderHeightSql()} AS render_height_m
`;

export const LOOKUP_BY_CODE_SQL = `
  SELECT ${BUILDING_COLUMNS}
  FROM buildings
  WHERE nipost_code = $1
  LIMIT 1
`;

// Footprint containing (or nearest within $3 metres of) a point; containing
// footprints sort first because their distance is 0.
// The && box (~0.001° ≈ 110 m) lets the GIST index prune before the exact distance.
export const LOOKUP_BY_POINT_SQL = `
  WITH p AS (SELECT ST_SetSRID(ST_MakePoint($1, $2), 4326) AS pt)
  SELECT ${BUILDING_COLUMNS},
         ST_Distance(geom::geography, p.pt::geography) AS distance_m
  FROM buildings, p
  WHERE geom && ST_Expand(p.pt, 0.001)
    AND ST_DWithin(geom::geography, p.pt::geography, $3)
  ORDER BY distance_m
  LIMIT 1
`;

export type BuildingRow = {
  id: number;
  nipost_code: string;
  metadata: Record<string, any>;
  polygon: { type: 'Polygon'; coordinates: number[][][] };
  center: { type: 'Point'; coordinates: [number, number] };
  bbox: [number, number, number, number];
  render_height_m?: number;
  distance_m?: number;
};

export function baseBody(code: string) {
  return { code, formatted: formatPostcode(code), segments: parsePostcode(code) };
}

/** Standard building response: footprint as a GeoJSON Feature plus center and bbox. */
export function buildingBody(code: string, row: BuildingRow, extra: Record<string, unknown> = {}) {
  return {
    ...baseBody(code),
    ...extra,
    center: row.center.coordinates, // [lng, lat]
    bbox: row.bbox, // [minLng, minLat, maxLng, maxLat]
    building: {
      type: 'Feature',
      id: row.id,
      geometry: row.polygon,
      properties: {
        ...row.metadata,
        nipost_code: code,
        ...(row.render_height_m != null && { render_height_m: Math.round(row.render_height_m * 10) / 10 }),
      },
    },
    centerPoint: {
      type: 'Feature',
      geometry: row.center,
      properties: { nipost_code: code, role: 'center' },
    },
  };
}
