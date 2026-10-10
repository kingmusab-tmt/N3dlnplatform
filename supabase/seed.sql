-- =============================================================================
-- Demo seed data: one simulated building in Ado-Ekiti, to show the platform
-- spanning states. Real footprints come from OpenStreetMap:
--   cd server && npm run import:osm      (Wuse 2, Abuja by default)
-- =============================================================================

-- Builds a rectangular footprint of width x depth metres around a lng/lat by
-- working in UTM zone 32N (metres) and projecting back to WGS84.
CREATE OR REPLACE FUNCTION demo_footprint(lng float8, lat float8, width_m float8, depth_m float8)
RETURNS geometry(Polygon, 4326)
LANGUAGE sql IMMUTABLE
SET search_path = public, extensions
AS $$
    SELECT ST_Transform(
        ST_SetSRID(
            ST_MakeEnvelope(
                ST_X(c) - width_m / 2, ST_Y(c) - depth_m / 2,
                ST_X(c) + width_m / 2, ST_Y(c) + depth_m / 2
            ),
            32632
        ),
        4326
    )::geometry(Polygon, 4326)
    FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(lng, lat), 4326), 32632) AS c) p;
$$;

-- center_point is left NULL; the trigger derives it from geom.
INSERT INTO buildings (nipost_code, geom, metadata) VALUES
    ('EK01A03FK01', demo_footprint(5.22090, 7.62330, 20, 16),
        '{"building_type":"residential","height_m":6,"floors":2}')
ON CONFLICT (nipost_code) DO NOTHING;
