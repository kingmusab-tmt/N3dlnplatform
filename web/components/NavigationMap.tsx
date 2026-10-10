'use client';

import type { GeoJSONSource, Map as MapboxMap, Marker } from 'mapbox-gl';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { normalizePostcode, type NavigateResponse, type Verification } from '@/lib/postcode';

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
const NEON_GREEN = '#39FF14';
const TARGET_SOURCE = 'target-building';
const DEFAULT_HEIGHT_M = 10;

// Wuse 2, Abuja — the MVP pilot area.
const INITIAL_VIEW = { center: [7.4789, 9.0777] as [number, number], zoom: 15.5, pitch: 45, bearing: -17.6 };

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'found'; result: NavigateResponse };

export default function NavigationMap() {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const mapReady = useRef<Promise<MapboxMap> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  // ---- Map initialisation ---------------------------------------------------
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    let cancelled = false;

    mapReady.current = import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current!,
        style: 'mapbox://styles/mapbox/dark-v11',
        antialias: true,
        ...INITIAL_VIEW,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
      mapRef.current = map;

      return new Promise<MapboxMap>((resolve) => {
        map.on('style.load', () => {
          if (cancelled) return;
          addBuildingLayers(map);
          resolve(map);
        });
      });
    });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      markerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // ---- Search ---------------------------------------------------------------
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const code = normalizePostcode(query);
    if (!code) {
      setStatus({ kind: 'error', message: 'Enter an 11-character NIPOST code, e.g. FC 02 A09 DB 09.' });
      return;
    }

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: 'loading' });

    try {
      const res = await fetch(`/api/v1/navigate/${encodeURIComponent(code)}`, { signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.message ?? `Lookup failed (HTTP ${res.status}).`);
      }

      const result = body as NavigateResponse;
      setStatus({ kind: 'found', result });

      const map = await mapReady.current;
      if (map && !controller.signal.aborted) await showBuilding(map, result);
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Lookup failed.' });
    }
  }

  async function showBuilding(map: MapboxMap, result: NavigateResponse) {
    (map.getSource(TARGET_SOURCE) as GeoJSONSource).setData(
      result.building ?? { type: 'FeatureCollection', features: [] },
    );

    const { default: mapboxgl } = await import('mapbox-gl');
    markerRef.current?.remove();
    markerRef.current = new mapboxgl.Marker({ element: createPinElement(), anchor: 'bottom' })
      .setLngLat(result.center)
      .addTo(map);

    map.flyTo({
      center: result.center,
      zoom: 18.2,
      pitch: 60,
      bearing: -20,
      speed: 0.9,
      curve: 1.5,
      essential: true, // still animate for users with prefers-reduced-motion
    });
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="absolute inset-0" />

      {!MAPBOX_TOKEN && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-slate-300">
          <p>
            Set <code className="text-[#39FF14]">NEXT_PUBLIC_MAPBOX_TOKEN</code> in <code>web/.env.local</code> to
            load the map.
          </p>
        </div>
      )}

      <div className="absolute left-4 right-4 top-4 sm:right-auto sm:w-[420px]">
        <form
          onSubmit={handleSubmit}
          className="flex gap-2 rounded-xl border border-white/10 bg-slate-900/85 p-2 shadow-2xl backdrop-blur"
        >
          <label htmlFor="nipost-code" className="sr-only">
            NIPOST postcode
          </label>
          <input
            id="nipost-code"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="FC 02 A09 DB 09"
            autoComplete="off"
            spellCheck={false}
            maxLength={24}
            className="min-w-0 flex-1 rounded-lg bg-slate-800 px-3 py-2 font-mono uppercase tracking-wider text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
          />
          <button
            type="submit"
            disabled={status.kind === 'loading'}
            className="rounded-lg bg-[#39FF14] px-4 py-2 font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
          >
            {status.kind === 'loading' ? 'Locating…' : 'Locate'}
          </button>
        </form>

        {status.kind === 'error' && (
          <p role="alert" className="mt-2 rounded-lg bg-red-950/90 px-3 py-2 text-sm text-red-200">
            {status.message}
          </p>
        )}

        {status.kind === 'found' && <ResultCard result={status.result} />}
      </div>
    </div>
  );
}

const VERIFICATION_BADGES: Record<Verification['status'], { label: string; className: string }> = {
  verified: { label: 'Verified by NIPOST', className: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30' },
  unregistered: { label: 'Not a NIPOST-registered code', className: 'bg-amber-500/15 text-amber-300 ring-amber-400/30' },
  not_in_sandbox: { label: 'Not in NIPOST test data', className: 'bg-slate-500/15 text-slate-300 ring-slate-400/30' },
  unavailable: { label: 'NIPOST check unavailable', className: 'bg-slate-500/15 text-slate-300 ring-slate-400/30' },
  not_configured: { label: 'Not checked with NIPOST', className: 'bg-slate-500/15 text-slate-400 ring-slate-400/20' },
};

function VerificationBadge({ verification }: { verification: Verification }) {
  const badge = VERIFICATION_BADGES[verification.status];
  return (
    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${badge.className}`}>
      {badge.label}
    </span>
  );
}

function ResultCard({ result }: { result: NavigateResponse }) {
  const props: Record<string, unknown> = result.building?.properties ?? {};
  const name = typeof props.name === 'string' ? props.name : null;
  const type = typeof props.building_type === 'string' ? props.building_type.replace('_', ' ') : null;
  const [lng, lat] = result.center;

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-slate-900/85 p-4 text-sm shadow-2xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-lg tracking-widest text-[#39FF14]">{result.formatted}</p>
        <VerificationBadge verification={result.verification} />
      </div>
      {name && <p className="mt-1 font-medium">{name}</p>}
      {!result.building && (
        <p className="mt-1 text-amber-300">Location from NIPOST; no building footprint mapped here yet.</p>
      )}
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-slate-300">
        {type && (
          <>
            <dt className="text-slate-500">Type</dt>
            <dd className="capitalize">{type}</dd>
          </>
        )}
        <dt className="text-slate-500">Centre</dt>
        <dd className="font-mono">
          {lat.toFixed(6)}, {lng.toFixed(6)}
        </dd>
      </dl>
    </div>
  );
}

// ---- Map helpers ------------------------------------------------------------

function addBuildingLayers(map: MapboxMap) {
  // Insert 3D buildings beneath the first symbol layer so labels stay on top.
  const labelLayerId = map.getStyle().layers?.find(
    (l) => l.type === 'symbol' && (l.layout as Record<string, unknown> | undefined)?.['text-field'],
  )?.id;

  // Generic Mapbox building extrusions for neighbourhood context.
  if (!map.getLayer('3d-buildings')) {
    map.addLayer(
      {
        id: '3d-buildings',
        source: 'composite',
        'source-layer': 'building',
        filter: ['==', 'extrude', 'true'],
        type: 'fill-extrusion',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': '#2a3340',
          'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.05, ['get', 'height']],
          'fill-extrusion-base': ['interpolate', ['linear'], ['zoom'], 14, 0, 15.05, ['get', 'min_height']],
          'fill-extrusion-opacity': 0.75,
        },
      },
      labelLayerId,
    );
  }

  // The resolved delivery target, filled in on each successful lookup.
  map.addSource(TARGET_SOURCE, {
    type: 'geojson',
    data: { type: 'FeatureCollection', features: [] },
  });

  map.addLayer({
    id: 'target-building-glow',
    type: 'line',
    source: TARGET_SOURCE,
    paint: { 'line-color': NEON_GREEN, 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.6 },
  });

  map.addLayer({
    id: 'target-building-extrusion',
    type: 'fill-extrusion',
    source: TARGET_SOURCE,
    paint: {
      'fill-extrusion-color': NEON_GREEN,
      'fill-extrusion-height': ['coalesce', ['get', 'height_m'], DEFAULT_HEIGHT_M],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.85,
      'fill-extrusion-emissive-strength': 1,
    },
  });

  map.addLayer({
    id: 'target-building-outline',
    type: 'line',
    source: TARGET_SOURCE,
    paint: { 'line-color': NEON_GREEN, 'line-width': 2.5 },
  });
}

function createPinElement() {
  const el = document.createElement('div');
  el.setAttribute('aria-label', 'Delivery point');
  el.style.cssText = `
    width: 18px; height: 18px; border-radius: 50% 50% 50% 0;
    background: ${NEON_GREEN}; transform: rotate(-45deg);
    box-shadow: 0 0 14px ${NEON_GREEN}; border: 2px solid #0b0f14;
  `;
  return el;
}
