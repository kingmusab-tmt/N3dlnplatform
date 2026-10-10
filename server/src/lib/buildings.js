import { formatPostcode, parsePostcode } from './postcode.js';

// Postgres builds the GeoJSON itself, so geometry never round-trips through JS.
// ST_AsGeoJSON(..., 7) keeps 7 decimal places (~1 cm), plenty for a gate.
export const BUILDING_COLUMNS = `
    id,
    nipost_code,
    metadata,
    ST_AsGeoJSON(geom, 7)::json         AS polygon,
    ST_AsGeoJSON(center_point, 7)::json AS center,
    json_build_array(ST_XMin(geom), ST_YMin(geom), ST_XMax(geom), ST_YMax(geom)) AS bbox
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

export function baseBody(code) {
  return { code, formatted: formatPostcode(code), segments: parsePostcode(code) };
}

/** Standard building response: footprint as a GeoJSON Feature plus center and bbox. */
export function buildingBody(code, row, extra = {}) {
  return {
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
  };
}
