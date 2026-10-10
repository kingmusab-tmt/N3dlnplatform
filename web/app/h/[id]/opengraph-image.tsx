import { ImageResponse } from 'next/og';
import { fetchSharedPlace } from '@/lib/api';

// The "digital card" shown when a share link is pasted into WhatsApp, X, etc.
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Delivery location card';

export default async function OpenGraphImage({ params }: { params: Promise<{ id: string }> }) {
  const place = await fetchSharedPlace((await params).id);
  const label = place?.claim.label ?? 'Link not found';
  const code = place?.formatted ?? '';
  const name = typeof place?.building?.properties.name === 'string' ? place.building.properties.name : '';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: 72,
          background: '#0b0f14',
          color: '#e2e8f0',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', fontSize: 30, color: '#64748b', letterSpacing: 4 }}>
          TMTECHEASY DELIVERY · SHARED LOCATION
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 64, fontWeight: 700 }}>{label}</div>
          {name && <div style={{ display: 'flex', fontSize: 34, color: '#94a3b8', marginTop: 8 }}>{name}</div>}
        </div>
        <div
          style={{
            display: 'flex',
            fontSize: 104,
            fontFamily: 'monospace',
            letterSpacing: 12,
            color: '#39FF14',
          }}
        >
          {code}
        </div>
      </div>
    ),
    size,
  );
}
