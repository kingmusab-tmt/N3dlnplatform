import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import { CONTACT, ORG } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Credits & attributions · TMTechEasy Gate',
  description: 'The data, services and open-source software TMTechEasy Gate is built with, and their licences.',
};

type Credit = { name: string; href: string; what: string; licence?: string };

const DATA: Credit[] = [
  {
    name: 'OpenStreetMap contributors',
    href: 'https://www.openstreetmap.org/copyright',
    what: 'Building footprints, names, heights, floors, street addresses and entrances, imported through the Overpass API.',
    licence: 'Open Database License (ODbL) 1.0',
  },
  {
    name: 'Mapbox',
    href: 'https://www.mapbox.com/about/maps/',
    what: 'Base maps (Mapbox Standard and Dark styles), terrain, 3D trees, road routing (Directions API) and stop ordering (Optimization API).',
    licence: 'Mapbox Terms of Service; map data © Mapbox © OpenStreetMap',
  },
  {
    name: 'NIPOST: National Digital Postcode system',
    href: 'https://docs.postcode.gov.ng',
    what: 'The 11-character postcode format, and checks of real postcodes against NIPOST’s Digital Postcode API. Pilot codes in district “SIM” are simulated by this platform.',
    licence: 'Used under NIPOST’s API terms; TMTechEasy Gate is not operated by or affiliated with NIPOST',
  },
  {
    name: 'Overpass API',
    href: 'https://wiki.openstreetmap.org/wiki/Overpass_API',
    what: 'Public servers (overpass-api.de, overpass.kumi.systems) used to download OpenStreetMap buildings.',
  },
];

const SERVICES: Credit[] = [
  { name: 'Supabase', href: 'https://supabase.com', what: 'Database (PostgreSQL with PostGIS) and sign-in with email codes.' },
  { name: 'Vercel', href: 'https://vercel.com', what: 'Website and API hosting.' },
  { name: 'Cloudflare Turnstile', href: 'https://www.cloudflare.com/products/turnstile/', what: 'Privacy-preserving CAPTCHA on sign-in.' },
  { name: 'jsDelivr', href: 'https://www.jsdelivr.com', what: 'Delivers Swagger UI for the API docs page.' },
];

const SOFTWARE: Credit[] = [
  { name: 'Next.js', href: 'https://nextjs.org', what: 'Web framework', licence: 'MIT' },
  { name: 'React', href: 'https://react.dev', what: 'User interface library', licence: 'MIT' },
  { name: 'Mapbox GL JS', href: 'https://github.com/mapbox/mapbox-gl-js', what: '3D map rendering', licence: 'Mapbox Terms of Service' },
  { name: 'Tailwind CSS', href: 'https://tailwindcss.com', what: 'Styling', licence: 'MIT' },
  { name: 'supabase-js and @supabase/ssr', href: 'https://github.com/supabase/supabase-js', what: 'Sign-in and sessions', licence: 'MIT' },
  { name: 'node-postgres (pg)', href: 'https://node-postgres.com', what: 'Database client', licence: 'MIT' },
  { name: 'PostgreSQL', href: 'https://www.postgresql.org', what: 'Database', licence: 'PostgreSQL Licence' },
  { name: 'PostGIS', href: 'https://postgis.net', what: 'Building geometry, nearest-building search and vector tiles', licence: 'GPL-2.0 (runs on the database server)' },
  { name: 'Swagger UI', href: 'https://swagger.io/tools/swagger-ui/', what: 'Interactive API documentation', licence: 'Apache-2.0' },
  { name: 'Playwright and Vitest', href: 'https://playwright.dev', what: 'Automated testing (development only)', licence: 'Apache-2.0 / MIT' },
];

export default function CreditsPage() {
  return (
    <div className="min-h-dvh bg-[#0b0f14] text-slate-300">
      <header className="border-b border-white/5">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-semibold text-white">
            <span aria-hidden className="h-3 w-3 rounded-sm bg-[#39FF14]" />
            TMTechEasy Gate
          </Link>
          <Link href="/map" className="text-sm text-slate-400 hover:text-white">
            Open the map
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-10 px-4 py-10 sm:px-6">
        <div>
          <h1 className="text-3xl font-bold text-white">Credits &amp; attributions</h1>
          <p className="mt-3">
            TMTechEasy Gate is an idea by{' '}
            <a href={ORG.website} target="_blank" rel="noopener" className="text-[#39FF14] underline">
              {ORG.name}
            </a>{' '}
            (CEO: {ORG.ceo}), built on open data, open-source software and the services below. Thank you to everyone behind
            them.
          </p>
        </div>

        <CreditList title="Data" items={DATA}>
          <p className="mt-3 rounded-lg border border-white/10 bg-slate-900/60 p-3 text-sm">
            <strong className="text-slate-100">OpenStreetMap licence:</strong> the building data this platform serves (lookups,
            vector tiles and the API) is derived from OpenStreetMap, © OpenStreetMap contributors, and is available under the{' '}
            <a href="https://opendatacommons.org/licenses/odbl/1-0/" target="_blank" rel="noopener noreferrer" className="text-[#39FF14] underline">
              Open Database License
            </a>
            . To request a copy of the derived building database, email{' '}
            <a href={`mailto:${CONTACT.support}`} className="text-[#39FF14] underline">
              {CONTACT.support}
            </a>
            . Found a mistake on the map?{' '}
            <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer" className="text-[#39FF14] underline">
              Fix it in OpenStreetMap
            </a>{' '}
            or{' '}
            <a href="https://www.mapbox.com/map-feedback/" target="_blank" rel="noopener noreferrer" className="text-[#39FF14] underline">
              tell Mapbox
            </a>
            .
          </p>
        </CreditList>

        <CreditList title="Services" items={SERVICES} />
        <CreditList title="Open-source and third-party software" items={SOFTWARE} />

        <section>
          <h2 className="text-xl font-semibold text-white">Other</h2>
          <ul className="mt-3 list-disc space-y-1.5 pl-5">
            <li>Emoji (🚑 🚒 🚓 📦) are drawn by your device’s own emoji font.</li>
            <li>The TMTechEasy Gate logo, app icons and landing-page screenshots are original work for this project.</li>
            <li>“112” is Nigeria’s toll-free national emergency number; this platform is not connected to it.</li>
            <li>
              Product names and logos belong to their owners; their mention doesn’t imply endorsement of TMTechEasy Gate.
            </li>
          </ul>
        </section>
      </main>

      <SiteFooter />
    </div>
  );
}

function CreditList({ title, items, children }: { title: string; items: Credit[]; children?: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xl font-semibold text-white">{title}</h2>
      <ul className="mt-3 divide-y divide-white/5 rounded-xl border border-white/10 bg-slate-900/40">
        {items.map((c) => (
          <li key={c.name} className="px-4 py-3">
            <a href={c.href} target="_blank" rel="noopener noreferrer" className="font-medium text-slate-100 underline-offset-2 hover:underline">
              {c.name}
            </a>
            <p className="mt-0.5 text-sm text-slate-400">{c.what}</p>
            {c.licence && <p className="mt-0.5 text-xs text-slate-500">Licence: {c.licence}</p>}
          </li>
        ))}
      </ul>
      {children}
    </section>
  );
}
