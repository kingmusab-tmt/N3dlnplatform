import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';

const ROW = {
  id: 7,
  nipost_code: 'FC02SIMBP88',
  metadata: { name: 'Silverbird Cinemas', height_m: 12.8 },
  polygon: { type: 'Polygon', coordinates: [[[7.4853, 9.0675], [7.4853, 9.0677], [7.4856, 9.0677], [7.4856, 9.0675], [7.4853, 9.0675]]] },
  center: { type: 'Point', coordinates: [7.4854694, 9.0675872] },
  bbox: [7.4853, 9.0675, 7.4856, 9.0677],
  distance_m: 0,
};

function createFakeDb() {
  const claims = [];
  return {
    claims,
    async query(sql, params) {
      if (sql.includes('ST_MakePoint')) {
        const [lng, lat] = params;
        const hit = Math.abs(lng - 7.4855) < 0.0005 && Math.abs(lat - 9.0676) < 0.0005;
        return { rows: hit ? [ROW] : [] };
      }
      if (sql.includes('INSERT INTO claims')) {
        const [code, label, notes] = params;
        if (code !== ROW.nipost_code) return { rows: [] };
        const claim = { id: `uuid-${claims.length + 1}`, label, delivery_notes: notes, status: 'unverified', created_at: '2026-10-10T00:00:00Z' };
        claims.push(claim);
        return { rows: [claim] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
}

describe('/api/v1/buildings', () => {
  const db = createFakeDb();
  let server;
  let base;
  before(async () => {
    server = createApp(db, { claimLimit: { windowMs: 60_000, max: 4 } }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}/api/v1/buildings`;
  });
  after(() => server.close());

  const claim = (code, body) =>
    fetch(`${base}/${code}/claims`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  describe('GET /at', () => {
    it('returns the building under the pin with its own code', async () => {
      const res = await fetch(`${base}/at?lng=7.4855&lat=9.0676`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.code, 'FC02SIMBP88');
      assert.equal(body.formatted, 'FC 02 SIM BP 88');
      assert.equal(body.building.properties.name, 'Silverbird Cinemas');
      assert.deepEqual(body.pin, { lng: 7.4855, lat: 9.0676, distance_m: 0 });
    });

    it('404s on empty ground', async () => {
      const res = await fetch(`${base}/at?lng=7.40&lat=9.00`);
      assert.equal(res.status, 404);
      assert.equal((await res.json()).error, 'NO_BUILDING_HERE');
    });

    it('400s on bad coordinates', async () => {
      for (const q of ['lng=abc&lat=9', 'lng=7', 'lng=200&lat=9']) {
        assert.equal((await fetch(`${base}/at?${q}`)).status, 400, q);
      }
    });
  });

  describe('POST /:code/claims', () => {
    it('creates an unverified claim, accepting any code spelling', async () => {
      const res = await claim('fc-02-sim-bp-88', { label: '  Musa’s office ', delivery_notes: 'Gate 3, ask for Tunde' });
      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.code, 'FC02SIMBP88');
      assert.equal(body.label, 'Musa’s office');
      assert.equal(body.delivery_notes, 'Gate 3, ask for Tunde');
      assert.equal(body.status, 'unverified');
      assert.ok(body.id);
    });

    it('rejects missing or oversized fields', async () => {
      assert.equal((await claim('FC02SIMBP88', {})).status, 400);
      assert.equal((await claim('FC02SIMBP88', { label: 'x'.repeat(81) })).status, 400);
    });

    it('404s for codes with no building', async () => {
      assert.equal((await claim('FC02SIMZZ01', { label: 'Home' })).status, 404);
    });

    it('rate limits claim writes per IP', async () => {
      // 4 claim attempts above (valid or not) use up the limit of 4
      const res = await claim('FC02SIMBP88', { label: 'Home' });
      assert.equal(res.status, 429);
      assert.ok(res.headers.get('retry-after'));
    });
  });
});
