import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import PostcodeTry from '@/components/landing/PostcodeTry';
import SiteFooter from '@/components/SiteFooter';
import { PILOT_CITIES } from '@/lib/pilotCities';
import { EMERGENCY_NUMBER } from '@/lib/purpose';
import { getDeps } from '@/lib/server/deps';
import { getLandingStats } from '@/lib/server/stats';

export const metadata: Metadata = {
  title: 'TMTechEasy Gate · Every address, down to the gate',
  description:
    'Turn a Nigerian digital postcode into the exact building in 3D, the gate to use, and turn-by-turn directions, for fire crews, ambulances, police and delivery riders. A map, a navigator app and an API.',
  openGraph: {
    title: 'TMTechEasy Gate',
    description: 'Every Nigerian address, in 3D, down to the gate: for emergencies and deliveries.',
    images: [{ url: '/landing/hero-city.jpg', width: 1600, height: 900 }],
  },
};

// Figures come from the database; refresh them hourly.
export const revalidate = 3600;

const SEGMENTS = [
  { part: 'FC', name: 'State', note: 'Federal Capital Territory' },
  { part: '02', name: 'LGA', note: 'Abuja Municipal' },
  { part: 'SIM', name: 'District', note: '3 letters or digits' },
  { part: 'BP', name: 'Area', note: 'A neighbourhood block' },
  { part: '87', name: 'Building', note: 'The exact building' },
];

const USE_CASES = [
  {
    icon: '🚒',
    title: 'Fire service',
    body: 'Crews reach the right building, not the one next to it, and see its footprint, floors and neighbours in 3D before they arrive.',
    points: ['Route ends at the gate the owner marked', 'Building type, floors and height where mapped', 'Live re-routing by road'],
    href: '/rider?for=fire',
  },
  {
    icon: '🚑',
    title: 'Ambulance',
    body: 'A caller’s postcode or shared link becomes turn-by-turn directions to their gate, so paramedics don’t lose minutes searching the street.',
    points: ['Open the caller’s link and press Ambulance', 'Arrival alert at the gate', 'Notes such as “Flat 3B, blue gate” travel with it'],
    href: '/rider?for=ambulance',
  },
  {
    icon: '🚓',
    title: 'Police & security',
    body: 'Patrols and estate security go straight to the reported building, with the exact entrance and the street address where it is known.',
    points: ['Any building in the pilot area, by code or by tapping the map', 'Straight-line guidance if the network drops', 'Lite map for budget phones'],
    href: '/rider?for=police',
  },
  {
    icon: '📦',
    title: 'Delivery & dispatch',
    body: 'Riders follow live directions to the gate. Customers get a tracking link, and every stop ends with proof of delivery.',
    points: ['Multi-stop runs in the best order', 'Live tracking links for customers', 'Proof of delivery by photo or code'],
    href: '/rider',
  },
];

const FEATURES = [
  {
    icon: '◼',
    title: 'The whole street in 3D',
    body: 'Every mapped building is drawn in 3D on real terrain, so a rider or responder recognises the place before they arrive. The building you search for glows.',
  },
  {
    icon: 'G',
    title: 'Mark your gate',
    body: 'Owners drop a pin on the entrance visitors should use: the side gate, the shop door, Flat 3B. Directions lead there, not to the middle of the roof.',
  },
  {
    icon: '↗',
    title: 'Share it anywhere',
    body: 'One link carries your code, building, gate and notes. Send it on WhatsApp, paste it into a checkout, or give it to an ambulance or fire crew.',
  },
  {
    icon: '➤',
    title: 'Live navigation to the gate',
    body: 'Turn-by-turn directions from the phone’s GPS for riders and emergency crews, with re-routing, an arrival alert at the gate, and offline guidance when the signal drops.',
  },
  {
    icon: '◐',
    title: 'Lite mode for any phone',
    body: 'On data saver, 2G or a low-memory phone, the map switches to a flat, light version that uses about 60% less data.',
  },
  {
    icon: '✓',
    title: 'Checked with NIPOST',
    body: 'Every search is checked against NIPOST’s Digital Postcode API, so you can see whether a code is officially registered.',
  },
];

const AUDIENCES = [
  {
    title: 'Residents & businesses',
    points: [
      'Find your building by postcode or by tapping the map',
      'Claim it, mark your gate and add notes for visitors',
      'Share one link with riders, family or emergency responders',
      'Manage your places and revoke old links any time',
    ],
    cta: { label: 'Find my building', href: '/map' },
  },
  {
    title: 'Emergency services',
    points: [
      'Fire, ambulance and police modes in the Navigator',
      'Directions to the gate from a caller’s link or code',
      'Building facts on arrival: type, floors, street',
      'Keeps guiding when the network drops',
    ],
    cta: { label: 'Open the emergency navigator', href: '/rider?for=ambulance' },
  },
  {
    title: 'Riders & dispatch',
    points: [
      'Multi-stop runs with live customer tracking',
      'Live turn-by-turn navigation to the right gate',
      'Proof of delivery by photo or code',
      'Works by car, motorbike, bicycle or on foot',
    ],
    cta: { label: 'Open the Navigator', href: '/rider' },
  },
  {
    title: 'Businesses & control rooms',
    points: [
      'Resolve postcodes to footprints and coordinates by API',
      'Routes that end at the gate, for riders or response units',
      'Draw every building in your own maps with our tiles',
      'API keys, rate limits and full OpenAPI docs',
    ],
    cta: { label: 'Read the API docs', href: '/api/v1/docs' },
  },
];

const SAMPLE_RESPONSE = `{
  "code": "FC02SIMBP87",
  "formatted": "FC 02 SIM BP 87",
  "center": [7.4854694, 9.0675872],
  "building": {
    "type": "Feature",
    "geometry": { "type": "Polygon", "coordinates": [[…]] },
    "properties": {
      "name": "Silverbird Cinemas & Shopping Centre",
      "render_height_m": 12.8
    }
  },
  "source": "platform"
}`;

export default async function LandingPage() {
  const stats = await getLandingStats(getDeps().db);
  const buildingCount = stats.buildings ? stats.buildings.toLocaleString('en-NG') : 'Thousands of';

  return (
    <div className="min-h-dvh bg-[#0b0f14] text-slate-200">
      {/* ---- Header ---- */}
      <header className="sticky top-0 z-20 border-b border-white/5 bg-[#0b0f14]/80 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-white">
            <span aria-hidden className="h-3 w-3 rounded-sm bg-[#39FF14] shadow-[0_0_12px_#39FF14]" />
            TMTechEasy Gate
          </Link>
          <div className="hidden items-center gap-6 text-sm text-slate-400 md:flex">
            <a href="#use-cases" className="hover:text-white">Who it serves</a>
            <a href="#how-it-works" className="hover:text-white">How it works</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#business" className="hover:text-white">For business</a>
            <Link href="/api/v1/docs" className="hover:text-white">API docs</Link>
          </div>
          <Link href="/map" className="rounded-lg bg-[#39FF14] px-4 py-2 text-sm font-semibold text-slate-950 hover:brightness-110">
            Open the map
          </Link>
        </nav>
      </header>

      <main>
        {/* ---- Hero ---- */}
        <section className="relative overflow-hidden">
          <Image
            src="/landing/hero-city.jpg"
            alt="Wuse 2, Abuja in 3D, with one building highlighted in green"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center opacity-60"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#0b0f14] via-[#0b0f14]/85 to-[#0b0f14]/20" />
          <div aria-hidden className="absolute inset-x-0 bottom-0 h-32 bg-gradient-to-t from-[#0b0f14] to-transparent" />
          <div className="relative mx-auto max-w-6xl px-4 py-20 sm:px-6 sm:py-28 lg:py-36">
            <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#39FF14]">For emergencies and deliveries · Built on Nigeria’s digital postcodes</p>
            <h1 className="mt-4 max-w-3xl text-4xl font-bold leading-tight text-white sm:text-5xl lg:text-6xl">
              Every address, in 3D, <span className="text-[#39FF14]">down to the gate.</span>
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-slate-300">
              Type an 11-character NIPOST postcode and see the exact building in 3D, the entrance to use, and turn-by-turn
              directions to it, for the fire crew, the ambulance, the police patrol and the delivery rider. No more
              “opposite the blue church, after the second junction”.
            </p>
            <div className="mt-8">
              <PostcodeTry example={stats.exampleCode} />
            </div>
            <div className="mt-6 flex flex-wrap gap-3 text-sm">
              <Link href="/map" className="rounded-lg border border-white/15 px-4 py-2 font-medium text-white hover:bg-white/5">
                Explore the 3D map
              </Link>
              <Link href="/api/v1/docs" className="rounded-lg border border-white/15 px-4 py-2 font-medium text-white hover:bg-white/5">
                For developers →
              </Link>
            </div>
          </div>
        </section>

        {/* ---- Use cases ---- */}
        <section id="use-cases" className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
          <h2 className="text-3xl font-bold text-white">One address system, four kinds of trip</h2>
          <p className="mt-3 max-w-3xl text-slate-300">
            Whoever is on the way, the hard part is the same: finding the right building and the right gate. Choose a
            purpose in the Navigator and the directions adapt.
          </p>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {USE_CASES.map((u) => {
              const emergency = u.href !== '/rider';
              return (
                <div
                  key={u.title}
                  className={`flex flex-col rounded-2xl border bg-slate-900/60 p-6 ${emergency ? 'border-red-400/25' : 'border-[#39FF14]/25'}`}
                >
                  <span aria-hidden className="text-3xl">
                    {u.icon}
                  </span>
                  <h3 className="mt-3 text-lg font-semibold text-white">{u.title}</h3>
                  <p className="mt-2 text-sm text-slate-300">{u.body}</p>
                  <ul className="mt-4 flex-1 space-y-1.5 text-sm text-slate-400">
                    {u.points.map((pt) => (
                      <li key={pt} className="flex gap-2">
                        <span aria-hidden className={emergency ? 'text-red-300' : 'text-[#39FF14]'}>
                          •
                        </span>
                        {pt}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={u.href}
                    className={`mt-5 rounded-lg border px-3 py-2 text-center text-sm font-medium ${
                      emergency
                        ? 'border-red-400/40 text-red-200 hover:bg-red-400/10'
                        : 'border-[#39FF14]/40 text-[#39FF14] hover:bg-[#39FF14]/10'
                    }`}
                  >
                    Try {u.title.toLowerCase()} mode
                  </Link>
                </div>
              );
            })}
          </div>
          <p className="mt-6 rounded-xl border border-red-400/30 bg-red-950/30 px-4 py-3 text-sm text-red-100">
            <strong>
              In an emergency, call{' '}
              <a href={`tel:${EMERGENCY_NUMBER}`} className="underline">
                {EMERGENCY_NUMBER}
              </a>
              .
            </strong>{' '}
            TMTechEasy Gate gives directions; it does not alert or dispatch emergency services. Once help is on the way,
            share your place link with the responders so they find the right gate.
          </p>
        </section>

        {/* ---- Problem ---- */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <h2 className="text-3xl font-bold text-white">The last 100 metres are the hardest</h2>
              <p className="mt-4 text-slate-300">
                Many Nigerian addresses are described by landmarks, not numbers. Riders phone customers for directions,
                circle the block, or wait at the wrong gate of the right building. For a delivery that costs time and fuel;
                for an ambulance or a fire crew, those minutes can cost lives.
              </p>
              <p className="mt-4 text-slate-300">
                NIPOST’s National Digital Postcode gives every building an 11-character code. TMTechEasy Gate turns that
                code into something anyone on the way can follow: the building’s real footprint, the gate the owner marked,
                and a route that ends there.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
              <p className="text-sm uppercase tracking-wider text-slate-500">Instead of this…</p>
              <p className="mt-2 rounded-lg bg-slate-800/70 p-4 text-slate-300 italic">
                “Come to Wuse 2, pass the big plaza, turn by the pharmacy, it’s the cream building with the black gate,
                call me when you reach.”
              </p>
              <p className="mt-6 text-sm uppercase tracking-wider text-slate-500">…send this</p>
              <p className="mt-2 rounded-lg border border-[#39FF14]/30 bg-[#39FF14]/5 p-4 font-mono text-2xl tracking-[0.25em] text-[#39FF14]">
                {stats.exampleCode}
              </p>
              <p className="mt-2 text-sm text-slate-400">One code. The exact building, its gate, and directions to it.</p>
            </div>
          </div>
        </section>

        {/* ---- How it works ---- */}
        <section id="how-it-works" className="border-y border-white/5 bg-slate-950/50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-bold text-white">How it works</h2>
            <ol className="mt-10 grid gap-6 md:grid-cols-3">
              {[
                { n: '1', title: 'Postcode', body: 'Enter a NIPOST code in any form: FC 02 SIM BP 87, fc-02-sim-bp-87 or FC02SIMBP87 all work.' },
                { n: '2', title: 'Building', body: 'The code resolves to the building’s real footprint, drawn in 3D among its neighbours, and checked with NIPOST.' },
                { n: '3', title: 'Gate', body: 'Routing ends at the entrance the owner marked, with live directions for the rider or response crew and an alert on arrival.' },
              ].map((step) => (
                <li key={step.n} className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
                  <span className="grid h-9 w-9 place-items-center rounded-full bg-[#39FF14] font-bold text-slate-950">{step.n}</span>
                  <h3 className="mt-4 text-xl font-semibold text-white">{step.title}</h3>
                  <p className="mt-2 text-slate-300">{step.body}</p>
                </li>
              ))}
            </ol>

            <div className="mt-12 rounded-2xl border border-white/10 bg-slate-900/60 p-6">
              <h3 className="text-lg font-semibold text-white">What the 11 characters mean</h3>
              <div className="mt-5 grid grid-cols-5 gap-2 sm:gap-3">
                {SEGMENTS.map((s) => (
                  <div key={s.name} className="rounded-xl bg-slate-800/70 p-2 text-center sm:p-4">
                    <p className="font-mono text-xl font-bold tracking-widest text-[#39FF14] sm:text-3xl">{s.part}</p>
                    <p className="mt-1 text-xs font-semibold text-white sm:text-sm">{s.name}</p>
                    <p className="mt-1 hidden text-xs text-slate-400 sm:block">{s.note}</p>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-sm text-slate-400">
                State, local government area, district, area and building: each segment narrows it down until only one
                building is left.
              </p>
            </div>
          </div>
        </section>

        {/* ---- Features ---- */}
        <section id="features" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-3xl font-bold text-white">Everything between the postcode and the front gate</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-white/10 bg-slate-900/60 p-6">
                <span aria-hidden className="grid h-10 w-10 place-items-center rounded-lg bg-[#39FF14]/10 font-bold text-[#39FF14]">
                  {f.icon}
                </span>
                <h3 className="mt-4 text-lg font-semibold text-white">{f.title}</h3>
                <p className="mt-2 text-slate-300">{f.body}</p>
              </div>
            ))}
          </div>

          {/* Product screenshots */}
          <div className="mt-16 grid items-center gap-10 lg:grid-cols-2">
            <div>
              <h3 className="text-2xl font-bold text-white">From a shared link to the right gate</h3>
              <p className="mt-4 text-slate-300">
                Someone shares their place: with a rider for a delivery, or with an ambulance crew after calling 112. The
                link opens the building and the gate; one tap starts live navigation, turn by turn, with an alert on arrival.
              </p>
              <ul className="mt-6 space-y-3 text-slate-300">
                {[
                  'Notes (“Flat 3B, blue gate”) travel with the location',
                  'Re-routes automatically if the driver goes off course',
                  'Owners can revoke a link and issue a new one',
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <span aria-hidden className="text-[#39FF14]">✓</span>
                    {t}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex justify-center gap-4 sm:gap-6">
              <PhoneShot src="/landing/phone-share.jpg" alt="A shared location with the owner's gate and notes" />
              <PhoneShot
                src="/landing/phone-navigation.jpg"
                alt="Live rider navigation with the next turn and the distance left"
                className="mt-12"
              />
            </div>
          </div>
        </section>

        {/* ---- Audiences ---- */}
        <section className="border-y border-white/5 bg-slate-950/50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <h2 className="text-3xl font-bold text-white">Who it’s for</h2>
            <div className="mt-10 grid gap-5 md:grid-cols-2">
              {AUDIENCES.map((a) => (
                <div key={a.title} className="flex flex-col rounded-2xl border border-white/10 bg-slate-900/60 p-6">
                  <h3 className="text-xl font-semibold text-white">{a.title}</h3>
                  <ul className="mt-4 flex-1 space-y-2 text-slate-300">
                    {a.points.map((p) => (
                      <li key={p} className="flex gap-2">
                        <span aria-hidden className="text-[#39FF14]">•</span>
                        {p}
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={a.cta.href}
                    className="mt-6 rounded-lg border border-[#39FF14]/40 px-4 py-2 text-center font-medium text-[#39FF14] hover:bg-[#39FF14]/10"
                  >
                    {a.cta.label}
                  </Link>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ---- Business / API ---- */}
        <section id="business" className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <div className="grid gap-10 lg:grid-cols-2">
            <div>
              <h2 className="text-3xl font-bold text-white">An API for logistics, e-commerce and control rooms</h2>
              <p className="mt-4 text-slate-300">
                Plug NIPOST postcodes into your checkout, dispatch or emergency call-taking software. One request turns a
                code into the building’s footprint and coordinates; another gives your rider or response unit a route that
                ends at the gate.
              </p>
              <dl className="mt-6 grid gap-4 sm:grid-cols-2">
                {[
                  ['Lookup', 'Postcode → building footprint, center and NIPOST status'],
                  ['Routing', 'Road route plus the on-foot last mile to the gate'],
                  ['Pin-drop', 'Coordinates → the building and its code'],
                  ['Vector tiles', 'Every mapped building, for your own 3D maps'],
                ].map(([t, d]) => (
                  <div key={t} className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
                    <dt className="font-semibold text-white">{t}</dt>
                    <dd className="mt-1 text-sm text-slate-400">{d}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-6 text-sm text-slate-400">
                Per-partner API keys with rate limits, REST and GeoJSON, and an OpenAPI spec you can import into Postman.
              </p>
              <Link
                href="/api/v1/docs"
                className="mt-6 inline-block rounded-lg bg-[#39FF14] px-5 py-2.5 font-semibold text-slate-950 hover:brightness-110"
              >
                Explore the API docs
              </Link>
            </div>
            <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950">
              <div className="border-b border-white/10 px-4 py-2 text-xs text-slate-500">Request</div>
              <pre className="overflow-x-auto px-4 py-3 text-sm text-slate-200">
                <code>{`curl https://n3dlnplatform.vercel.app/api/v1/navigate/FC-02-SIM-BP-87 \\
  -H "X-API-Key: n3d_live_…"`}</code>
              </pre>
              <div className="border-y border-white/10 px-4 py-2 text-xs text-slate-500">Response (abridged)</div>
              <pre className="overflow-x-auto px-4 py-3 text-sm text-[#a7f3d0]">
                <code>{SAMPLE_RESPONSE}</code>
              </pre>
            </div>
          </div>
        </section>

        {/* ---- Pilot ---- */}
        <section className="border-t border-white/5 bg-slate-950/50">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <div className="grid gap-8 lg:grid-cols-3 lg:items-center">
              <div className="lg:col-span-2">
                <h2 className="text-3xl font-bold text-white">Now piloting in Abuja, Lagos, Kano and Onitsha</h2>
                <p className="mt-4 text-slate-300">
                  The pilot maps every building in the business and commercial core of four cities, from OpenStreetMap. Until
                  NIPOST’s full postcode data is connected, pilot buildings carry{' '}
                  <span className="font-medium text-white">simulated codes</span> in district “SIM”, so they can never be confused
                  with a real address. More areas follow as coverage grows.
                </p>
                <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
                  {PILOT_CITIES.map((c) => (
                    <li key={c.id} className="rounded-lg border border-white/10 bg-slate-900/60 px-3 py-2">
                      <span className="font-semibold text-white">{c.name}</span>
                      <span className="block text-slate-400">{c.areas}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <Stat value={buildingCount} label="buildings mapped" />
                <Stat value="37" label="states in the code system" />
                <Stat value="11" label="characters per postcode" />
                <Stat value="~60%" label="less data in Lite mode" />
              </div>
            </div>
            <div className="mt-12 flex flex-col items-start gap-4 rounded-2xl border border-[#39FF14]/30 bg-[#39FF14]/5 p-8 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-2xl font-bold text-white">See your street in 3D</h3>
                <p className="mt-1 text-slate-300">Search a postcode, or tap any building in the pilot cities to find its code.</p>
              </div>
              <Link href="/map" className="rounded-lg bg-[#39FF14] px-6 py-3 font-semibold text-slate-950 hover:brightness-110">
                Open the map
              </Link>
            </div>
          </div>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function PhoneShot({ src, alt, className = '' }: { src: string; alt: string; className?: string }) {
  return (
    <div className={`w-[42%] max-w-[240px] overflow-hidden rounded-[2rem] border-4 border-slate-700 bg-black shadow-2xl ${className}`}>
      <Image src={src} alt={alt} width={780} height={1688} sizes="(min-width: 1024px) 240px, 42vw" className="h-auto w-full" />
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <p className="text-2xl font-bold text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{label}</p>
    </div>
  );
}
