import type { Metadata, Viewport } from 'next';
import Analytics from '@/components/Analytics';
import ServiceWorker from '@/components/ServiceWorker';
import 'mapbox-gl/dist/mapbox-gl.css';
import './globals.css';

export const metadata: Metadata = {
  // Share-link preview cards need absolute URLs; set SITE_URL when deployed.
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: 'TMTechEasy Gate',
  description: 'Resolve a Nigerian digital postcode to its exact 3D building and gate, with directions for emergency responders and delivery riders.',
};

export const viewport: Viewport = { themeColor: '#0b0f14' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-100">
        {children}
        <ServiceWorker />
        <Analytics />
      </body>
    </html>
  );
}
