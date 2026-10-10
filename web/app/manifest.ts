import type { MetadataRoute } from 'next';

// Installable app ("Add to Home screen"): opens straight into the Navigator.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TMTechEASY Delivery',
    short_name: 'TMTechEASY',
    description: 'Every address, in 3D, down to the gate. Navigation for delivery riders and emergency responders.',
    start_url: '/rider',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0b0f14',
    theme_color: '#0b0f14',
    categories: ['navigation', 'business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Navigator', url: '/rider', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Emergency navigator', url: '/rider?for=ambulance', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'My places', url: '/account', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
