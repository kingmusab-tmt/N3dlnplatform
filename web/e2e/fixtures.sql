-- Buildings for the browser tests, in their own code district "E2E" (valid
-- NIPOST syntax, never a real district) so they never clash with imported
-- data. Idempotent: safe to run before every test run.
--
-- FC02E2EAA01  "E2E Plaza", in Wuse 2 near Silverbird Cinemas: routable by road.
-- FC02E2EAA02  "E2E House", a small neighbour.

INSERT INTO buildings (nipost_code, geom, metadata)
SELECT code, ST_Transform(ST_SetSRID(ST_MakeEnvelope(x - w / 2, y - d / 2, x + w / 2, y + d / 2), 32632), 4326), meta::jsonb
FROM (
  SELECT 'FC02E2EAA01' AS code, c AS centre, 30.0 AS w, 20.0 AS d,
         '{"name":"E2E Plaza","building_type":"commercial","height_m":12.8,"source":"e2e"}' AS meta
  FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(7.4862, 9.0683), 4326), 32632) AS c) p
  UNION ALL
  SELECT 'FC02E2EAA02', c, 14.0, 12.0, '{"name":"E2E House","building_type":"house","source":"e2e"}'
  FROM (SELECT ST_Transform(ST_SetSRID(ST_MakePoint(7.4869, 9.0686), 4326), 32632) AS c) p
) f, LATERAL (SELECT ST_X(centre) AS x, ST_Y(centre) AS y) xy
ON CONFLICT (nipost_code) DO NOTHING;

-- Leftovers from earlier runs.
DELETE FROM claims WHERE label LIKE 'E2E %';
