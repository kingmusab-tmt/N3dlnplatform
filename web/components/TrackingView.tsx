'use client';

import type { Map as MapboxMap, Marker } from 'mapbox-gl';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import MapModeToggle from '@/components/MapModeToggle';
import { boundsOf, type LngLat } from '@/lib/geo';
import {
  MAPBOX_TOKEN,
  baseMapOptions,
  buildingCamera,
  createGateElement,
  createPinElement,
  mapModeOf,
  setHighlightedBuilding,
  setupScene,
  startPulse,
} from '@/lib/map';
import { resolveMapMode } from '@/lib/mapMode';
import type { NavigateResponse, RouteProfile } from '@/lib/postcode';
import { createVehicleMarker, type VehicleMarker } from '@/lib/vehicles';

export type Tracking = NavigateResponse & {
  destination: { point: LngLat; kind: 'gate' | 'center'; source: string };
  delivery: {
    status: 'pending' | 'en_route' | 'arrived' | 'delivered' | 'failed';
    stop_index: number;
    stops_total: number;
    stops_before: number;
    recipient_name: string | null;
    eta_s: number | null;
    remaining_m: number | null;
    delivered_at: string | null;
    received_by: string | null;
    pod_method: string | null;
    has_photo: boolean;
  };
  rider: { position: LngLat; heading: number | null; updated_at: string; profile: RouteProfile } | null;
};

const POLL_MS = 5_000;
const FINISHED = ['delivered', 'failed'];

/** The customer's live view of a delivery (/t/<token>). */
export default function TrackingView({ token, initial }: { token: string; initial: Tracking }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapReady = useRef<Promise<MapboxMap> | null>(null);
  const riderRef = useRef<VehicleMarker | null>(null);
  const framedRider = useRef(false);
  const [data, setData] = useState(initial);
  const [now, setNow] = useState(() => Date.now());

  // ---- Map ----
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    let map: MapboxMap | null = null;
    let cancelled = false;
    let stopPulse = () => {};

    mapReady.current = import('mapbox-gl').then(({ default: mapboxgl }) => {
      if (cancelled) return new Promise<MapboxMap>(() => {});
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const { mode } = resolveMapMode();
      map = new mapboxgl.Map({
        container: containerRef.current!,
        ...baseMapOptions('dusk', mode),
        ...buildingCamera(initial.center, mode),
        zoom: 16.5,
      });
      const phone = window.innerWidth < 640;
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), phone ? 'top-right' : 'bottom-right');
      return new Promise<MapboxMap>((resolve) => {
        map!.on('style.load', () => {
          if (!map) return;
          setupScene(map, mode);
          setHighlightedBuilding(map, initial);
          stopPulse = startPulse(map);
          const destEl = initial.destination.source === 'claim' ? createGateElement() : createPinElement();
          new mapboxgl.Marker({ element: destEl, anchor: initial.destination.source === 'claim' ? 'center' : 'bottom' })
            .setLngLat(initial.destination.point)
            .addTo(map);
          resolve(map);
        });
      });
    });

    return () => {
      cancelled = true;
      stopPulse();
      map?.remove();
    };
  }, [initial]);

  // ---- Live updates ----
  useEffect(() => {
    if (FINISHED.includes(data.delivery.status)) return;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      if (document.visibilityState === 'visible') {
        try {
          const res = await fetch(`/api/v1/track/${token}`, { cache: 'no-store' });
          if (res.ok) setData(await res.json());
        } catch {
          // Offline or flaky: try again next tick.
        }
      }
      if (!stopped) timer = setTimeout(poll, POLL_MS);
    };
    timer = setTimeout(poll, POLL_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [token, data.delivery.status]);

  // Move the rider marker (and frame rider + destination once).
  useEffect(() => {
    void (async () => {
      const map = await mapReady.current;
      if (!map) return;
      const rider = data.rider;
      if (!rider) {
        riderRef.current?.marker.remove();
        return;
      }
      const { default: mapboxgl } = await import('mapbox-gl');
      if (riderRef.current?.profile !== rider.profile) {
        riderRef.current?.marker.remove();
        riderRef.current = createVehicleMarker(mapboxgl, rider.profile);
      }
      riderRef.current.marker.setLngLat(rider.position).addTo(map);
      if (rider.heading != null) riderRef.current.setHeading(rider.heading);
      if (!framedRider.current) {
        framedRider.current = true;
        const phone = window.innerWidth < 640;
        map.fitBounds(boundsOf([rider.position, data.destination.point]), {
          padding: phone ? { top: 80, bottom: Math.round(window.innerHeight * 0.5), left: 40, right: 40 } : { top: 80, bottom: 80, left: 460, right: 80 },
          pitch: mapModeOf(map) === 'lite' ? 0 : 45,
          maxZoom: 17,
          duration: 1500,
        });
      }
    })();
  }, [data.rider, data.destination.point]);

  const d = data.delivery;
  const name = typeof data.building?.properties.name === 'string' ? data.building.properties.name : null;
  const updatedAgo = data.rider ? Math.max(0, Math.round((now - Date.parse(data.rider.updated_at)) / 1000)) : null;

  return (
    <div className="relative h-full w-full">
      {/* Inline style: mapbox-gl.css sets .mapboxgl-map { position: relative }, which beats Tailwind's layered utilities. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      <section
        aria-live="polite"
        className="absolute inset-x-4 bottom-4 rounded-xl border border-white/10 bg-slate-900/95 p-4 text-sm shadow-2xl backdrop-blur sm:bottom-auto sm:left-4 sm:right-auto sm:top-4 sm:w-[400px]"
      >
        <p className="text-xs uppercase tracking-wider text-slate-400">Your delivery</p>
        <h1 className="mt-1 text-lg font-semibold text-slate-100">{headline(d)}</h1>
        {d.recipient_name && <p className="text-slate-300">For {d.recipient_name}</p>}

        <ol className="mt-3 grid grid-cols-4 gap-1 text-center text-[11px]" aria-label="Delivery progress">
          {STEPS.map((step, i) => {
            const reached = stepIndex(d.status) >= i;
            return (
              <li key={step} className={reached ? 'text-[#39FF14]' : 'text-slate-500'}>
                <span aria-hidden className={`mx-auto mb-1 block h-1.5 rounded-full ${reached ? 'bg-[#39FF14]' : 'bg-slate-700'}`} />
                {step}
                <span className="sr-only">{reached ? ' (done)' : ''}</span>
              </li>
            );
          })}
        </ol>

        {d.status === 'pending' && d.stops_before > 0 && (
          <p className="mt-3 text-slate-300">
            The rider has {d.stops_before} {d.stops_before === 1 ? 'delivery' : 'deliveries'} before yours. You’ll see them on
            the map when they’re on the way to you.
          </p>
        )}
        {(d.status === 'en_route' || d.status === 'pending') && d.stops_before === 0 && d.eta_s != null && (
          <p className="mt-3 text-2xl font-semibold text-white">
            ~{Math.max(1, Math.round(d.eta_s / 60))} min
            {d.remaining_m != null && <span className="ml-2 text-base font-normal text-slate-400">{formatDistance(d.remaining_m)} away</span>}
          </p>
        )}
        {d.status === 'arrived' && <p className="mt-3 text-slate-200">The rider is at your {data.destination.kind === 'gate' ? 'gate' : 'building'}.</p>}
        {d.status === 'delivered' && (
          <div className="mt-3 space-y-2">
            <p className="text-slate-200">
              Delivered {d.delivered_at ? `at ${new Date(d.delivered_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}
              {d.received_by ? `, received by ${d.received_by}` : ''}.
            </p>
            {d.has_photo && (
              <a href={`/api/v1/track/${token}/photo`} target="_blank" rel="noopener" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/v1/track/${token}/photo`}
                  alt="Photo taken by the rider at delivery"
                  className="max-h-40 rounded-lg border border-white/10 object-cover"
                />
              </a>
            )}
          </div>
        )}
        {d.status === 'failed' && <p className="mt-3 text-amber-300">This delivery wasn’t completed. Please contact the sender.</p>}

        <p className="mt-3 font-mono tracking-widest text-[#39FF14]">{data.formatted}</p>
        {name && <p className="text-slate-400">{name}</p>}
        {updatedAgo != null && !FINISHED.includes(d.status) && (
          <p className="mt-2 text-xs text-slate-400">Rider location updated {updatedAgo < 60 ? `${updatedAgo} s` : `${Math.round(updatedAgo / 60)} min`} ago</p>
        )}

        <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-400">
          <Link href="/" className="underline hover:text-slate-200">
            TMTechEASY Delivery
          </Link>
          <MapModeToggle className="rounded-lg bg-slate-800 p-0.5" />
        </div>
      </section>
    </div>
  );
}

const STEPS = ['Waiting', 'On the way', 'Arriving', 'Delivered'];

function stepIndex(status: Tracking['delivery']['status']) {
  return { pending: 0, en_route: 1, arrived: 2, delivered: 3, failed: -1 }[status];
}

function headline(d: Tracking['delivery']) {
  switch (d.status) {
    case 'pending':
      return d.stops_before > 0 ? 'Your delivery is in the queue' : 'Your rider is getting ready';
    case 'en_route':
      return 'Your rider is on the way';
    case 'arrived':
      return 'Your rider has arrived';
    case 'delivered':
      return 'Delivered';
    default:
      return 'Delivery not completed';
  }
}

function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
