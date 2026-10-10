import type { Metadata } from 'next';
import 'mapbox-gl/dist/mapbox-gl.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'NIPOST 3D Navigator',
  description: 'Resolve a Nigerian digital postcode to its exact 3D building footprint.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="antialiased text-slate-100">{children}</body>
    </html>
  );
}
