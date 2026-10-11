# To do

Owner: **you** = needs your accounts or a decision · **dev** = code work.

## Launch & security

- [ ] **Rotate the Supabase `sb_secret_…` key** (Supabase → Project Settings → API Keys). It was shared in chat, and the app doesn't use it. *(you)*
- [ ] **Lock down Mapbox:** restrict the public token to `n3dlnplatform.vercel.app`, create a second unrestricted token, and set it as `MAPBOX_TOKEN` in Vercel for server-side routing. *(you, then dev to verify)*
- [ ] **NIPOST live key with lookup level 5.** Needs NIPOST's business (KYB) approval. Real postcodes stay unverifiable until then, and level 5 adds coordinates. *(you)*
- [ ] **Confirm the footer credit:** the landing page says "CEO: Engr. Musab Mubaraq Mburaimoh". Check the spelling of the surname. *(you)*

## Product

- [x] **Rename to TMTechEasy Gate**, everywhere in the app, API docs and emails. *(done)*
- [x] **Vehicle icons in Simulate ride:** a car, bicycle or walking person instead of the dot, matching the travel mode and rotating with the road. *(done)*
- [x] **"Start delivery" live navigation:** follow the rider's real GPS, show the next turn and distance left, re-route when off course, detect arrival at the gate, and keep the screen awake. *(done; needs a real-world ride in the field test)*
- [x] **Dispatch features:** live customer tracking links, proof of delivery (code and/or photo), multi-stop runs with optimised order, and run links for partners' riders. *(done)*
- [x] **Emergency use, not only delivery:** fire service, ambulance and police modes in the Navigator (`/rider?for=…`): road directions to the gate, no run or proof of delivery, building facts on arrival, and a "call 112" reminder (the app gives directions only). Responder links on the map and on shared places. *(done)*
- [x] **Offline-friendly Navigator:** installable app (PWA); the Navigator, its run and visited building tiles work without signal; navigation falls back to straight-line guidance; delivery proofs and position updates are saved on the phone and sent when back online. *(done; check on a real phone in the field test)*
- [x] **Mark or change a gate from My places**: opens the map in gate mode, with Save gate. *(done)*
- [x] **Lite map mode** for budget phones and limited data: automatic on data saver, 2G or ≤2 GB RAM, with a manual 3D/Lite switch. Uses about 60% less map data. *(done)*
- [x] **Map on phones:** the result card can be hidden, tucks away when you move the map, and taps on empty ground no longer replace the result with "No mapped building". *(done)*
- [ ] **Talk to emergency services** (FCT Fire Service, NEMA/SEMA, hospital ambulance units, Police) about piloting the emergency navigator, and whether call-takers want an API integration. *(you)*
- [ ] **More coverage:** import the next pilot area (e.g. Ikeja) with `npm run import:osm -- --bbox … --state LA --lga …`. *(dev; you pick the area)*
- [ ] **Partner self-service:** request an API key, see usage, and count requests per key for billing. *(dev)*
- [ ] **Local languages (Hausa, Yoruba, Igbo): postponed.** Pidgin is dropped. N-ATLaS isn't used: it needs a GPU, and its licence limits free use to 1,000 users. When resumed, translations need a native speaker's check. *(you decide when, then dev)*

## Accounts & admin

- [x] **User accounts** (Supabase Auth, email or SMS code): My places, with edit, delete and revoke-and-replace share links. *(done)*
- [x] **Production sign-in:** hosted auth settings (site URL, redirect URLs, 6-digit code emails) pushed from `supabase/config.toml` (`[remotes.production]`); the hosted publishable key set in Vercel; a custom email sender in Supabase, so anyone can sign in by email. *(done)*
- [x] **Admin dashboard** (`/admin`): visitor analytics (visitors, visits, visit duration, pages, sources, devices, countries, live now), users, places moderation, delivery runs, API key management and admins. musab.buraimoh@gmail.com is the first admin in production. *(done)*
- [x] **Visit data reports and clean-up:** admins download CSV reports (summary or raw visits) and delete old visit data from the dashboard. *(done)*
- [ ] **SMS for phone sign-in:** an SMS provider account (Twilio, Vonage or MessageBird are built in; Termii needs Supabase's Send SMS hook), configured in Supabase → Authentication → Providers → Phone. Then set `NEXT_PUBLIC_AUTH_PHONE=true` in Vercel and redeploy to show the Phone option. *(you, then dev to verify)*
- [ ] **Privacy notice:** a short page saying the site counts anonymous visits (no cookies or IP addresses) and what account data is kept, linked from the footer and sign-in page. *(dev; you approve the wording)*

## Reliability

- [x] **CI:** type check, unit tests and build on every push (GitHub Actions). *(done)*
- [x] **Browser end-to-end tests:** Playwright for search, sign-in, claim, share, Directions, My places, live navigation, dispatch, offline, emergency modes, the phone map and the admin dashboard. *(done)*
- [x] **Favicon and app icons.** *(done)*
- [ ] **Unlock GitHub Actions:** GitHub refuses to start CI jobs because "your account is locked due to a billing issue". Fix it in GitHub → Settings → Billing and plans. *(you)*
- [ ] **Add the `MAPBOX_TOKEN` GitHub secret,** so CI renders maps and runs the routing tests. *(you)*
- [ ] **Error tracking and uptime alerts** (e.g. Sentry and an uptime monitor). *(dev, plus an account from you)*
- [ ] **Field test in Wuse 2:** walk or ride real deliveries and emergency routes, and check GPS against the 3D map, including offline. Phase 3 of the MVP plan. *(you)*

## Security & accessibility

- [x] **Security headers:** strict Content-Security-Policy, no framing, HSTS, nosniff, referrer and permissions policies, no X-Powered-By. *(done)*
- [ ] **Accessibility check:** run axe-core on every page and fix what it finds (contrast, labels, focus order, a skip link), plus a keyboard and screen-reader pass, and add it to the browser tests. *(dev)*
- [ ] **Upgrade to Next.js 16** to clear the remaining audit finding (PostCSS inside Next 15, a build-time issue, so low risk). It's a major upgrade: `middleware.ts` becomes `proxy.ts`, among other changes. *(dev)*
- [ ] **CAPTCHA on sign-in** (Supabase supports hCaptcha/Turnstile), if SMS or email code requests get abused. *(you: free account, then dev)*

## Housekeeping

- [ ] **Move the project out of OneDrive** (e.g. `C:\dev\N3DLNPlatform`). OneDrive syncing has caused stale configs and locked folders. *(you)*
- [ ] **Reset the local database to match production,** so codes agree; locally Silverbird is `BP 88`, in production `BP 87`. This deletes local test claims. *(dev, on request)*
- [ ] **If a Vercel deploy fails with a GitHub "secondary rate limit" error:** wait about 10 minutes and redeploy once; repeated clicks make it worse. *(note)*
