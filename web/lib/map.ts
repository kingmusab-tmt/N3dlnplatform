// Map setup shared by the search map and the shared-place page.
import type { GeoJSONSource, Map as MapboxMap } from 'mapbox-gl';
import type { NavigateResponse } from './postcode';

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
export const NEON_GREEN = '#39FF14';
export const TARGET_SOURCE = 'target-building';
const DEFAULT_HEIGHT_M = 10;

/** Close-up camera for a resolved building: pitched to show the 3D extrusions. */
export function buildingCamera(center: [number, number]) {
  return { center, zoom: 18.2, pitch: 60, bearing: -20 };
}

/** Paints the neon footprint for a result (or clears it when there's no building). */
export function setHighlightedBuilding(map: MapboxMap, result: NavigateResponse) {
  (map.getSource(TARGET_SOURCE) as GeoJSONSource).setData(
    result.building ?? { type: 'FeatureCollection', features: [] },
  );
}


export function addBuildingLayers(map: MapboxMap) {
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
