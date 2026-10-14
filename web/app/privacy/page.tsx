import type { Metadata } from 'next';
import Link from 'next/link';
import SiteFooter from '@/components/SiteFooter';
import { CONTACT, ORG } from '@/lib/site';

export const metadata: Metadata = {
  title: 'Privacy notice · TMTechEasy Gate',
  description: 'What TMTechEasy Gate collects, why, who it is shared with, how long it is kept, and your rights.',
};

const UPDATED = '11 October 2026';

const SECTIONS = [
  ['who', 'Who we are'],
  ['summary', 'The short version'],
  ['collect', 'What we collect and why'],
  ['device', 'Cookies and storage on your device'],
  ['location', 'Your location'],
  ['sharing', 'Who else processes data'],
  ['transfers', 'Where data is stored'],
  ['retention', 'How long we keep it'],
  ['rights', 'Your rights'],
  ['security', 'How we protect it'],
  ['children', 'Children'],
  ['emergency', 'Emergencies'],
  ['changes', 'Changes and contact'],
] as const;

export default function PrivacyPage() {
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

      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <h1 className="text-3xl font-bold text-white">Privacy notice</h1>
        <p className="mt-2 text-sm text-slate-400">Last updated {UPDATED}</p>

        <nav aria-label="On this page" className="mt-6 rounded-xl border border-white/10 bg-slate-900/60 p-4 text-sm">
          <p className="font-medium text-slate-200">On this page</p>
          <ol className="mt-2 grid gap-1 sm:grid-cols-2">
            {SECTIONS.map(([id, title]) => (
              <li key={id}>
                <a href={`#${id}`} className="text-slate-400 underline-offset-2 hover:text-white hover:underline">
                  {title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="mt-8 space-y-10">
          <Section id="who" title="Who we are">
            <p>
              TMTechEasy Gate is a minimum viable product (MVP), an idea by <strong>{ORG.name}</strong> ({ORG.websiteLabel}), which
              decides how and why the personal data described here is used (the “data controller” under the Nigeria Data
              Protection Act 2023, “NDPA”). It turns Nigerian digital postcodes into buildings on a 3D map, with directions to
              the right gate for delivery riders and emergency responders.
            </p>
            <p>
              It is a pilot: buildings in the pilot area carry <em>simulated</em> postcodes, and the service is not operated by
              or affiliated with NIPOST.
            </p>
          </Section>

          <Section id="summary" title="The short version">
            <ul>
              <li>You can use the map and directions without an account.</li>
              <li>We count visits anonymously, with no cookies, no IP addresses and no advertising trackers.</li>
              <li>
                If you sign in, we keep your email address (or phone number) and the places you save. You can delete your account
                at any time from <Link href="/account">My places</Link>.
              </li>
              <li>
                Anything you put on a place (label, notes, gate) can be seen by anyone you give its share link to.
              </li>
              <li>Your GPS position stays on your phone, except when you ask for a route or are on a delivery run.</li>
              <li>We never sell personal data.</li>
            </ul>
          </Section>

          <Section id="collect" title="What we collect and why">
            <h3>Searching and directions (everyone)</h3>
            <p>
              Postcodes you search and buildings you tap are looked up on our servers and checked against NIPOST’s postcode
              service. When you ask for a route, your starting point (coordinates) is sent to our server and on to Mapbox to
              calculate it. We don’t store searches or routes against you.
            </p>

            <h3>Your account (if you sign in)</h3>
            <p>
              Your <strong>email address</strong> (or phone number, where phone sign-in is offered), when the account was created,
              and when you last signed in. Sign-in uses a one-time code instead of a password. Our authentication provider,
              Supabase, also records the IP address and browser used to sign in, for security. <em>Why:</em> to give you an
              account and keep it secure (performance of our service to you, and our legitimate interest in preventing abuse).
            </p>

            <h3>Places you claim</h3>
            <p>
              The building, a label (e.g. “Flat 3B”), optional notes for riders and responders, and optionally a gate position.
              Each place gets a share link (<code>/h/…</code>). <strong>Anyone with that link can see the place, its label,
              notes and gate</strong>; the pages are hidden from search engines, and you can revoke a link and issue a new one in
              My places. <em>Why:</em> this is the service you asked for.
            </p>

            <h3>Delivery runs (riders, dispatch companies and their customers)</h3>
            <ul>
              <li>
                <strong>Stops:</strong> the buildings to deliver to, and a recipient name or delivery code if the dispatch
                company provides one.
              </li>
              <li>
                <strong>Rider position:</strong> while a run is active, the rider’s phone sends its position about every 10
                seconds. We keep only the latest position, heading and estimated arrival time, and show them on the tracking
                link of the customer whose stop is next. Customers further down the list don’t see the rider.
              </li>
              <li>
                <strong>Proof of delivery:</strong> the time, the name of whoever received it (optional), and a photo if one is
                taken. The photo is shrunk on the phone first and can be seen by anyone with that stop’s tracking link.
              </li>
            </ul>
            <p>
              <em>Why:</em> to provide the delivery service on behalf of the dispatch company, which is responsible for the
              customer relationship.
            </p>

            <h3>Anonymous visit statistics</h3>
            <p>
              To know how many people use the site and for how long, your browser keeps a random visitor number and visit number
              and sends us: the pages you open (without anything after “?” in the address, and with private link codes removed),
              how long the page was open and visible, the website that sent you (its name only, e.g. “google.com”), whether
              you’re on a phone, tablet or computer, and your country as reported by our hosting provider. We don’t store IP
              addresses, names or cookies for this, and we can’t tell who you are from it.{' '}
              <strong>
                If your browser sends “Do Not Track” or “Global Privacy Control”, nothing is recorded.
              </strong>{' '}
              Admin pages aren’t counted. <em>Why:</em> our legitimate interest in understanding and improving the service.
            </p>

            <h3>Abuse prevention</h3>
            <p>
              To stop automated abuse we count requests per IP address for short windows; these counters are deleted after about
              two hours. If CAPTCHA is turned on for sign-in, Cloudflare Turnstile checks that you’re a person (see below).
            </p>

            <h3>Partners using our API</h3>
            <p>
              Businesses get an API key. We store only a scrambled (hashed) form of it, its name, rate limit and when it was last
              used.
            </p>
          </Section>

          <Section id="device" title="Cookies and storage on your device">
            <ul>
              <li>
                <strong>Sign-in cookies</strong> (<code>sb-…-auth-token</code>), only when you sign in. They are strictly
                necessary to keep you signed in, and end when you sign out.
              </li>
              <li>
                <strong>Local storage</strong> in your browser: your map choice (3D or Lite), the anonymous visit numbers above,
                and, on the Navigator, delivery proofs waiting to upload when you’re offline.
              </li>
              <li>
                <strong>Offline copies:</strong> the installable app saves the Navigator page, the app’s code and map tiles of
                buildings you viewed, so it works with a weak signal. Admin pages are never saved.
              </li>
            </ul>
            <p>
              We use no advertising or cross-site tracking cookies. You can clear all of this in your browser’s settings at any
              time.
            </p>
          </Section>

          <Section id="location" title="Your location">
            <p>
              The map and Navigator ask your browser for permission before using GPS. Your position is used on your phone to
              follow you on the map and detect arrival. It is sent to us only (1) as the starting point when you ask for a
              route, and (2) during a delivery run, as described above. You can turn location access off in your browser or
              phone settings at any time; the map still works without it.
            </p>
          </Section>

          <Section id="sharing" title="Who else processes data">
            <p>We don’t sell or rent personal data. These service providers process it for us, under their own terms:</p>
            <ul>
              <li>
                <strong>Supabase</strong>: our database and sign-in service (hosted in Frankfurt, Germany).
              </li>
              <li>
                <strong>Vercel</strong>: hosts the website. Like any web host it briefly keeps request logs, which include IP
                addresses and page addresses.
              </li>
              <li>
                <strong>Mapbox</strong>: the map and route calculations. Your browser downloads map images directly from
                Mapbox, so Mapbox sees your IP address and the area you’re viewing, and its map library sends Mapbox anonymous
                usage information.
              </li>
              <li>
                <strong>NIPOST</strong> (Nigerian Postal Service): postcodes you search are checked against its Digital
                Postcode service.
              </li>
              <li>
                <strong>Our email provider</strong>: delivers your sign-in codes.
              </li>
              <li>
                <strong>Cloudflare Turnstile</strong>, when CAPTCHA is on: checks browser signals and your IP address to tell
                people from bots.
              </li>
              <li>
                <strong>WhatsApp</strong> and other apps, only when you choose to share a link with them.
              </li>
            </ul>
            <p>We may also disclose data if the law requires it, for example to a court or regulator.</p>
          </Section>

          <Section id="transfers" title="Where data is stored">
            <p>
              Our database is in the European Union (Germany), and some providers (Vercel, Mapbox, Cloudflare) are based in the
              United States. Data therefore leaves Nigeria; we rely on providers with recognised security standards and
              contractual safeguards, as the NDPA requires for transfers abroad.
            </p>
          </Section>

          <Section id="retention" title="How long we keep it">
            <ul>
              <li>
                <strong>Account and places:</strong> until you delete them (places one by one, or everything by deleting your
                account).
              </li>
              <li>
                <strong>Delivery runs, photos and positions:</strong> kept while the pilot runs, so dispatch companies and
                customers can check past deliveries. Only the rider’s latest position is ever stored.
              </li>
              <li>
                <strong>Anonymous visit statistics:</strong> until our administrators delete them; they regularly clear old
                visit data.
              </li>
              <li>
                <strong>Abuse-prevention counters:</strong> about two hours.
              </li>
              <li>
                <strong>Hosting and sign-in security logs:</strong> as set by Vercel and Supabase, typically days to weeks.
              </li>
            </ul>
          </Section>

          <Section id="rights" title="Your rights">
            <p>Under the NDPA you can ask us to:</p>
            <ul>
              <li>tell you what personal data we hold about you and give you a copy;</li>
              <li>correct it;</li>
              <li>
                delete it. You can do this yourself: <Link href="/account">My places</Link> → <em>Delete my account</em>;
              </li>
              <li>stop or limit using it, or object to how we use it;</li>
              <li>move it to another service in a common format;</li>
              <li>withdraw any consent you gave, at any time.</li>
            </ul>
            <p>
              We reply within one month. If you’re unhappy with our answer, you can complain to the{' '}
              <a href="https://ndpc.gov.ng" target="_blank" rel="noopener noreferrer">
                Nigeria Data Protection Commission (NDPC)
              </a>
              .
            </p>
          </Section>

          <Section id="security" title="How we protect it">
            <ul>
              <li>All traffic is encrypted (HTTPS), including to our database.</li>
              <li>Sign-in uses one-time codes; we never store passwords.</li>
              <li>API keys and rider tokens are stored only in scrambled (hashed) form.</li>
              <li>
                Personal tables are closed to direct public access; only our server reads them, and only admins can open the
                admin area.
              </li>
              <li>Share and tracking links use long random codes and are hidden from search engines.</li>
            </ul>
            <p>No system is perfectly secure. If a breach puts you at risk, we’ll tell you and the NDPC as the law requires.</p>
          </Section>

          <Section id="children" title="Children">
            <p>
              The service is for adults. Children under 18 shouldn’t create an account without a parent’s or guardian’s
              consent.
            </p>
          </Section>

          <Section id="emergency" title="Emergencies">
            <p>
              TMTechEasy Gate gives directions only. It does not contact, alert or dispatch emergency services, and it doesn’t
              pass your data to them. <strong>In an emergency, call 112.</strong> If you share a place link with responders,
              they see what anyone with the link sees.
            </p>
          </Section>

          <Section id="changes" title="Changes and contact">
            <p>
              We’ll update this notice when the service changes, and change the date at the top. Significant changes will be
              shown on the website.
            </p>
            <p>
              Questions or requests about your data: {ORG.name},{' '}
              <a href={`mailto:${CONTACT.support}`}>{CONTACT.support}</a>, or call{' '}
              {CONTACT.phones.map((phone, i) => (
                <span key={phone.e164}>
                  {i > 0 && ' or '}
                  <a href={`tel:${phone.e164}`}>{phone.display}</a>
                </span>
              ))}
              . Website: <a href={ORG.website}>{ORG.websiteLabel}</a>.
            </p>
          </Section>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-6">
      <h2 id={`${id}-title`} className="text-xl font-semibold text-white">
        {title}
      </h2>
      <div className="mt-3 space-y-3 leading-relaxed [&_a]:text-[#39FF14] [&_a]:underline [&_code]:rounded [&_code]:bg-slate-800 [&_code]:px-1 [&_code]:text-sm [&_h3]:mt-5 [&_h3]:font-semibold [&_h3]:text-slate-100 [&_li]:ml-5 [&_li]:list-disc [&_li]:pl-1 [&_strong]:text-slate-100 [&_ul]:space-y-1.5">
        {children}
      </div>
    </section>
  );
}
