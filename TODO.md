# To do

Owner: **you** = needs your accounts or a decision · **dev** = code work.

## Launch & security

- [ ] **Rotate the Supabase `sb_secret_…` key** (Supabase → Project Settings → API Keys). It was shared in chat, and the app doesn't use it. *(you)*
- [ ] **Lock down Mapbox:** restrict the public token to `n3dlnplatform.vercel.app`, create a second unrestricted token, and set it as `MAPBOX_TOKEN` in Vercel for server-side routing. *(you, then dev to verify)*
- [ ] **NIPOST live key with lookup level 5.** Needs NIPOST's business (KYB) approval. Real postcodes stay unverifiable until then, and level 5 adds coordinates. *(you)*

## Product

- [x] **Vehicle icons in Simulate ride:** a car, bicycle or walking person instead of the dot, matching the travel mode and rotating with the road. *(done)*
- [x] **"Start delivery" live navigation:** follow the rider's real GPS, show the next turn and distance left, re-route when off course, detect arrival at the gate, and keep the screen awake. *(done; needs a real-world ride in the field test)*
- [x] **User accounts** (Supabase Auth, email or SMS code): My places, with edit, delete and revoke-and-replace share links. *(done in code; production needs the setup items below)*
- [ ] **Turn on accounts in production:** add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` in Vercel; in Supabase, put the code (`{{ .Token }}`) in the Magic Link and Confirm signup email templates and set the Site URL. Until then, claims stay anonymous. *(you)*
- [ ] **SMS for phone sign-in:** an SMS provider account (Twilio, Vonage or MessageBird are built in; Termii needs Supabase's Send SMS hook), configured in Supabase → Authentication → Providers → Phone. *(you, then dev to verify)*
- [ ] **Custom email sender** (e.g. Resend) in Supabase → Authentication → SMTP. The built-in sender only allows a few emails an hour. *(you)*
- [ ] **Re-mark a gate from My places.** You can remove a gate there, but setting a new one still means re-claiming. *(dev)*
- [ ] **Lite map mode** for budget phones and limited data: flat map, no terrain or 3D trees, fewer tiles. *(dev)*
- [ ] **More coverage:** import the next pilot area (e.g. Ikeja) with `npm run import:osm -- --bbox … --state LA --lga …`. *(dev; you pick the area)*
- [ ] **Partner self-service:** request an API key, see usage, and count requests per key for billing. *(dev)*

## Reliability

- [x] **CI:** type check, unit tests and build on every push (GitHub Actions). *(done)*
- [x] **Browser end-to-end tests:** Playwright for search, sign-in, claim, share, Directions, My places and live navigation, run in CI. *(done)*
- [ ] **Add the `MAPBOX_TOKEN` GitHub secret,** so CI renders maps and runs the routing tests. *(you)*
- [ ] **Error tracking and uptime alerts** (e.g. Sentry and an uptime monitor). *(dev, plus an account from you)*
- [ ] **Add a favicon.** The browser currently gets a 404 for `/favicon.ico`. *(dev)*
- [ ] **Field test in Wuse 2:** walk or ride real deliveries and check GPS against the 3D map. Phase 3 of the MVP plan. *(you)*

## Housekeeping

- [ ] **Move the project out of OneDrive** (e.g. `C:\dev\N3DLNPlatform`). OneDrive syncing has caused stale configs and locked folders. *(you)*
- [ ] **Reset the local database to match production,** so codes agree; locally Silverbird is `BP 88`, in production `BP 87`. This deletes local test claims. *(dev, on request)*
