import type { Metadata } from 'next';
import 'mapbox-gl/dist/mapbox-gl.css';
import './globals.css';

export const metadata: Metadata = {
  // Share-link preview cards need absolute URLs; set SITE_URL when deployed.
  metadataBase: new URL(process.env.SITE_URL ?? 'http://localhost:3000'),
  title: 'TMTechEASY Delivery',
  description: 'Resolve a Nigerian digital postcode to its exact 3D building footprint.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-100">{children}</body>
    </html>
  );
}
