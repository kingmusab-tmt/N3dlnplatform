import { describe, expect, it } from 'vitest';
import { buildingFacts, navigatorHref, parsePurpose } from '@/lib/purpose';

describe('purposes', () => {
  it('parses the ?for= value, defaulting to delivery', () => {
    expect(parsePurpose('fire')).toBe('fire');
    expect(parsePurpose('ambulance')).toBe('ambulance');
    expect(parsePurpose('taxi')).toBe('delivery');
    expect(parsePurpose(undefined)).toBe('delivery');
  });

  it('builds navigator links', () => {
    expect(navigatorHref('FC02SIMBP87')).toBe('/rider?code=FC02SIMBP87');
    expect(navigatorHref('FC02SIMBP87', { claim: 'abc', purpose: 'police' })).toBe('/rider?code=FC02SIMBP87&claim=abc&for=police');
    expect(navigatorHref('FC02SIMBP87', { purpose: 'delivery' })).toBe('/rider?code=FC02SIMBP87');
  });

  it('lists only recorded building facts', () => {
    expect(buildingFacts({ building_type: 'apartments', floors: 4, height_m: 12.8, street: 'Aminu Kano Cres.', house_number: '12' })).toEqual([
      { label: 'Street', value: '12 Aminu Kano Cres.' },
      { label: 'Type', value: 'apartments' },
      { label: 'Floors', value: '4' },
      { label: 'Height', value: '13 m' },
    ]);
    // render_height_m is the 3D map's estimate, not a fact.
    expect(buildingFacts({ render_height_m: 6.4 })).toEqual([]);
    expect(buildingFacts(null)).toEqual([]);
  });
});
