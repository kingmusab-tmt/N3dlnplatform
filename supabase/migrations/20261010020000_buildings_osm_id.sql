-- Links a building to its OpenStreetMap way so re-running the importer updates
-- footprints in place and never reassigns a code that people may already share.
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS osm_id BIGINT;

ALTER TABLE buildings DROP CONSTRAINT IF EXISTS buildings_osm_id_key;
ALTER TABLE buildings ADD CONSTRAINT buildings_osm_id_key UNIQUE (osm_id);
