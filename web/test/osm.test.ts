import { describe, expect, it } from 'vitest';
import { normalizePostcode } from '@/lib/postcode';
import { allocateCodes, buildOverpassQuery, elementsToBuildings, parseMetres, type OverpassElement } from '@/scripts/lib/osm';

const way = (id: number, lng: number, lat: number, tags: Record<string, string> = {}, nodes: number[] = []): OverpassElement => ({
  type: 'way',
  id,
  tags: { building: 'yes', ...tags },
  nodes,
  geometry: [
    { lon: lng, lat },
    { lon: lng, lat: lat + 0.0001 },
    { lon: lng + 0.0001, lat: lat + 0.0001 },
    { lon: lng + 0.0001, lat },
    { lon: lng, lat },
  ],
});
const ring = (lng: number, lat: number) => way(0, lng, lat).geometry!.map((p) => [p.lon, p.lat] as [number, number]);

describe('buildOverpassQuery', () => {
  it('orders the bbox as south,west,north,east', () => {
    expect(buildOverpassQuery([7.46, 9.06, 7.49, 9.08])).toMatch(/way\["building"\]\(9\.06,7\.46,9\.08,7\.49\)/);
  });
});

describe('parseMetres', () => {
  it('parses plain and suffixed values', () => {
    expect(parseMetres('12')).toBe(12);
    expect(parseMetres('12.5 m')).toBe(12.5);
    expect(parseMetres('tall')).toBeNull();
    expect(parseMetres(undefined)).toBeNull();
  });
});

describe('elementsToBuildings', () => {
  it('extracts footprint, height and metadata', () => {
    const { buildings } = elementsToBuildings([way(1, 7.47, 9.07, { building: 'commercial', name: 'Plaza', 'building:levels': '5' })]);
    expect(buildings).toHaveLength(1);
    expect(buildings[0].ring).toHaveLength(5);
    expect(buildings[0].metadata).toEqual({
      source: 'osm', code_source: 'simulated', building_type: 'commercial', name: 'Plaza', height_m: 16, floors: 5,
    });
  });

  it('drops the generic building=yes type and skips unclosed ways', () => {
    const open = way(2, 7.47, 9.07);
    open.geometry!.pop();
    const { buildings, skipped } = elementsToBuildings([way(1, 7.47, 9.07), open]);
    expect(buildings).toHaveLength(1);
    expect(buildings[0].metadata.building_type).toBeUndefined();
    expect(skipped).toBe(1);
  });

  it('picks the main entrance on the building outline as its gate', () => {
    const { buildings } = elementsToBuildings([
      { type: 'node', id: 10, lon: 7.47005, lat: 9.07, tags: { entrance: 'service' } },
      { type: 'node', id: 11, lon: 7.47, lat: 9.07005, tags: { entrance: 'main' } },
      way(1, 7.47, 9.07, {}, [10, 11]),
    ]);
    expect(buildings[0].metadata.gate).toEqual({ lng: 7.47, lat: 9.07005, type: 'main', source: 'osm' });
  });
});

describe('allocateCodes', () => {
  it('produces valid NIPOST codes, north-west first', () => {
    const out = allocateCodes([{ osm_id: 1, ring: ring(7.47, 9.07) }, { osm_id: 2, ring: ring(7.47, 9.08) }], { prefix: 'FC02SIM' });
    expect(out.map((b) => [b.osm_id, b.code])).toEqual([[2, 'FC02SIMAA01'], [1, 'FC02SIMAA02']]);
    for (const b of out) expect(normalizePostcode(b.code)).toBe(b.code);
  });

  it('rolls over to the next area after unit 99', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ osm_id: i + 1, ring: ring(7.47 + i * 1e-6, 9.07) }));
    const codes = allocateCodes(many, { prefix: 'FC02SIM' }).map((b) => b.code);
    expect(codes[98]).toBe('FC02SIMAA99');
    expect(codes[99]).toBe('FC02SIMAB01');
  });

  it('keeps existing codes stable and never reuses them', () => {
    const out = allocateCodes([{ osm_id: 1, ring: ring(7.47, 9.09) }, { osm_id: 2, ring: ring(7.47, 9.07) }], {
      prefix: 'FC02SIM',
      existing: new Map([[2, 'FC02SIMAA01']]),
    });
    const byId = Object.fromEntries(out.map((b) => [b.osm_id, b]));
    expect(byId[2]).toMatchObject({ code: 'FC02SIMAA01', isNew: false });
    expect(byId[1]).toMatchObject({ code: 'FC02SIMAA02', isNew: true });
  });
});
