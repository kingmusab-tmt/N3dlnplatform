-- The entrance a claimant wants riders to use. Stored per claim, not per
-- building: claims are unverified, so one claimant must not be able to move
-- everyone's gate, and different flats or shops can have different entrances.
-- The API only accepts points within 30 m of the building footprint.
ALTER TABLE claims ADD COLUMN IF NOT EXISTS gate geometry(Point, 4326);
