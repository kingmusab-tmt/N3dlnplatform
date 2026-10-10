# NIPOST 3D Logistics & Navigation Platform (MVP)

Resolves a Nigerian digital postcode (e.g. `FC 02 SIM BP 88`) to its exact building footprint, flies a 3D Mapbox camera to it, and routes dispatch riders to the building.

One Next.js app serves both the website and the B2B API, so it deploys as a single Vercel project.

```
supabase/          PostGIS schema (migrations/) + demo data (seed.sql)
web/
  app/             Pages: / (search), /rider (routing sandbox), /h/[id] (shared place)
  app/api/v1/      API route handlers (one folder per endpoint)
  lib/server/      API logic: DB, NIPOST & Mapbox clients, auth, rate limits
  scripts/         CLI: OpenStreetMap import, API key management
  openapi.yaml     API spec (served at /api/v1/docs)
  test/            Vitest suite
```

## Run locally

Requires Docker Desktop running and the Supabase CLI.

```bash
# 1. Database: local Supabase (Postgres on :54322, Studio on http://127.0.0.1:54323)
supabase start            # applies migrations + seed on first run
supabase db reset         # re-apply schema and seed after editing the SQL

# 2. App + API on :3000 (fill in tokens in .env.local first)
cd web && cp .env.example .env.local && npm install && npm run dev
```

### Building data (OpenStreetMap import)

```bash
cd web
npm run import:osm                  # Wuse 2, Abuja (default pilot area)
npm run import:osm -- --dry-run     # fetch and assign codes without writing
npm run import:osm -- --bbox minLng,minLat,maxLng,maxLat --state LA --lga 10
```

This pulls every building footprint in the box from OpenStreetMap through Overpass and assigns each one a **simulated** code: `<state><lga>SIM<area><unit>`. The state and LGA codes are NIPOST's real codes (`FC` 02 = Abuja Municipal). The district is always `SIM`, which is valid NIPOST syntax but never a real district, so simulated codes can't collide with real addresses. Codes are assigned in a north-west to south-east sweep, so neighbouring buildings share an area code.

Re-running is safe. Buildings already imported keep their codes and get refreshed footprints, and new OSM buildings get the next free codes.

Codes to try in Wuse 2: `FC 02 SIM BP 88` (Silverbird Cinemas), `FC 02 SIM AV 71` (Promel Hotel), `FC 02 SIM AE 23` (Emab Plaza). `ek01a03fk01` is a demo building in Ado-Ekiti.

## Deploy (Vercel + Supabase)

1. **Database:** create a Supabase project, then run `supabase link --project-ref <ref>` and `supabase db push` to apply the migrations.
2. **Vercel:** import the repo with **Root Directory = `web`**, then set these environment variables:
   - `DATABASE_URL`: Supabase's **pooler** connection string (Transaction mode, port 6543). Serverless functions open many short-lived connections, and the pooler stops them exhausting Postgres.
   - `NEXT_PUBLIC_MAPBOX_TOKEN`, plus `MAPBOX_TOKEN` (optional; defaults to the public token).
   - `NIPOST_API_KEY` and `NIPOST_LOOKUP_LEVEL`.
   - `SITE_URL`: the public URL, used for share-link previews.
3. **Data:** load buildings by running `npm run import:osm` locally with `DATABASE_URL` pointed at the hosted database.

## API

**Interactive docs:** `/api/v1/docs` (Swagger UI, with "Try it out").
**Spec:** [web/openapi.yaml](web/openapi.yaml), also served at `/api/v1/openapi.yaml`. Postman, Insomnia and client generators can import it directly (in Postman: Import → Link).

`web/test/openapi.test.ts` validates the spec and checks it against the route handlers in both directions. Every route file must be documented, and every documented operation must exist, reject keyless calls when secured, and answer its examples with a documented status. Update the spec in the same change as the code.

| Endpoint | Purpose |
|---|---|
| `GET /api/v1/navigate/:code` | Building for a postcode (any spacing/case), checked with NIPOST. 404 `POSTCODE_NOT_MAPPED` if NIPOST knows it but it isn't on the platform. |
| `GET /api/v1/navigate/:code/route?from=lng,lat&profile=` | Rider route: road leg (Mapbox Directions) plus on-foot `lastMile` to the gate or building center. |
| `GET /api/v1/buildings/at?lng=&lat=` | Building under a map click (inside, or nearest within 12 m). |
| `POST /api/v1/buildings/:code/claims` | Claim a building `{ label, delivery_notes? }`; returns the share id. 20 per caller per hour. |
| `GET /api/v1/claims/:id` | A shared place (the `/h/:id` page data). |
| `GET /api/v1/health` | Public status. |

`verification.status` on lookups: `verified`, `unregistered` (live NIPOST key says no), `not_in_sandbox` (a test key only sees NIPOST's sandbox), `unavailable` (NIPOST down), `not_configured`.

### Authentication and rate limits

- **Partners** send `X-API-Key`. Each key is limited per minute (default 120).
- **This website** calls the API from its own pages without a key. Same-origin requests are recognised from the browser's `Sec-Fetch-Site`, `Origin` or `Referer` headers and limited to **60/min per visitor IP**. Scripts can fake those headers, so this path is deliberately only as generous as one human visitor needs. Visitor IPs come from `x-real-ip`/`x-forwarded-for`, which Vercel sets itself. When self-hosting, put a proxy in front that overwrites them.
- **Counters live in Postgres** (`rate_limits`, an unlogged table), so every serverless instance shares the same limits.
- Responses carry `X-RateLimit-Limit` and `X-RateLimit-Remaining`. Over the limit returns `429` with `Retry-After`.

```bash
cd web
npm run keys -- create "Jumia Logistics" --limit 120   # prints the key once
npm run keys -- list
npm run keys -- revoke n3d_live_AbC123                 # prefix as shown by list
```

Only a SHA-256 hash of each key is stored. Revoked keys stop working within 60 seconds, because lookups are cached per instance.

### NIPOST integration

Set `NIPOST_API_KEY` to a **secret** key (`nipost_test_…` / `nipost_live_…`), never a publishable one. Then set `NIPOST_LOOKUP_LEVEL` to the highest level your key is granted:

- **Level 1** (free): codes are checked with NIPOST, but locations come only from this platform's database.
- **Level 5**: NIPOST also returns the location. Codes missing from the database are matched to the building footprint at that point (within 30 m). If there's no footprint there, NIPOST's point is returned on its own.

If NIPOST is down, mapped buildings are still returned, marked `unavailable`.

## Features

- **Pin-drop and claims.** Click any building to see its code, then claim it with a label and rider notes. Claims are **unverified**: there are no user accounts yet. The `claims` table has RLS on with no public policies, so Supabase's REST API can't read anyone's notes.
- **Shareable links.** Each claim gets `/h/<claim-id>`, a page with a 3D fly-in, the notes, Google Maps directions, and copy/WhatsApp buttons. The WhatsApp preview card comes from `app/h/[id]/opengraph-image.tsx`. The unguessable UUID is the only access control, and the pages are `noindex`.
- **Rider View.** `/rider?code=…` is a phone-sized dispatch sandbox. The rider starts at a simulated point about 1.5 km away. You can tap the map to move it or use GPS, switch travel mode, and run **Simulate ride**. Mapbox has no motorbike profile, so `driving` stands in for dispatch bikes.

## Postcode format

Codes are stored in canonical form: 11 uppercase characters with no separators. The segments are State (2 letters), LGA (2 digits, 01–99), District (3 alphanumerics), Area (2 letters) and Building unit (2 digits, 01–99), following [NIPOST's spec](https://docs.postcode.gov.ng/concepts/postcode-format). The pattern lives in [web/lib/postcode.ts](web/lib/postcode.ts), shared by the browser and the API, and in a DB `CHECK` constraint.

## Tests

```bash
cd web && npm test
```
