# TMTechEasy Gate (MVP)

3D addressing and navigation built on Nigeria's NIPOST digital postcodes, for emergencies and deliveries. MVP by Triple Multipurpose Technology.

Resolves a Nigerian digital postcode (e.g. `FC 02 SIM BP 87`) to its exact building footprint, flies a 3D Mapbox camera to it, and routes whoever is on the way to the building's gate:

- **Fire service, ambulance, police:** the Navigator's emergency modes (`/rider?for=fire|ambulance|police`) give road directions straight to the gate, with building facts (type, floors, street) on arrival. They give directions only; they do not alert emergency services (call 112).
- **Delivery and dispatch:** multi-stop runs, customer tracking links and proof of delivery.

One Next.js app serves both the website and the B2B API, so it deploys as a single Vercel project.

```
supabase/          PostGIS schema (migrations/) + demo data (seed.sql)
web/
  app/             Pages: / (landing), /map (3D search map), /rider (Navigator: delivery and emergency modes),
                   /h/[share_id] (shared place), /login, /account (My places)
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

Codes to try in Wuse 2: `FC 02 SIM BP 87` (Silverbird Cinemas), `FC 02 SIM AV 70` (Promel Hotel), `FC 02 SIM AE 23` (Emab Plaza). `ek01a03fk01` is a demo building in Ado-Ekiti.

## Deploy (Vercel + Supabase)

1. **Database:** create a Supabase project, then run `supabase link --project-ref <ref>` and `supabase db push` to apply the migrations.
2. **Vercel:** import the repo with **Root Directory = `web`**, then set these environment variables:
   - `DATABASE_URL`: Supabase's **pooler** connection string (Transaction mode, port 6543). Serverless functions open many short-lived connections, and the pooler stops them exhausting Postgres. Leave `sslmode` out of the URL: the app always uses TLS with Supabase's root CA (bundled in `lib/server/supabaseCa.ts`) for non-local hosts. For another Postgres host, set `DATABASE_CA_CERT` to its CA (PEM).
   - `NEXT_PUBLIC_MAPBOX_TOKEN`, plus `MAPBOX_TOKEN` (optional; defaults to the public token).
   - `NIPOST_API_KEY` and `NIPOST_LOOKUP_LEVEL`.
   - `SITE_URL`: the public URL, used for share-link previews.
3. **Data:** load buildings by running `DATABASE_URL=<pooler url> npm run import:osm` from `web/`. A variable set on the command line overrides `.env.local`. Codes depend on the OSM data on the day of the first import, so a fresh database can differ by a unit or two from an older local one.

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

- **Accounts.** Sign in with a 6-digit code by email or SMS (Supabase Auth, `/login`). On the website, claiming a building requires signing in, and **My places** (`/account`) lets owners edit claims, remove gates, **revoke and replace** share links (`share_id` is separate from the claim id), and delete. The `/api/v1/me/*` endpoints use the session cookie, not API keys, and only ever touch the caller's own claims. Partner API-key claims have no owner. If `NEXT_PUBLIC_SUPABASE_URL` isn't set, accounts are off and website claims are anonymous.
  - **Local:** email codes arrive in Mailpit (http://127.0.0.1:54324). Phone `0800 000 0001` signs in with code `123456`, set in `supabase/config.toml`, and no SMS is sent.
  - **Production:** set the two public env vars in Vercel, add `{{ .Token }}` to the Supabase email templates, and configure an SMS provider for phone sign-in. See TODO.md.

- **3D city.** Every platform building is drawn in 3D from `GET /api/v1/tiles/buildings/{z}/{x}/{y}.mvt`, vector tiles built by PostGIS (`ST_AsMVT`). It sits on Mapbox's Standard style, with lighting, shadows, terrain and 3D trees, and has a Day/Dusk/Night switch. Heights come from OSM where known, and are otherwise estimated at 1–4 storeys from the footprint area (`renderHeightSql`), so lookups and tiles always agree. Mapbox's own 3D buildings are hidden, because in Nigeria they're mostly flat stubs. The map opens with a flight from all of Nigeria into Wuse 2, orbits each found building until you touch the map, and pulses its highlight. All three animations respect `prefers-reduced-motion`.

- **Dispatch (delivery runs).** Riders start a run with one or more stops in the Rider View; partners create runs with `POST /api/v1/runs` and send riders the returned `rider_url`.
  - **Order:** optionally reordered for the shortest route (Mapbox Optimization, up to 11 stops).
  - **Tracking links:** each stop gets a public link `/t/<token>` for the customer, with live rider position and ETA once theirs is the current stop, and "N deliveries before yours" until then.
  - **Proof of delivery:** a 4-digit code (partner-supplied or generated, never shown on tracking pages) and/or a photo, which is shrunk on the phone to ≤1.5 MB and stored in `delivery_photos`.
  - **Rider authentication:** the rider's phone uses the run's secret token (`X-Rider-Token`; only a hash is stored), and has its own rate limit per run.
- **Lite map.** A flat, lighter map for budget phones and limited data: the classic dark style, flat buildings, a top-down camera, and no terrain, 3D trees or decorative animation. It turns on automatically when the browser reports data saver, a 2G connection, or ≤2 GB of RAM (`lib/mapMode.ts`). The **3D | Lite** switch on every map overrides it, and the choice is remembered on the device. It measured about 60% less map data than 3D for the same page.
- **Pin-drop and claims.** Click any building to see its code, then claim it with a label, rider notes and optionally a **gate**. "Mark the gate on the map" places a draggable marker, which must be within 30 m of the footprint. Gates are stored per claim, not per building, so an unverified claimant can't move other people's entrance. The share page's Directions button and `/rider?code=…&claim=…` (`claim` param on the route API) route to that gate. Claims are **unverified**: there are no user accounts yet. The `claims` table has RLS on with no public policies, so Supabase's REST API can't read anyone's notes.
- **Shareable links.** Each claim gets `/h/<share_id>`, a page with a 3D fly-in, the notes, and copy/WhatsApp buttons. **Directions** opens our own Rider View, which routes to the owner's gate with live navigation, and Google Maps is offered as a fallback link. The WhatsApp preview card comes from `app/h/[id]/opengraph-image.tsx`. The unguessable UUID is the only access control, and the pages are `noindex`.
- **Rider View.** `/rider?code=…` is a phone-sized dispatch screen. The rider is drawn as a car, bicycle or walking person, depending on the travel mode.
  - **Start delivery:** live turn-by-turn navigation from the device's GPS. A next-turn banner and the distance and time left update as the rider moves, and the camera follows unless they pan, when a **Re-center** button appears. The rider is re-routed after 3 consecutive off-route positions (more than 40 m, or 1.5x the GPS accuracy, from the route; at most every 15 s). Arrival is detected within 20 m of the gate or building, and the screen is kept awake (Wake Lock). Only a denied location permission stops navigation; timeouts and weak signal just show a warning. The progress logic is in `lib/navigation.ts`, with tests.
  - **Simulate ride:** animates the same route, for demos away from Abuja. The rider starts at a simulated point about 1.5 km away, and you can tap the map to move it. Mapbox has no motorbike profile, so `driving` stands in for dispatch bikes.

## Admin

`/admin` is for the platform team: signed-in accounts listed in `admin_users`. Everyone else gets "not found". Every admin page checks this itself (not just the layout), and the admin API (`/api/v1/admin/*`) accepts only same-origin requests with an admin's session cookie, never partner API keys.

```bash
cd web
npm run admin -- add you@example.com     # or a phone number; the account must have signed in once
npm run admin -- list
npm run admin -- remove you@example.com
```

Further admins can be added from **Admins** in the dashboard. Sections:

- **Overview:** visitors (new and returning), visits, **average and median visit duration**, total time on site, page views, bounce rate, people on the site now, visitors per day or hour, how long visits last, top pages, landing pages, referrers, devices, countries, recent visits, and platform totals.
- **Users:** accounts with their join date, last sign-in and number of places.
- **Places:** claimed places with their notes and owner, with **Remove** for moderation (the share link stops working).
- **Deliveries:** runs with who created them, stops delivered, and when the rider was last seen.
- **API keys:** create partner keys (shown once) and revoke them, with last use and run counts.
- **Admins:** add or remove admins (the last admin can't be removed).

**Visitor analytics** are first-party (`components/Analytics.tsx` → `POST /api/v1/analytics` → `analytics_sessions`, `analytics_pageviews`).
- **Identity:** the browser keeps a random visitor id and a visit id in localStorage. A visit ends after 30 idle minutes.
- **Duration:** active time comes from 15-second heartbeats while the page is visible, capped server-side by wall-clock time.
- **Privacy:** no cookies and no IP addresses are stored. Paths are stored without query strings, and private tokens are masked (`/t/[token]`, `/h/[id]`).
- **Exclusions:** bots, `/admin` and browsers sending Do Not Track or Global Privacy Control are not counted. Country comes from Vercel's `x-vercel-ip-country` header.
- **Offline:** the service worker never caches admin pages.

## Postcode format

Codes are stored in canonical form: 11 uppercase characters with no separators. The segments are State (2 letters), LGA (2 digits, 01–99), District (3 alphanumerics), Area (2 letters) and Building unit (2 digits, 01–99), following [NIPOST's spec](https://docs.postcode.gov.ng/concepts/postcode-format). The pattern lives in [web/lib/postcode.ts](web/lib/postcode.ts), shared by the browser and the API, and in a DB `CHECK` constraint.

## Tests

```bash
cd web
npm test            # unit + API tests (Vitest), no services needed
npm run test:e2e    # browser tests (Playwright); needs `supabase start`
```

The browser tests cover search, phone and email sign-in, claiming, share links and Directions, My places (edit, new link, delete), and live delivery navigation with a simulated GPS. They load their own buildings in code district `E2E` (`web/e2e/fixtures.sql`), refuse to run against a non-local database, and reuse a running `npm run dev`.

**CI** (`.github/workflows/ci.yml`) runs on every push and pull request:
- **Fast checks:** type check, unit tests and a production build.
- **Browser tests:** against a fresh local Supabase in Docker.

Add a `MAPBOX_TOKEN` repository secret (Settings → Secrets and variables → Actions) so CI also renders the map and runs the routing tests; without it those tests are skipped.
