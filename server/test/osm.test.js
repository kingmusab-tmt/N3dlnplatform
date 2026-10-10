import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { allocateCodes, buildOverpassQuery, elementsToBuildings, parseMetres } from '../scripts/lib/osm.js';
import { normalizePostcode } from '../src/lib/postcode.js';

const way = (id, lng, lat, tags = {}, nodes = []) => ({
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

describe('buildOverpassQuery', () => {
  it('orders the bbox as south,west,north,east', () => {
    assert.match(buildOverpassQuery([7.46, 9.06, 7.49, 9.08]), /way\["building"\]\(9\.06,7\.46,9\.08,7\.49\)/);
  });
});

describe('parseMetres', () => {
  it('parses plain and suffixed values', () => {
    assert.equal(parseMetres('12'), 12);
    assert.equal(parseMetres('12.5 m'), 12.5);
    assert.equal(parseMetres('tall'), null);
    assert.equal(parseMetres(undefined), null);
  });
});

describe('elementsToBuildings', () => {
  it('extracts footprint, height and metadata', () => {
    const { buildings } = elementsToBuildings([way(1, 7.47, 9.07, { building: 'commercial', name: 'Plaza', 'building:levels': '5' })]);
    assert.equal(buildings.length, 1);
    assert.equal(buildings[0].osm_id, 1);
    assert.equal(buildings[0].ring.length, 5);
    assert.deepEqual(buildings[0].metadata, {
      source: 'osm', code_source: 'simulated', building_type: 'commercial', name: 'Plaza', height_m: 16, floors: 5,
    });
  });

  it('drops the generic building=yes type and skips unclosed ways', () => {
    const open = way(2, 7.47, 9.07);
    open.geometry.pop();
    const { buildings, skipped } = elementsToBuildings([way(1, 7.47, 9.07), open]);
    assert.equal(buildings.length, 1);
    assert.equal(buildings[0].metadata.building_type, undefined);
    assert.equal(skipped, 1);
  });

  it('picks the main entrance on the building outline as its gate', () => {
    const { buildings } = elementsToBuildings([
      { type: 'node', id: 10, lon: 7.47005, lat: 9.07, tags: { entrance: 'service' } },
      { type: 'node', id: 11, lon: 7.47, lat: 9.07005, tags: { entrance: 'main' } },
      way(1, 7.47, 9.07, {}, [10, 11]),
    ]);
    assert.deepEqual(buildings[0].metadata.gate, { lng: 7.47, lat: 9.07005, type: 'main', source: 'osm' });
  });
});

describe('allocateCodes', () => {
  const ring = (lng, lat) => way(0, lng, lat).geometry.map((p) => [p.lon, p.lat]);

  it('produces valid NIPOST codes, north-west first', () => {
    const out = allocateCodes(
      [
        { osm_id: 1, ring: ring(7.470, 9.070) }, // south
        { osm_id: 2, ring: ring(7.470, 9.080) }, // north
      ],
      { prefix: 'FC02SIM' },
    );
    assert.deepEqual(out.map((b) => [b.osm_id, b.code]), [[2, 'FC02SIMAA01'], [1, 'FC02SIMAA02']]);
    for (const b of out) assert.equal(normalizePostcode(b.code), b.code);
  });

  it('rolls over to the next area after unit 99', () => {
    const many = Array.from({ length: 100 }, (_, i) => ({ osm_id: i + 1, ring: ring(7.47 + i * 1e-6, 9.07) }));
    const codes = allocateCodes(many, { prefix: 'FC02SIM' }).map((b) => b.code);
    assert.equal(codes[98], 'FC02SIMAA99');
    assert.equal(codes[99], 'FC02SIMAB01');
  });

  it('keeps existing codes stable and never reuses them', () => {
    const existing = new Map([[2, 'FC02SIMAA01']]);
    const out = allocateCodes(
      [{ osm_id: 1, ring: ring(7.47, 9.09) }, { osm_id: 2, ring: ring(7.47, 9.07) }],
      { prefix: 'FC02SIM', existing },
    );
    const byId = Object.fromEntries(out.map((b) => [b.osm_id, b]));
    assert.equal(byId[2].code, 'FC02SIMAA01');
    assert.equal(byId[2].isNew, false);
    assert.equal(byId[1].code, 'FC02SIMAA02');
    assert.equal(byId[1].isNew, true);
  });
});
