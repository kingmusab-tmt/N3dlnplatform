# NIPOST 3D Logistics & Navigation Platform (MVP)

Resolves a Nigerian digital postcode (e.g. `FC 02 A09 DB 09`) to its exact building footprint and flies a 3D Mapbox camera to it.

```
supabase/   Supabase project: PostGIS schema (migrations/) + demo data (seed.sql)
server/     Express API: GET /api/v1/navigate/:code
web/        Next.js + Mapbox GL JS 3D map
```

## Run locally

Requires Docker Desktop running and the Supabase CLI.

```bash
# 1. Database: local Supabase (Postgres on :54322, Studio on http://127.0.0.1:54323)
supabase start            # applies migrations + seed on first run
supabase db reset         # re-apply schema and seed after editing the SQL

# 2. API on :4000
cd server && cp .env.example .env && npm install && npm run dev

# 3. Web on :3000 (add your Mapbox pk.* token to .env.local first)
cd web && cp .env.example .env.local && npm install && npm run dev
```

To deploy the schema to a hosted Supabase project, run `supabase link --project-ref <ref>` and then `supabase db push`. Then set `DATABASE_URL` in the API to the project's connection string.

### Building data (OpenStreetMap import)

```bash
cd server
npm run import:osm                  # Wuse 2, Abuja (default pilot area)
npm run import:osm -- --dry-run     # fetch and assign codes without writing
npm run import:osm -- --bbox minLng,minLat,maxLng,maxLat --state LA --lga 10
```

This pulls every building footprint in the box from OpenStreetMap through Overpass and assigns each one a **simulated** code: `<state><lga>SIM<area><unit>`. The state and LGA codes are NIPOST's real codes (`FC` 02 = Abuja Municipal). The district is always `SIM`, which is valid NIPOST syntax but never a real district, so simulated codes can't collide with real addresses. Codes are assigned in a north-west to south-east sweep, so neighbouring buildings share an area code.

Re-running is safe. Buildings already imported keep their codes and get refreshed footprints, and new OSM buildings get the next free codes.

Codes to try in Wuse 2: `FC 02 SIM BP 88` (Silverbird Cinemas), `FC 02 SIM AV 71` (Promel Hotel), `FC 02 SIM AE 23` (Emab Plaza). `ek01a03fk01` is a demo building in Ado-Ekiti.

## API

`GET /api/v1/navigate/:code`. Spaces, dashes and letter case are ignored.

| Status | Body |
|---|---|
| 200 | `{ code, formatted, segments, center: [lng, lat], bbox, building: Feature<Polygon>, centerPoint: Feature<Point> }` |
| 400 | `{ error: "INVALID_POSTCODE" }`: not in the `AA00A00AA00` format |
| 404 | `{ error: "POSTCODE_NOT_FOUND" }` |

Every response includes `verification.status`. It is `verified` or `unregistered` when NIPOST answered, `unavailable` when NIPOST couldn't be reached, and `not_configured` when no key is set. A code that NIPOST recognises but that has no footprint on this platform returns 404 `POSTCODE_NOT_MAPPED`.

### Pin-drop and claims

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/buildings/at?lng=&lat=` | Building under a map click: the containing footprint, or the nearest within 12 m. Same response shape as `/navigate`, plus `pin`. 404 `NO_BUILDING_HERE` on empty ground. |
| `POST /api/v1/buildings/:code/claims` | Body `{ label, delivery_notes? }` (max 80 and 500 characters). Returns 201 with the claim's `id`. Rate limited to 20 per IP per hour. |

Claims are **unverified**. There are no user accounts yet, so anyone can claim any building, and one building can have several claims (flats, shops). The `claims` table has RLS enabled with no public policies, so Supabase's public REST API can't read anyone's delivery notes.

### NIPOST integration

Set `NIPOST_API_KEY` in `server/.env`. Use a **secret** key (`nipost_test_…` / `nipost_live_…`), never a publishable one. Then set `NIPOST_LOOKUP_LEVEL` to the highest level your key is granted:

- **Level 1** (free): the API checks each code with NIPOST, but locations still come only from this platform's database.
- **Level 5**: NIPOST also returns the location. Codes missing from the database are matched to the building footprint at that point (within 30 m). If there's no footprint there, the API returns NIPOST's point on its own.

If NIPOST is down, buildings in the database are still returned, marked `unavailable`.

`building.properties` holds the row's `metadata` JSONB (`height_m`, `building_type`, `gate`, …). The map uses `height_m` as the height of the highlighted building.

## Postcode format

Codes are stored in canonical form, which is 11 uppercase characters with no separators: State (2 letters), LGA (2 digits), District (letter + 2 digits), Area (2 letters), Building (2 digits). The same pattern is enforced in the API ([server/src/lib/postcode.js](server/src/lib/postcode.js)), the UI ([web/lib/postcode.ts](web/lib/postcode.ts)) and a DB `CHECK` constraint. If NIPOST publishes a different segment layout, update all three.

## Tests

```bash
cd server && npm test
```
