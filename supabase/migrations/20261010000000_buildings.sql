-- =============================================================================
-- NIPOST 3D Logistics & Navigation Platform — core spatial schema
-- Target: Supabase (PostgreSQL 17 + PostGIS 3)
-- =============================================================================

-- Supabase convention: extensions live in the `extensions` schema, which is on
-- the default search_path, so geometry types and ST_* functions resolve as-is.
CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- buildings: one row per physical building footprint, keyed by its NIPOST code.
--
-- nipost_code is stored in canonical form: 11 uppercase characters, no spaces
-- or dashes (e.g. 'FC02A09DB09'). Segments:
--   State (2 letters) | LGA (2 digits) | District (letter + 2 digits)
--   | Area (2 letters) | Building (2 digits)
-- All input normalisation happens in the API; the CHECK constraint guarantees
-- nothing non-canonical can ever reach the table.
--
-- All geometry is WGS84 (SRID 4326) — the coordinate system Mapbox GL JS and
-- GPS devices use, so no reprojection is needed on the read path.
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS buildings (
    id            BIGSERIAL PRIMARY KEY,
    nipost_code   CHAR(11)  NOT NULL,
    geom          geometry(Polygon, 4326) NOT NULL,
    center_point  geometry(Point, 4326)   NOT NULL,
    metadata      JSONB     NOT NULL DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT buildings_nipost_code_format
        CHECK (nipost_code ~ '^[A-Z]{2}[0-9]{2}[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$'),
    CONSTRAINT buildings_geom_valid
        CHECK (ST_IsValid(geom)),
    CONSTRAINT buildings_metadata_is_object
        CHECK (jsonb_typeof(metadata) = 'object')
);

-- Unique B-tree index: the hot path is an exact-match lookup by code.
CREATE UNIQUE INDEX IF NOT EXISTS buildings_nipost_code_uidx
    ON buildings (nipost_code);

-- Spatial indexes for "what building is under this pin?" and nearest-building queries.
CREATE INDEX IF NOT EXISTS buildings_geom_gix
    ON buildings USING GIST (geom);
CREATE INDEX IF NOT EXISTS buildings_center_point_gix
    ON buildings USING GIST (center_point);

-- Lets the B2C app filter by metadata keys (building_type, etc.).
CREATE INDEX IF NOT EXISTS buildings_metadata_gin
    ON buildings USING GIN (metadata jsonb_path_ops);

-- -----------------------------------------------------------------------------
-- Trigger: derive center_point from the footprint when it is not supplied, and
-- keep updated_at current. ST_PointOnSurface (not ST_Centroid) guarantees the
-- point lies inside the polygon, even for L- or U-shaped compounds.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION buildings_before_write()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
    IF NEW.center_point IS NULL
       OR (TG_OP = 'UPDATE' AND NEW.geom IS DISTINCT FROM OLD.geom
                            AND NEW.center_point IS NOT DISTINCT FROM OLD.center_point) THEN
        NEW.center_point := ST_PointOnSurface(NEW.geom);
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS buildings_before_write_trg ON buildings;
CREATE TRIGGER buildings_before_write_trg
    BEFORE INSERT OR UPDATE ON buildings
    FOR EACH ROW EXECUTE FUNCTION buildings_before_write();

-- -----------------------------------------------------------------------------
-- Row Level Security. The Express API connects as the database owner and is
-- unaffected; this only locks down Supabase's auto-generated REST API so the
-- public anon key can read buildings but never modify them.
-- -----------------------------------------------------------------------------
ALTER TABLE buildings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Buildings are publicly readable" ON buildings;
CREATE POLICY "Buildings are publicly readable"
    ON buildings FOR SELECT
    TO anon, authenticated
    USING (true);
