import { afterEach, describe, expect, it, vi } from 'vitest';
import { getMapModeChoice, prefersLiteMap, resolveMapMode, setMapModeChoice } from '@/lib/mapMode';

function fakeBrowser({ saveData = false, effectiveType = '4g', deviceMemory = 8 } = {}) {
  const store = new Map<string, string>();
  vi.stubGlobal('navigator', { connection: { saveData, effectiveType }, deviceMemory });
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('map mode', () => {
  it('defaults to the full 3D map on capable devices', () => {
    fakeBrowser();
    expect(prefersLiteMap()).toBe(false);
    expect(resolveMapMode()).toEqual({ mode: 'full', automatic: true });
  });

  it('picks lite automatically for data saver, 2G, or low-memory phones', () => {
    for (const device of [{ saveData: true }, { effectiveType: '2g' }, { effectiveType: 'slow-2g' }, { deviceMemory: 2 }]) {
      fakeBrowser(device);
      expect(resolveMapMode(), JSON.stringify(device)).toEqual({ mode: 'lite', automatic: true });
    }
  });

  it('remembers a manual choice over the automatic one, and can go back to auto', () => {
    fakeBrowser({ saveData: true });
    setMapModeChoice('full');
    expect(resolveMapMode()).toEqual({ mode: 'full', automatic: false });
    setMapModeChoice('auto');
    expect(getMapModeChoice()).toBe('auto');
    expect(resolveMapMode().mode).toBe('lite');
  });

  it('survives storage being unavailable', () => {
    vi.stubGlobal('navigator', {});
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('blocked'); }, setItem: () => { throw new Error('blocked'); }, removeItem: () => {} });
    expect(() => setMapModeChoice('lite')).not.toThrow();
    expect(resolveMapMode()).toEqual({ mode: 'full', automatic: true });
  });
});
