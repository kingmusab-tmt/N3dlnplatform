'use client';

import type { Map as MapboxMap, Marker } from 'mapbox-gl';
import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import {
  LIGHT_PRESETS,
  MAPBOX_TOKEN,
  baseMapOptions,
  buildingCamera,
  createGateElement,
  createPinElement,
  prefersReducedMotion,
  setHighlightedBuilding,
  setLightPreset,
  setupScene,
  startOrbit,
  startPulse,
  type LightPreset,
} from '@/lib/map';
import ShareButtons from '@/components/ShareButtons';
import { AUTH_ENABLED, useUser } from '@/lib/supabase/client';
import type { User } from '@supabase/supabase-js';
import { normalizePostcode, type Claim, type Gate, type NavigateResponse, type Verification } from '@/lib/postcode';

// The map opens over all of Nigeria, then flies into Wuse 2, Abuja (the MVP pilot area).
const NIGERIA_VIEW = { center: [8.6753, 9.082] as [number, number], zoom: 5.3, pitch: 0, bearing: 0 };
const PILOT_VIEW = { center: [7.4789, 9.0777] as [number, number], zoom: 15.8, pitch: 60, bearing: -28 };

type Status =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error'; message: string }
  | { kind: 'found'; result: NavigateResponse };

export default function NavigationMap({ initialCode }: { initialCode?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapboxMap | null>(null);
  const markerRef = useRef<Marker | null>(null);
  const mapReady = useRef<Promise<MapboxMap> | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const stopOrbit = useRef<() => void>(() => {});
  const stopPulse = useRef<() => void>(() => {});
  const gateMarkerRef = useRef<Marker | null>(null);

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [light, setLight] = useState<LightPreset>('dusk');
  // Gate being marked for a claim: picking = the next map click places it.
  const [gate, setGate] = useState<Gate | null>(null);
  const [pickingGate, setPickingGate] = useState(false);
  const user = useUser();

  // ---- Map initialisation ---------------------------------------------------
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    let cancelled = false;

    mapReady.current = import('mapbox-gl').then(({ default: mapboxgl }) => {
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const map = new mapboxgl.Map({
        container: containerRef.current!,
        ...baseMapOptions('dusk'),
        ...NIGERIA_VIEW,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'bottom-right');
      mapRef.current = map;

      return new Promise<MapboxMap>((resolve) => {
        map.on('style.load', () => {
          if (cancelled) return;
          setupScene(map);
          stopPulse.current = startPulse(map);
          map.on('click', (e) => mapClickRef.current(e.lngLat.lng, e.lngLat.lat));
          // Intro: sweep from the whole country down into the pilot area,
          // unless the page was opened on a specific building (?code=…).
          if (initialCode) map.jumpTo(PILOT_VIEW);
          else if (prefersReducedMotion()) map.jumpTo(PILOT_VIEW);
          else map.flyTo({ ...PILOT_VIEW, duration: 7000, curve: 1.6, essential: true });
          resolve(map);
        });
      });
    });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      stopOrbit.current();
      stopPulse.current();
      markerRef.current?.remove();
      gateMarkerRef.current?.remove();
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Open the building from the URL (?code=…) once.
  useEffect(() => {
    const code = initialCode && normalizePostcode(initialCode);
    if (!code) return;
    setQuery(initialCode!);
    void resolveAndShow(`/api/v1/navigate/${encodeURIComponent(code)}`, 'fly');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- Search & pin-drop ----------------------------------------------------
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const code = normalizePostcode(query);
    if (!code) {
      setStatus({ kind: 'error', message: 'Enter an 11-character NIPOST code, e.g. FC 02 SIM BP 87.' });
      return;
    }
    await resolveAndShow(`/api/v1/navigate/${encodeURIComponent(code)}`, 'fly');
  }

  // Map click: place the gate while marking one, otherwise find the building under the pointer.
  async function handleMapClick(lng: number, lat: number) {
    if (pickingGate) return placeGate(lng, lat);
    const result = await resolveAndShow(`/api/v1/buildings/at?lng=${lng}&lat=${lat}`, 'stay');
    if (result) setQuery(result.formatted);
  }
  const mapClickRef = useRef(handleMapClick);
  mapClickRef.current = handleMapClick;

  async function resolveAndShow(url: string, camera: 'fly' | 'stay') {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: 'loading' });
    await clearGate(); // a gate belongs to the building being claimed

    try {
      const res = await fetch(url, { signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(body?.message ?? `Lookup failed (HTTP ${res.status}).`);
      }

      const result = body as NavigateResponse;
      setStatus({ kind: 'found', result });

      const map = await mapReady.current;
      if (map && !controller.signal.aborted) await showBuilding(map, result, camera);
      return result;
    } catch (err) {
      if (controller.signal.aborted) return null;
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Lookup failed.' });
      return null;
    }
  }

  async function showBuilding(map: MapboxMap, result: NavigateResponse, camera: 'fly' | 'stay') {
    stopOrbit.current();
    setHighlightedBuilding(map, result);

    const { default: mapboxgl } = await import('mapbox-gl');
    markerRef.current?.remove();
    markerRef.current = new mapboxgl.Marker({ element: createPinElement(), anchor: 'bottom' })
      .setLngLat(result.center)
      .addTo(map);

    // A click while already zoomed in just highlights; don't yank the camera.
    if (camera === 'stay' && map.getZoom() >= 16.5) return;

    map.flyTo({
      ...buildingCamera(result.center),
      speed: 0.9,
      curve: 1.5,
      essential: true, // still animate for users with prefers-reduced-motion
    });
    // Once there, slowly circle the building until the user takes over.
    if (camera === 'fly') map.once('moveend', () => (stopOrbit.current = startOrbit(map)));
  }

  // ---- Gate marking (for claims) ---------------------------------------------
  async function startPickingGate() {
    const map = await mapReady.current;
    if (!map) return;
    stopOrbit.current();
    setPickingGate(true);
    map.getCanvas().style.cursor = 'crosshair';
  }

  async function placeGate(lng: number, lat: number) {
    const map = await mapReady.current;
    if (!map) return;
    setPickingGate(false);
    map.getCanvas().style.cursor = '';
    setGate({ lng, lat });
    if (!gateMarkerRef.current) {
      const { default: mapboxgl } = await import('mapbox-gl');
      const marker = new mapboxgl.Marker({ element: createGateElement(), draggable: true });
      marker.on('dragend', () => {
        const p = marker.getLngLat();
        setGate({ lng: p.lng, lat: p.lat });
      });
      gateMarkerRef.current = marker;
    }
    gateMarkerRef.current.setLngLat([lng, lat]).addTo(map);
  }

  async function clearGate() {
    gateMarkerRef.current?.remove();
    setGate(null);
    setPickingGate(false);
    const map = await mapReady.current;
    if (map) map.getCanvas().style.cursor = '';
  }

  async function changeLight(preset: LightPreset) {
    setLight(preset);
    const map = await mapReady.current;
    if (map) setLightPreset(map, preset);
  }

  // ---- Render ---------------------------------------------------------------
  return (
    <div className="relative h-full w-full">
      {/* Inline style: mapbox-gl.css sets .mapboxgl-map { position: relative }, which beats Tailwind's layered utilities. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {!MAPBOX_TOKEN && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-slate-300">
          <p>
            Set <code className="text-[#39FF14]">NEXT_PUBLIC_MAPBOX_TOKEN</code> in <code>web/.env.local</code> to
            load the map.
          </p>
        </div>
      )}

      {AUTH_ENABLED && user !== undefined && (
        <Link
          href={user ? '/account' : '/login?next=/'}
          className="absolute right-4 top-4 z-10 rounded-xl border border-white/10 bg-slate-900/85 px-3 py-2.5 text-sm font-medium text-slate-100 shadow-2xl backdrop-blur hover:bg-slate-800"
        >
          {user ? 'My places' : 'Sign in'}
        </Link>
      )}

      <div className="absolute left-4 right-28 top-4 sm:right-auto sm:w-[420px]">
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
            placeholder="FC 02 SIM BP 87"
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

        {status.kind === 'idle' && (
          <p className="mt-2 rounded-lg bg-slate-900/85 px-3 py-2 text-sm text-slate-400 backdrop-blur">
            Search a postcode, or click any building on the map to see its code.
          </p>
        )}

        {status.kind === 'found' && (
          <ResultCard
            key={status.result.code}
            result={status.result}
            gate={gate}
            pickingGate={pickingGate}
            onPickGate={startPickingGate}
            onClearGate={clearGate}
            user={user}
          />
        )}
      </div>

      {MAPBOX_TOKEN && (
        <div
          role="radiogroup"
          aria-label="Lighting"
          className="absolute bottom-8 left-1/2 flex -translate-x-1/2 gap-1 rounded-lg border border-white/10 bg-slate-900/85 p-1 text-xs shadow-xl backdrop-blur"
        >
          {LIGHT_PRESETS.map((p) => (
            <button
              key={p.value}
              type="button"
              role="radio"
              aria-checked={light === p.value}
              onClick={() => changeLight(p.value)}
              className={`rounded-md px-2.5 py-1 font-medium transition ${
                light === p.value ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}
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

type GateControls = {
  gate: Gate | null;
  pickingGate: boolean;
  onPickGate: () => void;
  onClearGate: () => void;
  /** Signed-in user: undefined while loading, null when signed out. */
  user: User | null | undefined;
};

function ResultCard({ result, ...gateControls }: { result: NavigateResponse } & GateControls) {
  const props: Record<string, unknown> = result.building?.properties ?? {};
  const name = typeof props.name === 'string' ? props.name : null;
  const type = typeof props.building_type === 'string' ? props.building_type.replace('_', ' ') : null;
  const [lng, lat] = result.center;

  return (
    <div className="mt-2 rounded-xl border border-white/10 bg-slate-900/85 p-4 text-sm shadow-2xl backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-lg tracking-widest text-[#39FF14]">{result.formatted}</p>
        {result.verification && <VerificationBadge verification={result.verification} />}
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
      {result.building && (
        <Link
          href={`/rider?code=${result.code}`}
          className="mt-3 block rounded-lg border border-sky-400/40 px-3 py-2 text-center font-medium text-sky-300 transition hover:bg-sky-400/10"
        >
          Rider view: route a delivery here
        </Link>
      )}
      {result.building && <ClaimPanel code={result.code} formatted={result.formatted} {...gateControls} />}
    </div>
  );
}

const LABEL_MAX = 80;
const NOTES_MAX = 500;

type ClaimState =
  | { kind: 'closed' }
  | { kind: 'editing'; error?: string }
  | { kind: 'saving' }
  | { kind: 'claimed'; claim: Claim };

function ClaimPanel({
  code,
  formatted,
  gate,
  pickingGate,
  onPickGate,
  onClearGate,
  user,
}: { code: string; formatted: string } & GateControls) {
  const [state, setState] = useState<ClaimState>({ kind: 'closed' });
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!label.trim()) {
      setState({ kind: 'editing', error: 'Give this place a name, e.g. "Home" or "Flat 3B".' });
      return;
    }
    setState({ kind: 'saving' });
    try {
      const res = await fetch(`/api/v1/buildings/${encodeURIComponent(code)}/claims`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ label, delivery_notes: notes, gate }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `Claim failed (HTTP ${res.status}).`);
      setState({ kind: 'claimed', claim: body as Claim });
    } catch (err) {
      setState({ kind: 'editing', error: err instanceof Error ? err.message : 'Claim failed.' });
    }
  }

  // Claims belong to accounts, so owners can edit them and revoke links later.
  if (state.kind === 'closed' && !user && AUTH_ENABLED) {
    return (
      <Link
        href={`/login?next=${encodeURIComponent(`/?code=${code}`)}`}
        aria-disabled={user === undefined}
        className="mt-3 block w-full rounded-lg border border-[#39FF14]/40 px-3 py-2 text-center font-medium text-[#39FF14] transition hover:bg-[#39FF14]/10"
      >
        Sign in to claim {formatted}
      </Link>
    );
  }

  if (state.kind === 'closed') {
    return (
      <button
        type="button"
        onClick={() => setState({ kind: 'editing' })}
        className="mt-3 w-full rounded-lg border border-[#39FF14]/40 px-3 py-2 font-medium text-[#39FF14] transition hover:bg-[#39FF14]/10"
      >
        This is my place: claim {formatted}
      </button>
    );
  }

  if (state.kind === 'claimed') {
    const shareUrl = `${window.location.origin}/h/${state.claim.share_id}`;
    return (
      <div className="mt-3 rounded-lg bg-emerald-500/10 p-3 ring-1 ring-emerald-400/30">
        <p className="font-medium text-emerald-300">Claimed as “{state.claim.label}”</p>
        {state.claim.delivery_notes && <p className="mt-1 text-slate-300">{state.claim.delivery_notes}</p>}
        {state.claim.gate && <p className="mt-1 text-xs text-amber-300">Riders will be routed to your gate.</p>}
        <p className="mt-3 text-xs text-slate-400">Share this link with riders, family or a store checkout:</p>
        <a href={shareUrl} target="_blank" rel="noopener" className="mt-1 block truncate font-mono text-xs text-[#39FF14] underline">
          {shareUrl}
        </a>
        <div className="mt-2">
          <ShareButtons url={shareUrl} text={`${state.claim.label}: ${formatted}`} />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Unverified claim. Anyone with the link can see these details.{' '}
          <Link href="/account" className="text-slate-300 underline hover:text-white">
            Manage in My places
          </Link>
        </p>
      </div>
    );
  }

  const saving = state.kind === 'saving';
  return (
    <form onSubmit={submit} className="mt-3 space-y-2 border-t border-white/10 pt-3">
      <label className="block">
        <span className="text-xs text-slate-400">Name for this place</span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          maxLength={LABEL_MAX}
          placeholder="Home, Flat 3B, Ade's shop…"
          autoFocus
          className="mt-1 w-full rounded-lg bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
        />
      </label>
      <label className="block">
        <span className="text-xs text-slate-400">Delivery notes for riders (optional)</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={NOTES_MAX}
          rows={2}
          placeholder="Blue gate on the left, ring the bell twice"
          className="mt-1 w-full resize-none rounded-lg bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
        />
      </label>
      <div className="rounded-lg bg-slate-800/60 px-3 py-2">
        <p className="text-xs text-slate-400">Gate for riders (recommended)</p>
        {pickingGate ? (
          <div className="mt-1 flex items-center justify-between gap-2 text-sm">
            <span className="text-amber-300">Tap the map where riders should enter.</span>
            <button type="button" onClick={onClearGate} className="shrink-0 text-slate-400 hover:text-slate-200">
              Cancel
            </button>
          </div>
        ) : gate ? (
          <div className="mt-1 flex items-center justify-between gap-2 text-sm">
            <span className="text-slate-200">
              <span className="mr-1 inline-grid h-4 w-4 place-items-center rounded bg-amber-400 text-[10px] font-bold text-slate-950">
                G
              </span>
              Gate marked. Drag it to adjust.
            </span>
            <button type="button" onClick={onClearGate} className="shrink-0 text-slate-400 hover:text-slate-200">
              Remove
            </button>
          </div>
        ) : (
          <button type="button" onClick={onPickGate} className="mt-1 text-sm font-medium text-amber-300 hover:text-amber-200">
            Mark the gate on the map
          </button>
        )}
      </div>
      {state.kind === 'editing' && state.error && (
        <p role="alert" className="text-sm text-red-300">
          {state.error}
        </p>
      )}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex-1 rounded-lg bg-[#39FF14] px-3 py-2 font-semibold text-slate-950 transition hover:brightness-110 disabled:opacity-60"
        >
          {saving ? 'Saving…' : 'Claim'}
        </button>
        <button
          type="button"
          onClick={() => setState({ kind: 'closed' })}
          disabled={saving}
          className="rounded-lg px-3 py-2 text-slate-400 hover:text-slate-200"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
