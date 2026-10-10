// Map setup shared by the search map, the Rider View and the shared-place page.
import type { GeoJSONSource, Map as MapboxMap, MapOptions } from 'mapbox-gl';
import type { NavigateResponse } from './postcode';

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
export const NEON_GREEN = '#39FF14';
export const TARGET_SOURCE = 'target-building';
const BUILDINGS_SOURCE = 'nipost-buildings';
const BUILDINGS_LAYER = 'nipost-buildings-3d';
const DEFAULT_HEIGHT_M = 10;

export type LightPreset = 'dawn' | 'day' | 'dusk' | 'night';
export const LIGHT_PRESETS: { value: LightPreset; label: string }[] = [
  { value: 'day', label: 'Day' },
  { value: 'dusk', label: 'Dusk' },
  { value: 'night', label: 'Night' },
];

export const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Mapbox Standard style: real-time lighting, shadows, sky and 3D trees.
 * Its own 3D buildings are hidden because in Nigeria they're mostly flat
 * stubs; we draw ours from the platform's footprints instead (setupScene).
 */
export function baseMapOptions(light: LightPreset = 'dusk'): Partial<MapOptions> {
  return {
    style: 'mapbox://styles/mapbox/standard',
    config: {
      basemap: {
        lightPreset: light,
        show3dBuildings: false,
        show3dLandmarks: false,
        show3dTrees: true,
        showPointOfInterestLabels: true,
      },
    },
    antialias: true,
  };
}

export function setLightPreset(map: MapboxMap, preset: LightPreset) {
  map.setConfigProperty('basemap', 'lightPreset', preset);
}

/** Close-up camera for a resolved building: pitched to show the 3D extrusions. */
export function buildingCamera(center: [number, number]) {
  return { center, zoom: 18.2, pitch: 62, bearing: -20 };
}

/**
 * Adds terrain, every platform building in 3D (vector tiles from
 * /api/v1/tiles/buildings) and the neon delivery-target layers. Call on
 * 'style.load'.
 */
export function setupScene(map: MapboxMap) {
  // Terrain: Abuja sits among hills (Aso Rock is a few km east of Wuse).
  if (!map.getSource('mapbox-dem')) {
    map.addSource('mapbox-dem', { type: 'raster-dem', url: 'mapbox://mapbox.mapbox-terrain-dem-v1', tileSize: 512, maxzoom: 14 });
  }
  map.setTerrain({ source: 'mapbox-dem', exaggeration: 1.2 });

  map.addSource(BUILDINGS_SOURCE, {
    type: 'vector',
    tiles: [`${window.location.origin}/api/v1/tiles/buildings/{z}/{x}/{y}.mvt`],
    minzoom: 13,
    maxzoom: 16, // the map over-zooms beyond this
    attribution: 'Buildings © OpenStreetMap contributors',
  });

  map.addLayer({
    id: BUILDINGS_LAYER,
    type: 'fill-extrusion',
    source: BUILDINGS_SOURCE,
    'source-layer': 'buildings',
    slot: 'middle',
    minzoom: 13,
    paint: {
      // Muted colours by use, so the neon target stands out.
      'fill-extrusion-color': [
        'match',
        ['get', 'type'],
        ['commercial', 'retail', 'office', 'industrial', 'warehouse'],
        '#6b7a96',
        ['residential', 'house', 'apartments', 'detached', 'semidetached_house', 'terrace'],
        '#9a8c7c',
        ['school', 'university', 'hospital', 'church', 'mosque', 'public', 'government', 'civic'],
        '#7a9484',
        '#8a929f',
      ],
      // Buildings "grow" out of the ground as you zoom in.
      'fill-extrusion-height': ['interpolate', ['linear'], ['zoom'], 13, 0, 14.5, ['get', 'height']],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.95,
      'fill-extrusion-vertical-gradient': true,
      'fill-extrusion-ambient-occlusion-intensity': 0.35,
    },
  });

  // The resolved delivery target, filled in on each successful lookup.
  map.addSource(TARGET_SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
  map.addLayer({
    id: 'target-building-glow',
    type: 'line',
    source: TARGET_SOURCE,
    slot: 'middle',
    paint: { 'line-color': NEON_GREEN, 'line-width': 10, 'line-blur': 8, 'line-opacity': 0.6, 'line-emissive-strength': 1 },
  });
  map.addLayer({
    id: 'target-building-extrusion',
    type: 'fill-extrusion',
    source: TARGET_SOURCE,
    slot: 'middle',
    paint: {
      'fill-extrusion-color': NEON_GREEN,
      'fill-extrusion-height': ['coalesce', ['get', 'render_height_m'], ['get', 'height_m'], DEFAULT_HEIGHT_M],
      'fill-extrusion-base': 0,
      'fill-extrusion-opacity': 0.9,
      'fill-extrusion-emissive-strength': 1, // glows at dusk and night instead of being shaded
    },
  });
  map.addLayer({
    id: 'target-building-outline',
    type: 'line',
    source: TARGET_SOURCE,
    slot: 'middle',
    paint: { 'line-color': NEON_GREEN, 'line-width': 2.5, 'line-emissive-strength': 1 },
  });
}

/**
 * Paints the neon footprint for a result (or clears it), and hides that
 * building in the regular 3D layer so the two don't flicker over each other.
 */
export function setHighlightedBuilding(map: MapboxMap, result: NavigateResponse) {
  (map.getSource(TARGET_SOURCE) as GeoJSONSource).setData(
    result.building ?? { type: 'FeatureCollection', features: [] },
  );
  const id = Number(result.building?.id); // Postgres bigint arrives as a string
  map.setFilter(BUILDINGS_LAYER, Number.isFinite(id) ? ['!=', ['id'], id] : null);
}

const INTERACTIONS = ['mousedown', 'touchstart', 'wheel', 'dragstart'] as const;

/**
 * Slowly circles the camera around the current center until the user touches
 * the map. Returns a function that stops it.
 */
export function startOrbit(map: MapboxMap, degreesPerSecond = 5) {
  if (prefersReducedMotion()) return () => {};
  let frame = 0;
  let last = performance.now();
  const step = (now: number) => {
    map.setBearing(map.getBearing() + (degreesPerSecond * (now - last)) / 1000);
    last = now;
    frame = requestAnimationFrame(step);
  };
  const stop = () => {
    cancelAnimationFrame(frame);
    for (const ev of INTERACTIONS) map.off(ev, stop);
  };
  for (const ev of INTERACTIONS) map.on(ev, stop);
  frame = requestAnimationFrame(step);
  return stop;
}

/** Breathing glow around the target building. Returns a function that stops it. */
export function startPulse(map: MapboxMap) {
  if (prefersReducedMotion()) return () => {};
  let frame = 0;
  let lastPaint = 0;
  const step = (now: number) => {
    if (now - lastPaint > 33 && map.getLayer('target-building-glow')) {
      lastPaint = now;
      const k = (Math.sin(now / 400) + 1) / 2; // ~2.5 s cycle
      map.setPaintProperty('target-building-glow', 'line-opacity', 0.3 + 0.55 * k);
      map.setPaintProperty('target-building-glow', 'line-width', 8 + 12 * k);
    }
    frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
  return () => cancelAnimationFrame(frame);
}

export function createPinElement() {
  const el = document.createElement('div');
  el.setAttribute('aria-label', 'Delivery point');
  el.style.cssText = `
    width: 18px; height: 18px; border-radius: 50% 50% 50% 0;
    background: ${NEON_GREEN}; transform: rotate(-45deg);
    box-shadow: 0 0 14px ${NEON_GREEN}; border: 2px solid #0b0f14;
  `;
  return el;
}

/** Marker for the entrance riders should use. */
export function createGateElement() {
  const el = document.createElement('div');
  el.setAttribute('aria-label', 'Gate');
  el.title = 'Gate';
  el.textContent = 'G';
  el.style.cssText = `
    width: 24px; height: 24px; border-radius: 6px; display: grid; place-items: center;
    font: 700 13px/1 system-ui, sans-serif; color: #0b0f14; background: #fbbf24;
    border: 2px solid #0b0f14; box-shadow: 0 0 0 3px rgba(251, 191, 36, 0.35), 0 0 12px rgba(251, 191, 36, 0.8);
    cursor: grab;
  `;
  return el;
}
