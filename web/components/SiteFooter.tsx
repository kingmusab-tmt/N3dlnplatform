import Link from 'next/link';
import { CONTACT, ORG } from '@/lib/site';

/** The site-wide footer: credit, contact details, links and attributions. */
export default function SiteFooter() {
  return (
    <footer className="border-t border-white/5 bg-[#0b0f14]">
      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 text-sm text-slate-400 sm:px-6 md:grid-cols-[1.3fr_1fr_1fr]">
        <div>
          <p className="flex items-center gap-2 font-semibold text-slate-200">
            <span aria-hidden className="h-2.5 w-2.5 rounded-sm bg-[#39FF14]" />
            TMTechEasy Gate
          </p>
          <p className="mt-3 text-slate-300">
            IDEA by{' '}
            <a href={ORG.website} target="_blank" rel="noopener" className="font-medium text-slate-100 underline-offset-2 hover:underline">
              {ORG.name}
            </a>{' '}
            <span className="text-slate-500">({ORG.websiteLabel})</span>
          </p>
          <p className="mt-1 text-slate-300">CEO: {ORG.ceo}</p>
          <p className="mt-4 text-xs leading-relaxed text-slate-500">
            An independent MVP built on Nigeria’s National Digital Postcode system; not operated by or affiliated with
            NIPOST. Pilot postcodes are simulated, and places are submitted by users and unverified. Directions only: in an
            emergency, call 112.
          </p>
        </div>

        <div>
          <h2 className="font-semibold text-slate-200">Contact information</h2>
          <ul className="mt-3 space-y-1.5">
            {CONTACT.emails.map((email) => (
              <li key={email}>
                <a href={`mailto:${email}`} className="break-all hover:text-slate-200">
                  {email}
                </a>
              </li>
            ))}
            {CONTACT.phones.map((phone) => (
              <li key={phone.e164}>
                <a href={`tel:${phone.e164}`} className="hover:text-slate-200">
                  {phone.display}
                </a>
              </li>
            ))}
            <li>
              <a href={ORG.website} target="_blank" rel="noopener" className="hover:text-slate-200">
                {ORG.websiteLabel}
              </a>
            </li>
          </ul>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 content-start gap-x-6 gap-y-1.5">
          <Link href="/map" className="hover:text-slate-200">3D map</Link>
          <Link href="/rider" className="hover:text-slate-200">Navigator</Link>
          <Link href="/rider?for=ambulance" className="hover:text-slate-200">Emergency navigator</Link>
          <Link href="/account" className="hover:text-slate-200">My places</Link>
          <Link href="/login" className="hover:text-slate-200">Sign in</Link>
          <Link href="/api/v1/docs" className="hover:text-slate-200">API docs</Link>
          <Link href="/privacy" className="hover:text-slate-200">Privacy notice</Link>
          <Link href="/credits" className="hover:text-slate-200">Credits &amp; attributions</Link>
        </nav>
      </div>

      <div className="border-t border-white/5">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-4 text-xs text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between">
          <p>
            © {new Date().getFullYear()} {ORG.name}. All rights reserved.
          </p>
          <p>
            Maps ©{' '}
            <a href="https://www.mapbox.com/about/maps/" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
              Mapbox
            </a>{' '}
            · Map and building data ©{' '}
            <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer" className="underline hover:text-slate-300">
              OpenStreetMap contributors
            </a>{' '}
            (ODbL) · Postcode system: NIPOST ·{' '}
            <Link href="/credits" className="underline hover:text-slate-300">
              All credits
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
