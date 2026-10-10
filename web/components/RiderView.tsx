'use client';

import type { GeoJSONSource, Map as MapboxMap, Marker } from 'mapbox-gl';
import Link from 'next/link';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { bearing, boundsOf, distanceMetres, measureLine, pointAlong, type LngLat } from '@/lib/geo';
import {
  MAPBOX_TOKEN,
  NEON_GREEN,
  baseMapOptions,
  buildingCamera,
  createPinElement,
  followPitch,
  mapModeOf,
  setHighlightedBuilding,
  setupScene,
} from '@/lib/map';
import MapModeToggle from '@/components/MapModeToggle';
import { resolveMapMode } from '@/lib/mapMode';
import { buildNavPlan, navProgress, straightLinePlan, type NavPlan } from '@/lib/navigation';
import { flushProofs, pendingProofs, queueProof } from '@/lib/rider/outbox';
import { useOnline } from '@/lib/useOnline';
import { normalizePostcode, type NavigateResponse, type RouteProfile, type RouteResponse } from '@/lib/postcode';
import { createVehicleMarker, type VehicleMarker } from '@/lib/vehicles';
import CustomerLinks from '@/components/rider/CustomerLinks';
import PodForm, { type PodInput } from '@/components/rider/PodForm';
import StopsPlanner, { type PlannedStop } from '@/components/rider/StopsPlanner';
import {
  RunApiError,
  completeStop,
  createRun,
  endRun,
  loadRun,
  reportPosition,
  runFromUrl,
  runUrl,
  type RunState,
} from '@/lib/rider/run';

const ROUTE_SOURCE = 'rider-route';
const LAST_MILE_SOURCE = 'rider-last-mile';
const EMPTY = { type: 'FeatureCollection' as const, features: [] };

// Mapbox has no motorbike profile; "driving" is the closest match for okada/dispatch bikes.
const PROFILES: { value: RouteProfile; label: string }[] = [
  { value: 'driving', label: 'Motorbike / car' },
  { value: 'cycling', label: 'Bicycle' },
  { value: 'walking', label: 'Walk' },
];

// Live navigation: wait this long between automatic re-routes, after this many off-route fixes.
const REROUTE_COOLDOWN_MS = 15_000;
const OFF_ROUTE_FIXES = 3;
// Further than this from the delivery at start, warn that the route will be long.
const FAR_AWAY_M = 50_000;

type OriginSource = 'simulated' | 'tapped' | 'gps';
type Status = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready' };
type Ride =
  | { kind: 'idle' }
  | { kind: 'simulating'; remaining_m: number }
  | { kind: 'simulated' }
  | { kind: 'locating' }
  | { kind: 'navigating'; remaining_m: number; next: { instruction: string; in_m: number } | null; accuracy_m: number; rerouting: boolean }
  /** At a stop: proof of delivery. */
  | { kind: 'pod'; saving: boolean; error: string | null }
  /** Every stop in the run is done. */
  | { kind: 'run-done' };

// Report the rider's position to the run (customers' tracking pages) this often.
const REPORT_EVERY_MS = 10_000;

/** Pretend rider start ~1.5 km north-west of the destination, for demos away from Abuja. */
function simulatedStart([lng, lat]: LngLat): LngLat {
  return [lng - 0.0105, lat + 0.0085];
}

/** Live-navigation state that callbacks (GPS, animation) read without re-rendering. */
type NavState = {
  watchId: number | null;
  plan: NavPlan | null;
  offRouteFixes: number;
  lastReroute: number;
  last: LngLat | null;
  heading: number;
  follow: boolean;
  wakeLock: { release: () => Promise<void> } | null;
  /** Average speed of the current route (m/s), for the ETA sent to customers. */
  speed: number;
  lastReport: number;
  /** Following a straight line because there was no connection to fetch a route. */
  offlinePlan: boolean;
};

// Without a route, assume ~20 km/h for ETAs.
const OFFLINE_SPEED_MS = 5.5;

/**
 * @param claimId From a shared link: routes to the gate its owner marked, but
 *   only for the code the link was for, not for later searches.
 */
export default function RiderView({ initialCode, claimId }: { initialCode?: string; claimId?: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapReady = useRef<Promise<MapboxMap> | null>(null);
  const vehicle = useRef<VehicleMarker | null>(null);
  const destMarker = useRef<Marker | null>(null);
  const animFrame = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const nav = useRef<NavState>({
    watchId: null, plan: null, offRouteFixes: 0, lastReroute: 0, last: null, heading: 0, follow: true, wakeLock: null,
    speed: 0, lastReport: 0, offlinePlan: false,
  });
  // The latest position report that failed to send (no connection); sent when back online.
  const pendingReport = useRef<{ run: RunState; body: Parameters<typeof reportPosition>[1] } | null>(null);

  const [query, setQuery] = useState(initialCode ?? '');
  const [code, setCode] = useState<string | null>(null);
  const [origin, setOrigin] = useState<LngLat | null>(null);
  const [originSource, setOriginSource] = useState<OriginSource>('simulated');
  const [profile, setProfile] = useState<RouteProfile>('driving');
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [ride, setRide] = useState<Ride>({ kind: 'idle' });
  const [following, setFollowing] = useState(true);
  const [gpsWarning, setGpsWarning] = useState<string | null>(null);
  // Multi-stop planning (before a run exists) and the active run.
  const [extras, setExtras] = useState<PlannedStop[]>([]);
  const [optimize, setOptimize] = useState(false);
  const online = useOnline();
  const [queued, setQueued] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [run, setRunState] = useState<RunState | null>(null);
  const runRef = useRef<RunState | null>(null);
  const setRun = (next: RunState | null) => {
    runRef.current = next;
    setRunState(next);
  };

  const busy = ride.kind === 'simulating' || ride.kind === 'locating' || ride.kind === 'navigating';

  // ---- Map ------------------------------------------------------------------
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current) return;
    let map: MapboxMap | null = null;
    let cancelled = false;

    mapReady.current = import('mapbox-gl').then(({ default: mapboxgl }) => {
      // Unmounted while the library was loading (e.g. React's dev double-mount):
      // don't create a map nobody will clean up.
      if (cancelled) return new Promise<MapboxMap>(() => {});
      mapboxgl.accessToken = MAPBOX_TOKEN;
      const { mode } = resolveMapMode();
      map = new mapboxgl.Map({
        container: containerRef.current!,
        ...baseMapOptions('dusk', mode),
        center: [7.4789, 9.0777],
        zoom: 14,
        pitch: mode === 'lite' ? 0 : 40,
      });
      map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), 'top-right');

      return new Promise<MapboxMap>((resolve) => {
        map!.on('style.load', () => {
          if (cancelled || !map) return;
          setupScene(map, mode);
          addRouteLayers(map);
          map.on('click', (e) => mapClickRef.current([e.lngLat.lng, e.lngLat.lat]));
          // Panning by hand during navigation pauses the follow camera.
          map.on('dragstart', () => {
            if (nav.current.watchId !== null) {
              nav.current.follow = false;
              setFollowing(false);
            }
          });
          resolve(map);
        });
      });
    });

    return () => {
      cancelled = true;
      abortRef.current?.abort();
      if (animFrame.current) cancelAnimationFrame(animFrame.current);
      endNavigation();
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Resume a run from the URL (?run=…#token=…), else load the code passed in (?code=…).
  useEffect(() => {
    const fromUrl = runFromUrl();
    if (fromUrl) {
      void (async () => {
        try {
          const loaded = await loadRun(fromUrl.id, fromUrl.token);
          setRun(loaded);
          const stop = loaded.stops[loaded.current];
          if (stop) await planFor(stop.code, stop.claim);
          else setRide({ kind: 'run-done' });
        } catch (err) {
          setStatus({ kind: 'error', message: err instanceof RunApiError ? err.message : 'Could not open this run.' });
        }
      })();
    } else if (initialCode) {
      void planFor(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Back online (or on load): upload proofs saved offline and the last position.
  useEffect(() => {
    if (!online) return;
    const report = pendingReport.current;
    if (report) {
      pendingReport.current = null;
      void reportPosition(report.run, report.body).catch(() => {});
    }
    if (pendingProofs().length === 0) return;
    void flushProofs().then(({ sent, rejected }) => {
      setQueued(pendingProofs(runRef.current?.id).length);
      if (rejected.length) {
        setNotice(`${rejected.length} saved delivery proof(s) were rejected: ${rejected[0].message}`);
      } else if (sent) {
        setNotice(`Back online: sent ${sent} saved delivery proof${sent === 1 ? '' : 's'}.`);
      }
    });
  }, [online]);

  // ---- Planning -------------------------------------------------------------
  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    await planFor(query);
  }

  /** Resolve a code, pick a simulated rider start near it, then route. */
  async function planFor(input: string, claim?: string | null) {
    const normalized = normalizePostcode(input);
    if (!normalized) {
      setStatus({ kind: 'error', message: 'Enter an 11-character NIPOST code, e.g. FC 02 SIM BP 87.' });
      return;
    }
    stopEverything();
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
      await fetchRoute(normalized, start, profile, true, claim);
    } catch (err) {
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Lookup failed.' });
    }
  }

  /** Fetches and draws a route; returns it, or null on failure. `fit` frames the whole route. */
  async function fetchRoute(forCode: string, from: LngLat, withProfile: RouteProfile, fit = true, claim?: string | null) {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setStatus({ kind: 'loading' });

    try {
      const claimFor = claim !== undefined ? claim : claimId && initialCode && normalizePostcode(initialCode) === forCode ? claimId : null;
      const claimParam = claimFor ? `&claim=${encodeURIComponent(claimFor)}` : '';
      const url = `/api/v1/navigate/${forCode}/route?from=${from[0].toFixed(6)},${from[1].toFixed(6)}&profile=${withProfile}${claimParam}`;
      const res = await fetch(url, { signal: controller.signal });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message ?? `Routing failed (HTTP ${res.status}).`);

      const result = body as RouteResponse;
      setRoute(result);
      setStatus({ kind: 'ready' });
      const map = await mapReady.current;
      if (map && !controller.signal.aborted) await drawRoute(map, result, fit);
      return result;
    } catch (err) {
      if (controller.signal.aborted) return null;
      setStatus({ kind: 'error', message: err instanceof Error ? err.message : 'Routing failed.' });
      return null;
    }
  }

  async function drawRoute(map: MapboxMap, result: RouteResponse, fit: boolean) {
    setHighlightedBuilding(map, result);
    (map.getSource(ROUTE_SOURCE) as GeoJSONSource).setData({ type: 'Feature', properties: {}, geometry: result.route.geometry });
    (map.getSource(LAST_MILE_SOURCE) as GeoJSONSource).setData(
      result.lastMile ? { type: 'Feature', properties: {}, geometry: result.lastMile.geometry } : EMPTY,
    );

    const { default: mapboxgl } = await import('mapbox-gl');
    // One icon per travel mode: car, bicycle or person.
    if (vehicle.current?.profile !== result.profile) {
      vehicle.current?.marker.remove();
      vehicle.current = createVehicleMarker(mapboxgl, result.profile);
    }
    const coords = result.route.geometry.coordinates;
    vehicle.current.marker.setLngLat(result.origin).addTo(map);
    if (coords.length > 1) vehicle.current.setHeading(bearing(coords[0], coords[1]));

    destMarker.current ??= new mapboxgl.Marker({ element: createPinElement(), anchor: 'bottom' });
    destMarker.current.setLngLat(result.destination.point).addTo(map);

    if (fit) fitRoute(map, result);
  }

  function fitRoute(map: MapboxMap, result: RouteResponse) {
    const pts: LngLat[] = [...result.route.geometry.coordinates, result.origin, result.destination.point];
    const mobile = window.innerWidth < 640;
    map.fitBounds(boundsOf(pts), {
      padding: mobile ? { top: 90, bottom: 330, left: 30, right: 30 } : { top: 60, bottom: 60, left: 460, right: 60 },
      pitch: mapModeOf(map) === 'lite' ? 0 : 45,
      bearing: 0,
      duration: 1200,
    });
  }

  // ---- Rider origin ---------------------------------------------------------
  function handleMapClick(point: LngLat) {
    if (!code || busy) return;
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
      stopEverything();
      void fetchRoute(code, origin, next);
    }
  }

  // ---- Simulated ride -------------------------------------------------------
  async function startSimulation() {
    const map = await mapReady.current;
    if (!map || !route) return;
    stopEverything();

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
      // Ease the heading so short zig-zag segments don't make the camera spin.
      heading = easeHeading(heading, target, 0.08);

      vehicle.current?.marker.setLngLat(point);
      vehicle.current?.setHeading(heading);
      map.jumpTo({ center: point, bearing: heading, pitch: followPitch(map), zoom: 17.3 });

      if (now - lastUiUpdate > 200) {
        lastUiUpdate = now;
        setRide({ kind: 'simulating', remaining_m: Math.round(line.length - travelled) });
      }
      if (t < 1) {
        animFrame.current = requestAnimationFrame(frame);
      } else {
        animFrame.current = null;
        setRide({ kind: 'simulated' });
        map.flyTo({ ...buildingCamera(route.center, mapModeOf(map)), speed: 0.8, essential: true });
      }
    };
    setRide({ kind: 'simulating', remaining_m: Math.round(line.length) });
    animFrame.current = requestAnimationFrame(frame);
  }

  // ---- Live delivery navigation ---------------------------------------------
  async function startDelivery() {
    if (!code) return;
    if (!navigator.geolocation) {
      setStatus({ kind: 'error', message: 'This browser has no location access, so live navigation is unavailable.' });
      return;
    }
    stopEverything();
    setRide({ kind: 'locating' });
    nav.current = { ...nav.current, plan: null, offRouteFixes: 0, lastReroute: 0, last: null, follow: true };
    setFollowing(true);

    // Keep the screen on while riding (where supported).
    try {
      nav.current.wakeLock = (await (navigator as any).wakeLock?.request('screen')) ?? null;
    } catch {
      nav.current.wakeLock = null;
    }

    // Fixed for this leg: the stops to create the run with (first leg only) and the travel mode.
    const forProfile = profile;
    const planned = { first: code, extras, optimize };
    nav.current.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setGpsWarning(null);
        void onFix(pos, forProfile, planned);
      },
      (err) => {
        // Only a denied permission is fatal. Timeouts (e.g. standing still at a
        // junction) and lost signal are transient: the watch keeps running.
        if (err.code === err.PERMISSION_DENIED) {
          endNavigation();
          setRide({ kind: 'idle' });
          setStatus({ kind: 'error', message: 'Location permission was denied. Allow location access to navigate.' });
        } else {
          setGpsWarning('Weak GPS signal: waiting for your position…');
        }
      },
      { enableHighAccuracy: true, maximumAge: 2_000, timeout: 30_000 },
    );
  }

  async function onFix(
    pos: GeolocationPosition,
    forProfile: RouteProfile,
    planned: { first: string; extras: PlannedStop[]; optimize: boolean },
  ) {
    const map = await mapReady.current;
    const state = nav.current;
    if (!map || state.watchId === null) return;
    const point: LngLat = [pos.coords.longitude, pos.coords.latitude];
    const accuracy = pos.coords.accuracy ?? 0;

    // First fix of a leg: create the run if needed, then route from where the rider actually is.
    if (!state.plan) {
      if (state.lastReroute > 0) return; // first route still loading
      state.lastReroute = Date.now();
      setOrigin(point);
      setOriginSource('gps');
      let active = runRef.current;
      if (!active) {
        try {
          active = await createRun({
            profile: forProfile,
            optimize: planned.optimize,
            from: point,
            stops: [
              { code: planned.first, claim: claimId && initialCode && normalizePostcode(initialCode) === planned.first ? claimId : null },
              ...planned.extras.map((x) => ({ code: x.code })),
            ],
          });
        } catch (err) {
          endNavigation();
          setRide({ kind: 'idle' });
          setStatus({
            kind: 'error',
            message:
              err instanceof RunApiError
                ? err.message
                : navigator.onLine
                  ? 'Could not start the delivery.'
                  : 'You’re offline. Connect to the internet to start a delivery run.',
          });
          return;
        }
        if (nav.current.watchId === null) return;
        setRun(active);
        setExtras([]);
        // A reload resumes this run; the token stays in the #fragment.
        window.history.replaceState(null, '', runUrl(active));
      }
      const stop = active.stops[active.current];
      const first = await fetchRoute(stop.code, point, forProfile, false, stop.claim);
      if (nav.current.watchId === null) return;
      if (!first) {
        if (navigator.onLine) {
          state.lastReroute = 0; // let the next fix try again
          return;
        }
        // No connection: guide in a straight line until a route can be fetched.
        state.plan = straightLinePlan(point, stop.destination.point);
        state.offlinePlan = true;
        state.speed = OFFLINE_SPEED_MS;
        setStatus({ kind: 'ready' });
      } else {
        state.plan = buildNavPlan(first);
        state.offlinePlan = false;
        state.speed = first.route.duration_s > 0 ? first.route.distance_m / first.route.duration_s : 0;
      }
      const far = distanceMetres(point, stop.destination.point);
      if (far > FAR_AWAY_M) {
        setStatus({ kind: 'error', message: `You're ${Math.round(far / 1000)} km away; the route is long, but navigation will work.` });
      }
    }

    // Heading: the device's own when moving, else the direction of travel.
    const gpsHeading = pos.coords.heading;
    if (gpsHeading != null && !Number.isNaN(gpsHeading) && (pos.coords.speed ?? 0) > 1) {
      state.heading = gpsHeading;
    } else if (state.last && distanceMetres(state.last, point) > 3) {
      state.heading = bearing(state.last, point);
    }
    state.last = point;

    vehicle.current?.marker.setLngLat(point);
    vehicle.current?.setHeading(state.heading);
    if (state.follow) map.easeTo({ center: point, bearing: state.heading, pitch: followPitch(map), zoom: 17.5, duration: 900 });

    const progress = navProgress(state.plan!, point, accuracy);

    const active = runRef.current;
    const report = (arrived: boolean) => {
      if (!active) return;
      state.lastReport = Date.now();
      const body = {
        lng: point[0],
        lat: point[1],
        heading: state.heading,
        current_stop: active.current,
        remaining_m: Math.round(progress.remaining_m),
        eta_s: state.speed > 0 ? Math.round(progress.remaining_m / state.speed) : 0,
        arrived,
      };
      void reportPosition(active, body).catch(() => {
        pendingReport.current = { run: active, body };
      });
    };

    if (progress.arrived) {
      report(true);
      endNavigation();
      setRide({ kind: 'pod', saving: false, error: null });
      map.flyTo({ ...buildingCamera(state.plan!.destination, mapModeOf(map)), speed: 0.8, essential: true });
      return;
    }
    if (Date.now() - state.lastReport > REPORT_EVERY_MS) report(false);

    // Re-route after a few consecutive off-route fixes, not on one GPS blip.
    state.offRouteFixes = progress.offRoute ? state.offRouteFixes + 1 : 0;
    let rerouting = false;
    const needsRoute = state.offlinePlan
      ? Date.now() - state.lastReroute > 5_000
      : state.offRouteFixes >= OFF_ROUTE_FIXES && Date.now() - state.lastReroute > REROUTE_COOLDOWN_MS;
    if (navigator.onLine && needsRoute) {
      state.offRouteFixes = 0;
      state.lastReroute = Date.now();
      rerouting = true;
      const stop = active?.stops[active.current];
      if (stop) {
        void fetchRoute(stop.code, point, forProfile, false, stop.claim).then((fresh) => {
          if (fresh && nav.current.watchId !== null) {
            nav.current.plan = buildNavPlan(fresh);
            nav.current.offlinePlan = false;
            nav.current.speed = fresh.route.duration_s > 0 ? fresh.route.distance_m / fresh.route.duration_s : nav.current.speed;
          }
        });
      }
    }

    setRide({
      kind: 'navigating',
      remaining_m: Math.round(progress.remaining_m),
      next: progress.next,
      accuracy_m: Math.round(accuracy),
      rerouting,
    });
  }

  /** Proof of delivery for the current stop, then on to the next one. */
  async function submitPod(input: PodInput) {
    const active = runRef.current;
    if (!active) return;
    setRide({ kind: 'pod', saving: true, error: null });
    try {
      const result = await completeStop(active, active.current, input);
      const stops = active.stops.map((st) => (st.stop_index === active.current ? { ...st, status: 'delivered' as const } : st));
      if (result.next_stop == null) {
        setRun({ ...active, stops, current: stops.length });
        setRide({ kind: 'run-done' });
        return;
      }
      setRun({ ...active, stops, current: result.next_stop });
      const next = stops[result.next_stop];
      setQuery(next.formatted);
      setCode(next.code);
      await startDelivery();
    } catch (err) {
      if (err instanceof RunApiError) {
        setRide({ kind: 'pod', saving: false, error: err.message });
        return;
      }
      // No connection: keep the proof on the phone, upload it later, and move on.
      if (!queueProof(active, active.current, input)) {
        setRide({ kind: 'pod', saving: false, error: 'No connection, and the phone has no room to save this. Try again with a connection.' });
        return;
      }
      setQueued(pendingProofs(active.id).length);
      setNotice('No connection: delivery saved on this phone. It will upload automatically when you’re back online.');
      const stops = active.stops.map((st) => (st.stop_index === active.current ? { ...st, status: 'delivered' as const } : st));
      const next = stops.find((st) => st.status !== 'delivered' && st.status !== 'failed');
      if (!next) {
        setRun({ ...active, stops, current: stops.length });
        setRide({ kind: 'run-done' });
        return;
      }
      setRun({ ...active, stops, current: next.stop_index });
      setQuery(next.formatted);
      setCode(next.code);
      await startDelivery();
    }
  }

  /** Stops the run for everyone: unfinished stops are marked not delivered. */
  async function finishRun() {
    const active = runRef.current;
    if (active && !confirm('End this delivery run? Stops not yet delivered will be marked as not delivered.')) return;
    stopEverything();
    if (active) {
      await endRun(active).catch(() => {});
      setRun(null);
      window.history.replaceState(null, '', '/rider');
    }
    await resetView();
  }

  async function recenter() {
    nav.current.follow = true;
    setFollowing(true);
    const map = await mapReady.current;
    if (map && nav.current.last) {
      map.easeTo({ center: nav.current.last, bearing: nav.current.heading, pitch: followPitch(map), zoom: 17.5, duration: 600 });
    }
  }

  /** Stops GPS tracking and releases the screen wake lock. */
  function endNavigation() {
    const state = nav.current;
    if (state.watchId !== null) navigator.geolocation.clearWatch(state.watchId);
    state.watchId = null;
    void state.wakeLock?.release().catch(() => {});
    state.wakeLock = null;
  }

  function stopEverything() {
    if (animFrame.current) cancelAnimationFrame(animFrame.current);
    animFrame.current = null;
    endNavigation();
    setGpsWarning(null);
    setRide({ kind: 'idle' });
  }

  async function resetView() {
    stopEverything();
    const map = await mapReady.current;
    if (map && route) {
      vehicle.current?.marker.setLngLat(route.origin);
      fitRoute(map, route);
    }
  }

  // ---- Render ---------------------------------------------------------------
  const placeName =
    typeof route?.building?.properties.name === 'string' ? route.building.properties.name : route?.formatted;
  const straightLine = route ? distanceMetres(route.origin, route.destination.point) : 0;
  // Remaining time at the route's own average speed.
  const etaFor = (remaining_m: number) =>
    route && route.route.distance_m > 0 ? (remaining_m / route.route.distance_m) * route.route.duration_s : 0;

  return (
    <div className="relative h-full w-full">
      {/* Inline style: mapbox-gl.css sets .mapboxgl-map { position: relative }, which beats Tailwind's layered utilities. */}
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />

      {!MAPBOX_TOKEN && (
        <div className="absolute inset-0 grid place-items-center p-6 text-center text-slate-300">
          Set NEXT_PUBLIC_MAPBOX_TOKEN in web/.env.local to load the map.
        </div>
      )}

      {/* Destination search, or the next-turn banner while navigating */}
      {ride.kind === 'navigating' ? (
        <div className="absolute left-3 right-14 top-3 rounded-xl border border-white/10 bg-emerald-950/95 p-3 shadow-2xl backdrop-blur sm:right-auto sm:w-[400px]">
          {ride.next ? (
            <>
              <p className="text-2xl font-semibold text-white">{formatDistance(ride.next.in_m)}</p>
              <p className="text-base text-emerald-100">{ride.next.instruction}</p>
            </>
          ) : (
            <p className="text-base text-emerald-100">Continue to the destination</p>
          )}
        </div>
      ) : (
        <form
          onSubmit={handleSubmit}
          className="absolute left-3 right-14 top-3 flex gap-2 rounded-xl border border-white/10 bg-slate-900/90 p-2 shadow-2xl backdrop-blur sm:right-auto sm:w-[400px]"
        >
          <Link href="/map" aria-label="Back to search" className="grid place-items-center px-2 text-slate-400 hover:text-slate-100">
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
            disabled={busy}
            className="min-w-0 flex-1 rounded-lg bg-slate-800 px-3 py-2 font-mono uppercase tracking-wider text-slate-100 placeholder:normal-case placeholder:tracking-normal placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
          />
          <button
            type="submit"
            disabled={status.kind === 'loading' || busy}
            className="rounded-lg bg-[#39FF14] px-3 py-2 font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
          >
            Route
          </button>
        </form>
      )}

      {/* Bottom sheet (left panel on desktop) */}
      <section className="absolute inset-x-0 bottom-0 max-h-[55dvh] overflow-y-auto rounded-t-2xl border border-white/10 bg-slate-900/95 p-4 text-sm shadow-2xl backdrop-blur sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-20 sm:max-h-[calc(100dvh-6rem)] sm:w-[400px] sm:rounded-2xl">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs uppercase tracking-wider text-slate-500">
            {ride.kind === 'navigating' || ride.kind === 'locating' ? 'Delivering · live GPS' : 'Rider view'}
          </p>
          {/* Switching reloads the page, so not mid-ride. */}
          <MapModeToggle disabled={busy} className="rounded-lg bg-slate-800 p-0.5" />
        </div>

        {!online && (
          <p role="status" className="mt-2 rounded-lg bg-amber-950/90 px-3 py-2 text-amber-200">
            Offline. Navigation continues on your last route; updates and delivery proofs are saved and sent when you’re
            back online.{queued > 0 && ` ${queued} delivery proof${queued === 1 ? '' : 's'} waiting to upload.`}
          </p>
        )}
        {notice && (
          <p role="status" className="mt-2 flex items-start justify-between gap-2 rounded-lg bg-slate-800 px-3 py-2 text-slate-200">
            <span>{notice}</span>
            <button type="button" onClick={() => setNotice(null)} className="shrink-0 text-slate-400 hover:text-white" aria-label="Dismiss">
              ✕
            </button>
          </p>
        )}
        {status.kind === 'error' && online && (
          <p role="alert" className="mt-2 rounded-lg bg-red-950/90 px-3 py-2 text-red-200">
            {status.message}
          </p>
        )}

        {!route && status.kind !== 'error' && (
          <p className="mt-2 text-slate-400">
            {status.kind === 'loading'
              ? 'Planning route…'
              : 'Enter a destination code to route a delivery to the building.'}
          </p>
        )}

        {route && (
          <>
            {ride.kind === 'navigating' ? (
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-3xl font-semibold text-slate-100">{formatDuration(etaFor(ride.remaining_m))}</span>
                <span className="text-slate-400">{formatDistance(ride.remaining_m)} left</span>
                {ride.rerouting && <span className="text-xs text-amber-300">re-routing…</span>}
              </div>
            ) : (
              <div className="mt-2 flex items-baseline gap-3">
                <span className="text-3xl font-semibold text-slate-100">{formatDuration(route.route.duration_s)}</span>
                <span className="text-slate-400">{formatDistance(route.route.distance_m)}</span>
                {status.kind === 'loading' && <span className="text-xs text-slate-500">updating…</span>}
              </div>
            )}
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

            {ride.kind === 'navigating' || ride.kind === 'locating' ? (
              <>
                <p className={`mt-3 text-xs ${gpsWarning ? 'text-amber-300' : 'text-slate-400'}`}>
                  {gpsWarning ??
                    (ride.kind === 'locating'
                      ? 'Getting your location…'
                      : `GPS accuracy ±${ride.accuracy_m} m · screen stays on while navigating`)}
                </p>
                <div className="mt-3 flex gap-2">
                  {!following && (
                    <button
                      type="button"
                      onClick={recenter}
                      className="flex-1 rounded-lg border border-sky-400/40 px-3 py-2 font-medium text-sky-300 hover:bg-sky-400/10"
                    >
                      Re-center
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={resetView}
                    className="flex-1 rounded-lg border border-white/15 px-4 py-2 text-slate-200 hover:bg-white/5"
                  >
                    Pause
                  </button>
                  <button
                    type="button"
                    onClick={finishRun}
                    className="rounded-lg border border-red-400/30 px-3 py-2 text-red-300 hover:bg-red-400/10"
                  >
                    End run
                  </button>
                </div>
                {run && <CustomerLinks run={run} />}
              </>
            ) : ride.kind === 'pod' && run?.stops[run.current] ? (
              <>
                <PodForm
                  key={run.current}
                  stop={run.stops[run.current]}
                  onSubmit={submitPod}
                  saving={ride.saving}
                  error={ride.error}
                />
                <CustomerLinks run={run} />
              </>
            ) : ride.kind === 'run-done' ? (
              <div className="mt-3 rounded-lg bg-emerald-500/10 p-3 ring-1 ring-emerald-400/30">
                <p className="font-medium text-emerald-300">All deliveries done ✓</p>
                <p className="mt-1 text-xs text-slate-300">
                  {run ? `${run.stops.filter((st) => st.status === 'delivered').length} of ${run.stops.length} stops delivered.` : ''}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setRun(null);
                    window.history.replaceState(null, '', '/rider');
                    void resetView();
                  }}
                  className="mt-2 w-full rounded-lg bg-[#39FF14] px-3 py-2 font-semibold text-slate-950 hover:brightness-110"
                >
                  Plan a new delivery
                </button>
              </div>
            ) : (
              <>
                <div className="mt-3 grid grid-cols-3 gap-1 rounded-lg bg-slate-800 p-1" role="radiogroup" aria-label="Travel mode">
                  {PROFILES.map((p) => (
                    <button
                      key={p.value}
                      type="button"
                      role="radio"
                      aria-checked={profile === p.value}
                      onClick={() => changeProfile(p.value)}
                      disabled={busy}
                      className={`rounded-md px-2 py-1.5 text-xs font-medium transition ${
                        profile === p.value ? 'bg-slate-600 text-white' : 'text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                {run ? (
                  <CustomerLinks run={run} />
                ) : (
                  <StopsPlanner
                    first={code ? { code, formatted: route.formatted, name: placeName && placeName !== route.formatted ? placeName : null } : null}
                    extras={extras}
                    onAdd={(stop) => setExtras((xs) => [...xs, stop])}
                    onRemove={(c) => setExtras((xs) => xs.filter((x) => x.code !== c))}
                    optimize={optimize}
                    onOptimize={setOptimize}
                    disabled={busy}
                  />
                )}

                <div className="mt-3 flex items-center justify-between gap-2 text-xs text-slate-400">
                  <span>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full bg-sky-400 align-middle" />
                    {originSource === 'gps'
                      ? `Start: your GPS (${formatDistance(Math.round(straightLine))} away)`
                      : originSource === 'tapped'
                        ? 'Start: point you tapped'
                        : 'Start: simulated rider'}
                    {!busy && ' · tap map to move'}
                  </span>
                  <button
                    type="button"
                    onClick={locateWithGps}
                    disabled={busy}
                    className="shrink-0 text-sky-300 hover:text-sky-200 disabled:opacity-50"
                  >
                    Use my GPS
                  </button>
                </div>

                {ride.kind === 'simulating' ? (
                  <div className="mt-3 flex gap-2">
                    <div className="flex-1 rounded-lg bg-slate-800 px-3 py-2 text-slate-200">
                      {formatDistance(ride.remaining_m)} to go
                    </div>
                    <button
                      type="button"
                      onClick={resetView}
                      className="rounded-lg border border-white/15 px-4 py-2 text-slate-200 hover:bg-white/5"
                    >
                      Stop
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      onClick={startDelivery}
                      disabled={status.kind === 'loading'}
                      className="w-full rounded-lg bg-[#39FF14] px-3 py-2.5 text-base font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
                    >
                      {run
                        ? `Continue delivery · stop ${run.current + 1} of ${run.stops.length}`
                        : extras.length
                          ? `Start delivery · ${extras.length + 1} stops`
                          : 'Start delivery'}
                    </button>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={startSimulation}
                        disabled={status.kind === 'loading'}
                        className="flex-1 rounded-lg border border-white/15 px-3 py-2 font-medium text-slate-200 hover:bg-white/5 disabled:opacity-60"
                      >
                        {ride.kind === 'simulated' ? 'Replay simulation' : 'Simulate ride'}
                      </button>
                      {ride.kind === 'simulated' && (
                        <button
                          type="button"
                          onClick={resetView}
                          className="rounded-lg border border-white/15 px-4 py-2 text-slate-200 hover:bg-white/5"
                        >
                          Overview
                        </button>
                      )}
                    </div>
                  </div>
                )}

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
          </>
        )}
      </section>
    </div>
  );
}

/** Moves `current` toward `target` by `factor`, taking the short way round the compass. */
function easeHeading(current: number, target: number, factor: number) {
  const delta = ((target - current + 540) % 360) - 180;
  return (current + delta * factor + 360) % 360;
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

function formatDistance(m: number) {
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}

function formatDuration(s: number) {
  const min = Math.max(1, Math.round(s / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}
