// "3D" (the full scene) or "Lite" (flat, lighter map) for budget phones and
// limited data. Automatic by default; a manual choice is remembered per device.

export type MapMode = 'full' | 'lite';
export type MapModeChoice = MapMode | 'auto';

const STORAGE_KEY = 'n3d:mapMode';

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

/**
 * Whether this device should get the lite map by default: the user asked the
 * browser to save data, the connection is 2G, or the phone has ≤2 GB of RAM.
 */
export function prefersLiteMap(): boolean {
  if (typeof navigator === 'undefined') return false;
  const nav = navigator as Navigator & { connection?: NetworkInformation; deviceMemory?: number };
  const conn = nav.connection;
  if (conn?.saveData) return true;
  if (conn?.effectiveType === 'slow-2g' || conn?.effectiveType === '2g') return true;
  return typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 2;
}

export function getMapModeChoice(): MapModeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'full' || v === 'lite' ? v : 'auto';
  } catch {
    return 'auto';
  }
}

export function setMapModeChoice(choice: MapModeChoice) {
  try {
    if (choice === 'auto') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Private mode etc.: the choice just won't be remembered.
  }
}

/** The mode to use now: the saved choice, or the automatic one. */
export function resolveMapMode(): { mode: MapMode; automatic: boolean } {
  const choice = getMapModeChoice();
  if (choice !== 'auto') return { mode: choice, automatic: false };
  return { mode: prefersLiteMap() ? 'lite' : 'full', automatic: true };
}
