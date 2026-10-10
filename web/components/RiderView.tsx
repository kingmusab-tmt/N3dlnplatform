'use client';

import type { GeoJSONSource, Map as MapboxMap, Marker } from 'mapbox-gl';
import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { boundsOf, distanceMetres, measureLine, pointAlong, type LngLat } from '@/lib/geo';
import {
  MAPBOX_TOKEN,
  NEON_GREEN,
  baseMapOptions,
  buildingCamera,
  createPinElement,
  setHighlightedBuilding,
  setupScene,
} from '@/lib/map';
import { normalizePostcode, type NavigateResponse, type RouteProfile, type RouteResponse } from '@/lib/postcode';

const ROUTE_SOURCE = 'rider-route';
const LAST_MILE_SOURCE = 'rider-last-mile';
const EMPTY = { type: 'FeatureCollection' as const, features: [] };

// Mapbox has no motorbike profile; "driving" is the closest match for okada/dispatch bikes.
const PROFILES: { value: RouteProfile; label: string }[] = [
  { value: 'driving', label: 'Motorbike / car' },
  { value: 'cycling', label: 'Bicycle' },
  { value: 'walking', label: 'Walk' },
];

type OriginSource = 'simulated' | 'tapped' | 'gps';
type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' };
type Ride = { kind: 'idle' } | { kind: 'riding'; remaining_m: number } | { kind: 'arrived' };

/** Pretend rider start ~1.5 km north-west of the destination, for demos away from Abuja. */
function simulatedStart([lng, lat]: LngLat): LngLat {
  return [lng - 0.0105, lat + 0.0085];
}

/**
 * @param claimId From a shared link: routes to the gate its owner marked, but
 *   only for the code the link was for, not for later searches.
 */
export default function RiderView({ initialCode, claimId }: { initialCode?: string; claimId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapReady = useRef<Promise<MapboxMap> | null>(null);
  const riderMarker = useRef<Marker | null>(null);
  const destMarker = useRef<Marker | null>(null);
  const animFrame = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const [query, setQuery] = useState(initialCode ?? '');
  const [code, setCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState<LngLat | null>(null);
  const [originSource, setOriginSource] = useState<OriginSource>('simulated');
  const [profile, setProfile] = useState<RouteProfile>('driving');
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [ride, setRide] = useState<Ride>({ kind: 'idle' });

  // ---- Map ------------------------------------------------------------------
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    let map: MapboxMap | null = null;
    let cancelled = false;

    mapReady.current = import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      map = new mapboxgl.Map({
        container: containerRef.current!,
        ...baseMapOptions('dusk'),
        center: [7.4789, 9.0777],
        zoom: 14,
        pitch: 40,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

      return new Promise<MapboxMap>((resolve) => {
        map!.on('style.load', () => {
          if (cancelled || !map) return;
          setupScene(map);
          addRouteLayers(map);
          map.on('click', (e) => mapClickRef.current([e.lngLat.lng, e.lngLat.lat]));
          resolve(map);
        });
      });
    });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      map?.remove();
    };
  }, []);

  // Load the code passed in the URL (?code=…) once.
  useEffect(() => {
    if (initialCode) void planFor(initialCode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Planning -------------------------------------------------------------
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await planFor(query);
  }

  /** Resolve a code, pick a simulated rider start near it, then route. */
  async function planFor(input: string) {
    const normalized = normalizePostcode(input);
    if (!normalized) {
      setStatus({ kind: 'error', message: 'Enter an 11-character NIPOST code, e.g. FC 02 SIM BP 87.' });
      return;
    }
    stopRide();
    setStatus({ kind: 'loading' });
    try {
      const res = await fetch(`/api/v1/navigate/${encodeURIComponent(normalized)}`);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `Lookup failed (HTTP ${res.status}).`);
      const place = body as NavigateResponse;
      if (!place.building) throw new Error('This code has no mapped building to route to yet.');

      const start = simulatedStart(place.center);
      setCode(normalized);
      setQuery(place.formatted);
      setOrigin(start);
      setOriginSource('simulated');
      await fetchRoute(normalized, start, profile);
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Lookup failed.' });
    }
  }

  async function fetchRoute(forCode: string, from: LngLat, withProfile: RouteProfile) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: 'loading' });

    try {
      const claimParam = claimId && initialCode && normalizePostcode(initialCode) === forCode ? `&claim=${encodeURIComponent(claimId)}` : '';
      const url = `/api/v1/navigate/${forCode}/route?from=${from[0].toFixed(6)},${from[1].toFixed(6)}&profile=${withProfile}${claimParam}`;
      const res = await fetch(url, { signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `Routing failed (HTTP ${res.status}).`);

      const result = body as RouteResponse;
      setRoute(result);
      setStatus({ kind: 'ready' });
      const map = await mapReady.current;
      if (map && !controller.signal.aborted) await drawRoute(map, result);
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Routing failed.' });
    }
  }

  async function drawRoute(map: MapboxMap, result: RouteResponse) {
    setHighlightedBuilding(map, result);
    (map.getSource(ROUTE_SOURCE) as GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: result.route.geometry });
    (map.getSource(LAST_MILE_SOURCE) as GeoJSONSource).setData(
      result.lastMile ? { type: 'Feature', properties: {}, geometry: result.lastMile.geometry } : EMPTY,
    );

    const { default: mapboxgl } = await import('mapbox-gl');
    riderMarker.current ??= new mapboxgl.Marker({ element: createRiderElement() });
    riderMarker.current.setLngLat(result.origin).addTo(map);
    destMarker.current ??= new mapboxgl.Marker({ element: createPinElement(), anchor: 'bottom' });
    destMarker.current.setLngLat(result.destination.point).addTo(map);

    fitRoute(map, result);
  }

  function fitRoute(map: MapboxMap, result: RouteResponse) {
    const pts: LngLat[] = [...result.route.geometry.coordinates, result.origin, result.destination.point];
    const mobile = window.innerWidth < 640;
    map.fitBounds(boundsOf(pts), {
      padding: mobile ? { top: 90, bottom: 330, left: 30, right: 30 } : { top: 60, bottom: 60, left: 460, right: 60 },
      pitch: 45,
      bearing: 0,
      duration: 1200,
    });
  }

  // ---- Rider origin ---------------------------------------------------------
  function handleMapClick(point: LngLat) {
    if (!code || ride.kind === 'riding') return;
    setOrigin(point);
    setOriginSource('tapped');
    void fetchRoute(code, point, profile);
  }
  const mapClickRef = useRef(handleMapClick);
  mapClickRef.current = handleMapClick;

  function locateWithGps() {
    if (!code) return;
    if (!navigator.geolocation) {
      setStatus({ kind: 'error', message: 'This browser has no location access.' });
      return;
    }
    setStatus({ kind: 'loading' });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point: LngLat = [pos.coords.longitude, pos.coords.latitude];
        setOrigin(point);
        setOriginSource('gps');
        void fetchRoute(code, point, profile);
      },
      (err) => setStatus({ kind: 'error', message: `Couldn't get your location: ${err.message}` }),
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  function changeProfile(next: RouteProfile) {
    setProfile(next);
    if (code && origin) {
      stopRide();
      void fetchRoute(code, origin, next);
    }
  }

  // ---- Ride simulation ------------------------------------------------------
  async function startRide() {
    const map = await mapReady.current;
    if (!map || !route) return;
    stopRide();

    const coords: LngLat[] = [...route.route.geometry.coordinates];
    if (route.lastMile) coords.push(route.destination.point);
    const line = measureLine(coords);
    const durationMs = Math.min(30_000, Math.max(12_000, line.length * 6));
    const startedAt = performance.now();
    let heading = pointAlong(line, 0).heading;
    let lastUiUpdate = 0;

    const frame = (now: number) => {
      const t = Math.min(1, (now - startedAt) / durationMs);
      const travelled = t * line.length;
      const { point, heading: target } = pointAlong(line, travelled);
      // Ease the camera heading so short zig-zag segments don't make it spin.
      const delta = ((target - heading + 540) % 360) - 180;
      heading = (heading + delta * 0.08 + 360) % 360;

      riderMarker.current?.setLngLat(point);
      map.jumpTo({ center: point, bearing: heading, pitch: 60, zoom: 17.3 });

      if (now - lastUiUpdate > 200) {
        lastUiUpdate = now;
        setRide({ kind: 'riding', remaining_m: Math.round(line.length - travelled) });
      }
      if (t < 1) {
        animFrame.current = requestAnimationFrame(frame);
      } else {
        animFrame.current = null;
        setRide({ kind: 'arrived' });
        map.flyTo({ ...buildingCamera(route.center), speed: 0.8, essential: true });
      }
    };
    setRide({ kind: 'riding', remaining_m: Math.round(line.length) });
    animFrame.current = requestAnimationFrame(frame);
  }

  function stopRide() {
    if (animFrame.current) cancelAnimationFrame(animFrame.current);
    animFrame.current = null;
    setRide({ kind: 'idle' });
  }

  async function resetView() {
    stopRide();
    const map = await mapReady.current;
    if (map && route) {
      riderMarker.current?.setLngLat(route.origin);
      fitRoute(map, route);
    }
  }

  // ---- Render ---------------------------------------------------------------
  const placeName =
    typeof route?.building?.properties.name === 'string' ? route.building.properties.name : route?.formatted;
  const straightLine = route ? distanceMetres(route.origin, route.destination.point) : 0;

  return (
    <div className="relative h-full w-full">
      {/* Inline style: mapbox-gl.css sets .mapboxgl-map { position: relative }, which beats Tailwind's layered utilities. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {!MAPBOX_TOKEN && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-slate-300">
          Set NEXT_PUBLIC_MAPBOX_TOKEN in web/.env.local to load the map.
        </div>
      )}

      {/* Destination search */}
      <form
        onSubmit={handleSubmit}
        className="absolute left-3 right-14 top-3 flex gap-2 rounded-xl border border-white/10 bg-slate-900/90 p-2 shadow-2xl backdrop-blur sm:right-auto sm:w-[400px]"
      >
        <Link href="/" aria-label="Back to search" className="grid place-items-center px-2 text-slate-400 hover:text-slate-100">
          ←
        </Link>
        <label htmlFor="rider-code" className="sr-only">
          Destination postcode
        </label>
        <input
          id="rider-code"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Deliver to… FC 02 SIM BP 87"
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
          className="min-w-0 flex-1 rounded-lg bg-slate-800 px-3 py-2 font-mono uppercase tracking-wider text-slate-100 placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
        />
        <button
          type="submit"
          disabled={status.kind === 'loading'}
          className="rounded-lg bg-[#39FF14] px-3 py-2 font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
        >
          Route
        </button>
      </form>

      {/* Bottom sheet (left panel on desktop) */}
      <section className="absolute inset-x-0 bottom-0 max-h-[55dvh] overflow-y-auto rounded-t-2xl border border-white/10 bg-slate-900/95 p-4 text-sm shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-20 sm:max-h-[calc(100dvh-6rem)] sm:w-[400px] sm:rounded-2xl">
        <p className="text-xs uppercase tracking-wider text-slate-500">Rider view · sandbox</p>

        {status.kind === 'error' && (
          <p role="alert" className="mt-2 rounded-lg bg-red-950/90 px-3 py-2 text-red-200">
            {status.message}
          </p>
        )}

        {!route && status.kind !== 'error' && (
          <p className="mt-2 text-slate-400">
            {status.kind === 'loading'
              ? 'Planning route…'
              : 'Enter a destination code to see how a dispatch rider would be routed to the building.'}
          </p>
        )}

        {route && (
          <>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-3xl font-semibold text-slate-100">{formatDuration(route.route.duration_s)}</span>
              <span className="text-slate-400">{formatDistance(route.route.distance_m)}</span>
              {status.kind === 'loading' && <span className="text-xs text-slate-500">updating…</span>}
            </div>
            <p className="mt-1 text-slate-200">
              to <span className="font-medium">{placeName}</span>{' '}
              <span className="font-mono text-[#39FF14]">{route.formatted}</span>
            </p>
            {route.lastMile && (
              <p className="mt-1 text-xs text-slate-400">
                <span style={{ color: NEON_GREEN }}>┄</span> Last {formatDistance(route.lastMile.distance_m)} on foot from
                the road to the{' '}
                {route.destination.source === 'claim'
                  ? 'gate marked by the owner'
                  : route.destination.kind === 'gate'
                    ? 'gate'
                    : 'building center (no gate mapped)'}
                .
              </p>
            )}

            <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-800 p-1" role="radiogroup" aria-label="Travel mode">
              {PROFILES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  role="radio"
                  aria-checked={profile === p.value}
                  onClick={() => changeProfile(p.value)}
                  disabled={ride.kind === 'riding'}
                  className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                    profile === p.value ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-400">
              <span>
                <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400 align-middle" />
                {originSource === 'gps'
                  ? `Start: your GPS (${formatDistance(Math.round(straightLine))} away)`
                  : originSource === 'tapped'
                    ? 'Start: point you tapped'
                    : 'Start: simulated rider'}
                {ride.kind !== 'riding' && ' · tap map to move'}
              </span>
              <button type="button" onClick={locateWithGps} disabled={ride.kind === 'riding'} className="shrink-0 text-sky-300 hover:text-sky-200 disabled:opacity-50">
                Use my GPS
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              {ride.kind === 'riding' ? (
                <>
                  <div className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-slate-200">
                    {formatDistance(ride.remaining_m)} to go
                  </div>
                  <button type="button" onClick={resetView} className="rounded-lg border border-white/15 px-4 py-2 text-slate-200 hover:bg-white/5">
                    Stop
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={startRide}
                    disabled={status.kind === 'loading'}
                    className="flex-1 rounded-lg bg-[#39FF14] px-3 py-2 font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
                  >
                    {ride.kind === 'arrived' ? 'Arrived ✓ · Replay' : 'Simulate ride'}
                  </button>
                  {ride.kind === 'arrived' && (
                    <button type="button" onClick={resetView} className="rounded-lg border border-white/15 px-4 py-2 text-slate-200 hover:bg-white/5">
                      Overview
                    </button>
                  )}
                </>
              )}
            </div>

            {route.route.steps.length > 0 && (
              <details className="mt-3">
                <summary className="cursor-pointer text-slate-300">Turn-by-turn ({route.route.steps.length} steps)</summary>
                <ol className="mt-2 space-y-1.5 text-slate-300">
                  {route.route.steps.map((s, i) => (
                    <li key={i} className="flex justify-between gap-3">
                      <span>{s.instruction}</span>
                      {s.distance_m > 0 && <span className="shrink-0 text-slate-500">{formatDistance(s.distance_m)}</span>}
                    </li>
                  ))}
                </ol>
              </details>
            )}
          </>
        )}
      </section>
    </div>
  );
}

function addRouteLayers(map: MapboxMap) {
  map.addSource(ROUTE_SOURCE, { type: 'geojson', data: EMPTY });
  map.addSource(LAST_MILE_SOURCE, { type: 'geojson', data: EMPTY });

  map.addLayer({
    id: 'rider-route-casing',
    type: 'line',
    source: ROUTE_SOURCE,
    slot: 'middle',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#0c4a6e', 'line-width': 10, 'line-emissive-strength': 1 },
  });
  map.addLayer({
    id: 'rider-route-line',
    type: 'line',
    source: ROUTE_SOURCE,
    slot: 'middle',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': '#38bdf8', 'line-width': 5, 'line-emissive-strength': 1 },
  });
  map.addLayer({
    id: 'rider-last-mile',
    type: 'line',
    source: LAST_MILE_SOURCE,
    slot: 'middle',
    layout: { 'line-cap': 'round' },
    paint: { 'line-color': NEON_GREEN, 'line-width': 3, 'line-dasharray': [1, 2], 'line-emissive-strength': 1 },
  });
}

function createRiderElement() {
  const el = document.createElement('div');
  el.setAttribute('aria-label', 'Rider');
  el.style.cssText = `
    width: 18px; height: 18px; border-radius: 50%;
    background: #38bdf8; border: 3px solid #fff;
    box-shadow: 0 0 0 6px rgba(56, 189, 248, 0.25), 0 0 12px rgba(56, 189, 248, 0.8);
  `;
  return el;
}

function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function formatDuration(s: number) {
  const min = Math.max(1, Math.round(s / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}
