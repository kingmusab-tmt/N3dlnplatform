// Map markers for the rider: a car, bicycle or walking person instead of a dot.
import type mapboxgl from 'mapbox-gl';
import type { RouteProfile } from './postcode';

// Top-down car and bicycle, nose pointing up (north) so marker rotation = heading.
const CAR_SVG = `<svg viewBox="0 0 28 46" width="32" height="52" aria-hidden="true">
  <rect x="3" y="2" width="22" height="42" rx="8" fill="#38bdf8" stroke="#fff" stroke-width="2"/>
  <path d="M7 13 Q14 8 21 13 L20 18 H8 Z" fill="#0c4a6e"/>
  <rect x="7" y="19" width="14" height="12" rx="2" fill="#7dd3fc"/>
  <path d="M8 33 H20 L21 37 Q14 40 7 37 Z" fill="#0c4a6e"/>
</svg>`;

const BICYCLE_SVG = `<svg viewBox="0 0 24 46" width="28" height="54" aria-hidden="true">
  <rect x="9.5" y="1" width="5" height="13" rx="2.5" fill="#0f172a" stroke="#fff" stroke-width="1.5"/>
  <rect x="9.5" y="32" width="5" height="13" rx="2.5" fill="#0f172a" stroke="#fff" stroke-width="1.5"/>
  <line x1="12" y1="13" x2="12" y2="33" stroke="#38bdf8" stroke-width="3"/>
  <line x1="3" y1="12" x2="21" y2="12" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
  <ellipse cx="12" cy="23" rx="7" ry="5" fill="#38bdf8" stroke="#fff" stroke-width="1.5"/>
  <circle cx="12" cy="18" r="3.5" fill="#fbbf24" stroke="#fff" stroke-width="1.2"/>
</svg>`;

// A person reads best upright (side view), so it stays facing the screen and
// mirrors to face left or right instead of rotating.
const WALKER_SVG = `<svg viewBox="0 0 26 38" width="34" height="50" aria-hidden="true">
  <g stroke="#fff" stroke-width="5.5" stroke-linecap="round" fill="none">
    <path d="M14 11 L12 22 M14 13 L19 18 M14 13 L9 17 M12 22 L17 31 M12 22 L8 32"/>
  </g>
  <g stroke="#38bdf8" stroke-width="3.2" stroke-linecap="round" fill="none">
    <path d="M14 11 L12 22 M14 13 L19 18 M14 13 L9 17 M12 22 L17 31 M12 22 L8 32"/>
  </g>
  <circle cx="14" cy="6" r="4.2" fill="#38bdf8" stroke="#fff" stroke-width="1.6"/>
</svg>`;

export type VehicleMarker = {
  profile: RouteProfile;
  marker: mapboxgl.Marker;
  /** Compass heading in degrees (0 = north). */
  setHeading: (heading: number) => void;
};

export function createVehicleMarker(mapbox: typeof mapboxgl, profile: RouteProfile): VehicleMarker {
  const el = document.createElement('div');
  el.setAttribute('aria-label', profile === 'walking' ? 'Rider on foot' : profile === 'cycling' ? 'Rider on a bicycle' : 'Rider vehicle');
  el.style.filter = 'drop-shadow(0 0 6px rgba(56, 189, 248, 0.9))';
  el.innerHTML = profile === 'walking' ? WALKER_SVG : profile === 'cycling' ? BICYCLE_SVG : CAR_SVG;

  if (profile === 'walking') {
    const marker = new mapbox.Marker({ element: el, anchor: 'bottom' });
    const svg = el.firstElementChild as SVGElement;
    return {
      profile,
      marker,
      // Facing west-ish (180-360°): mirror so the person walks to the left.
      setHeading: (heading) => {
        svg.style.transform = heading % 360 > 180 ? 'scaleX(-1)' : '';
      },
    };
  }

  // Lie flat on the map and rotate with it, like a real vehicle seen from above.
  const marker = new mapbox.Marker({ element: el, rotationAlignment: 'map', pitchAlignment: 'map' });
  return { profile, marker, setHeading: (heading) => marker.setRotation(heading) };
}
