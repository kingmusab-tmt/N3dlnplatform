-- =============================================================================
-- Demo seed data: a handful of simulated buildings in Wuse 2, Abuja (FCT) and
-- one in Ado-Ekiti, so the API and map can be exercised end to end.
-- Replace with OSM footprints for the real pilot area.
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
    ('FC02A09DB01', demo_footprint(7.47862, 9.07795, 28, 18),
        '{"building_type":"residential","name":"Block A, Aminu Kano Cres.","height_m":12,"floors":4,"gate":{"lng":7.47862,"lat":9.07785,"side":"south"}}'),
    ('FC02A09DB02', demo_footprint(7.47912, 9.07801, 22, 22),
        '{"building_type":"commercial","name":"Plaza 2","height_m":24,"floors":8,"gate":{"lng":7.47912,"lat":9.07790,"side":"south"}}'),
    ('FC02A09DB03', demo_footprint(7.47960, 9.07808, 18, 14),
        '{"building_type":"residential","height_m":7,"floors":2}'),
    ('FC02A09DB09', demo_footprint(7.47890, 9.07745, 34, 20),
        '{"building_type":"mixed_use","name":"Wuse 2 Mall Annex","height_m":18,"floors":6,"gate":{"lng":7.47873,"lat":9.07736,"side":"south-west"}}'),
    ('EK01A03FK01', demo_footprint(5.22090, 7.62330, 20, 16),
        '{"building_type":"residential","height_m":6,"floors":2}')
ON CONFLICT (nipost_code) DO NOTHING;
