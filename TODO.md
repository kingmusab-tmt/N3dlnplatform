# To do

Owner: **you** = needs your accounts or a decision · **dev** = code work.

## Launch & security

- [x] **Rotate the Supabase `sb_secret_…` key.** *(done)*
- [x] **Footer credit** "CEO: Engr. Musab Mubaraq Mburaimoh" confirmed correct. *(done)*
- [ ] **Lock down Mapbox:** restrict the public token to `n3dlnplatform.vercel.app`, create a second unrestricted token, and set it as `MAPBOX_TOKEN` in Vercel for server-side routing. *(you, then dev to verify)*
- [ ] **NIPOST live key with lookup level 5.** Needs NIPOST's business (KYB) approval. Real postcodes stay unverifiable until then, and level 5 adds coordinates. *(you)*
- [x] **CAPTCHA on sign-in** (Cloudflare Turnstile through Supabase): built and on locally with Cloudflare's test keys. *(done in code)*
- [ ] **Turn CAPTCHA on in production:** create a free Turnstile widget at dash.cloudflare.com (hostname `n3dlnplatform.vercel.app`). Put its site key in Vercel as `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and redeploy **first**; then put the secret key in Supabase → Authentication → Attack Protection → Turnstile. The other order blocks every sign-in. *(you; dev can do the Supabase step)*
- [x] **Privacy notice** (`/privacy`), linked from the footer, sign-in and My places, plus **Delete my account** in My places. *(done)*
- [ ] **Privacy contact address:** set `PRIVACY_CONTACT_EMAIL` in Vercel to the address people should write to about their data (shown on the privacy notice). *(you)*

## Product

- [x] **Rename to TMTechEasy Gate.** *(done)*
- [x] **Navigation:** vehicle icons in Simulate ride, and "Start delivery" live GPS navigation with re-routing and arrival at the gate. *(done)*
- [x] **Dispatch features:** live customer tracking links, proof of delivery (code and/or photo), multi-stop runs with optimised order, and run links for partners' riders. *(done)*
- [x] **Emergency use:** fire service, ambulance and police modes in the Navigator, with responder links on the map and on shared places. *(done)*
- [x] **Offline-friendly Navigator** (installable app, straight-line guidance and saved proofs when the signal drops). *(done)*
- [x] **Gates from My places, Lite map mode, and the phone map fixes.** *(done)*
- [x] **Talk to emergency services:** not needed for the MVP; revisit when there are resources to pilot it. *(closed)*
- [x] **Local languages:** not needed for the MVP; revisit before going to production. *(closed)*
- [ ] **Coverage for all of Nigeria:** import every OpenStreetMap building in Nigeria, state by state (`npm run import:osm -- --bbox … --state … --lga …`), with codes per state and LGA. Plan for size: buildings take about 0.6 KB each, and OSM has many millions in Nigeria, so full coverage needs several GB. That's beyond Supabase's free 500 MB, so it needs a paid plan or a staged rollout (e.g. Osun first, for the Osogbo field test). *(dev; you choose the plan and order)*
- [ ] **Partner self-service:** request an API key, see usage, and count requests per key for billing. *(dev)*

## Accounts & admin

- [x] **Accounts and production sign-in:** email codes, with a custom email sender. My places has edit, delete, revoke-and-replace share links, and account deletion. *(done)*
- [x] **Phone (SMS) sign-in:** not needed; email is enough. The code stays behind `NEXT_PUBLIC_AUTH_PHONE` if it's ever wanted. *(closed)*
- [x] **Admin dashboard** (`/admin`): visitor analytics, users, places moderation, delivery runs, API keys and admins, with CSV reports and visit-data clean-up. *(done)*

## Testing

- [x] **Automated tests:** unit and API tests (Vitest) and browser tests (Playwright) for every main flow, run locally with `npm test` and `npm run test:e2e`. GitHub Actions CI was removed: not needed while this is an MVP. *(done)*
- [ ] **Field test in Osogbo** once NIPOST approves the KYB: walk or ride real deliveries and emergency routes, and check GPS against the 3D map, including offline. It needs Osogbo's buildings imported first (see Coverage). *(you, then dev)*

## Code quality

- [ ] **Accessibility check:** run axe-core on every page and fix what it finds (contrast, labels, focus order, a skip link), plus a keyboard and screen-reader pass, and add it to the browser tests. *(dev)*
- [ ] **Upgrade to Next.js 16** to clear the remaining audit finding (PostCSS inside Next 15, a build-time issue, so low risk). It's a major upgrade: `middleware.ts` becomes `proxy.ts`, among other changes. *(dev)*

## Housekeeping

- [x] **Local database reset to match production:** 4,168 buildings with the same ids and codes (Silverbird is `FC 02 SIM BP 87` in both). *(done)*
- [ ] **Move the project out of OneDrive** (e.g. `C:\dev\N3DLNPlatform`). OneDrive syncing has caused stale configs and locked folders. *(you, next)*
