'use client';

import type { Map as MapboxMap } from 'mapbox-gl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import MapModeToggle from '@/components/MapModeToggle';
import ShareButtons from '@/components/ShareButtons';
import { resolveMapMode } from '@/lib/mapMode';
import {
  MAPBOX_TOKEN,
  baseMapOptions,
  buildingCamera,
  createGateElement,
  createPinElement,
  mapModeOf,
  setHighlightedBuilding,
  setupScene,
  startOrbit,
  startPulse,
} from '@/lib/map';
import { destinationOf, googleMapsDirectionsUrl, type SharedPlace } from '@/lib/postcode';

/** The page a rider or relative opens from a shared /h/<id> link. */
export default function SharedPlaceView({ place }: { place: SharedPlace }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [shareUrl, setShareUrl] = useState('');

  useEffect(() => setShareUrl(window.location.href), []);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    let map: MapboxMap | null = null;
    let cancelled = false;
    let stopOrbit = () => {};
    let stopPulse = () => {};

    import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled) return;
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const { mode } = resolveMapMode();
      // Start a little wide, then glide in so the viewer sees the neighbourhood first.
      map = new mapboxgl.Map({
        container: containerRef.current!,
        ...baseMapOptions('dusk', mode),
        center: place.center,
        zoom: 15.5,
        pitch: mode === 'lite' ? 0 : 30,
      });
      // On phones the info card fills the bottom of the screen: keep controls clear of it,
      // and frame the building in the visible area above the card.
      const phone = window.innerWidth < 640;
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), phone ? 'top-right' : 'bottom-right');
      map.on('style.load', () => {
        if (!map) return;
        setupScene(map, mode);
        setHighlightedBuilding(map, place);
        stopPulse = startPulse(map);
        new mapboxgl.Marker({ element: createPinElement(), anchor: 'bottom' }).setLngLat(place.center).addTo(map);
        if (place.claim.gate) {
          new mapboxgl.Marker({ element: createGateElement() }).setLngLat([place.claim.gate.lng, place.claim.gate.lat]).addTo(map);
        }
        map.flyTo({
          ...buildingCamera(place.center, mapModeOf(map)),
          padding: phone ? { top: 0, bottom: Math.round(window.innerHeight * 0.45), left: 0, right: 0 } : undefined,
          speed: 0.6,
          essential: true,
        });
        map.once('moveend', () => {
          if (map) stopOrbit = startOrbit(map);
        });
      });
    });

    return () => {
      cancelled = true;
      stopOrbit();
      stopPulse();
      map?.remove();
    };
  }, [place]);

  const name = typeof place.building?.properties.name === 'string' ? place.building.properties.name : null;
  const shareText = `${place.claim.label}: ${place.formatted}`;

  return (
    <div className="relative h-full w-full">
      {/* Inline style: mapbox-gl.css sets .mapboxgl-map { position: relative }, which beats Tailwind's layered utilities. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      <div className="absolute inset-x-4 bottom-4 sm:bottom-auto sm:left-4 sm:right-auto sm:top-4 sm:w-[400px]">
        <div className="rounded-xl border border-white/10 bg-slate-900/90 p-4 text-sm shadow-2xl backdrop-blur">
          <p className="text-xs uppercase tracking-wider text-slate-500">Delivery location</p>
          <h1 className="mt-1 text-lg font-semibold text-slate-100">{place.claim.label}</h1>
          <p className="font-mono text-xl tracking-widest text-[#39FF14]">{place.formatted}</p>
          {name && <p className="mt-1 text-slate-400">{name}</p>}

          {place.claim.gate && (
            <p className="mt-2 text-xs text-amber-300">
              <span className="mr-1 inline-grid h-4 w-4 place-items-center rounded bg-amber-400 text-[10px] font-bold text-slate-950">
                G
              </span>
              Use the gate marked on the map. Directions lead there.
            </p>
          )}

          {place.claim.delivery_notes && (
            <p className="mt-3 whitespace-pre-line rounded-lg bg-slate-800/80 px-3 py-2 text-slate-200">
              {place.claim.delivery_notes}
            </p>
          )}

          <div className="mt-3 space-y-2">
            {/* Our own navigation: routes to the owner's gate and shows the 3D building on arrival. */}
            <Link
              href={`/rider?code=${place.code}&claim=${place.claim.share_id}`}
              className="block rounded-lg bg-[#39FF14] px-3 py-2 text-center font-semibold text-slate-950 transition hover:brightness-110"
            >
              Directions
            </Link>
            {shareUrl && <ShareButtons url={shareUrl} text={shareText} />}
            <a
              href={googleMapsDirectionsUrl(destinationOf(place))}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center text-xs text-slate-400 underline hover:text-slate-200"
            >
              Open in Google Maps instead
            </a>
          </div>

          <p className="mt-3 text-xs text-slate-500">
            Unverified, owner-submitted details. Code is simulated for the pilot.{' '}
            <Link href="/" className="text-slate-400 underline hover:text-slate-200">
              Find another address
            </Link>
          </p>
          <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
            Map: <MapModeToggle className="rounded-lg bg-slate-800 p-0.5" />
          </div>
        </div>
      </div>
    </div>
  );
}
