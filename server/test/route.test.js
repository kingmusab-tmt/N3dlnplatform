import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { DirectionsError, createDirectionsClient } from '../src/lib/directions.js';

const MAPBOX_OK = {
  code: 'Ok',
  routes: [{
    geometry: { type: 'LineString', coordinates: [[7.47, 9.07], [7.48, 9.068], [7.4857, 9.0678]] },
    distance: 4005.3,
    duration: 491.2,
    legs: [{ steps: [
      { distance: 220.9, name: 'Sani Abacha Way', maneuver: { instruction: 'Drive west on Sani Abacha Way.', type: 'depart', location: [7.47, 9.07] } },
      { distance: 0, name: '', maneuver: { instruction: 'You have arrived.', type: 'arrive', location: [7.4857, 9.0678] } },
    ] }],
  }],
  waypoints: [{ location: [7.47, 9.0697], distance: 31.2 }, { location: [7.4857, 9.0678], distance: 41.5 }],
};

describe('createDirectionsClient', () => {
  it('calls Mapbox with lng,lat pairs and normalises the route', async () => {
    let calledUrl;
    const client = createDirectionsClient({
      accessToken: 'pk.test',
      fetchImpl: async (url) => {
        calledUrl = new URL(url);
        return new Response(JSON.stringify(MAPBOX_OK), { status: 200 });
      },
    });
    const route = await client.route([7.47, 9.07], [7.4854694, 9.0675872]);

    assert.equal(calledUrl.pathname, '/directions/v5/mapbox/driving/7.47,9.07;7.4854694,9.0675872');
    assert.equal(calledUrl.searchParams.get('geometries'), 'geojson');
    assert.equal(route.distance_m, 4005);
    assert.equal(route.duration_s, 491);
    assert.equal(route.steps[0].instruction, 'Drive west on Sani Abacha Way.');
    assert.deepEqual(route.snappedDestination, { point: [7.4857, 9.0678], offset_m: 42 });
  });

  it('maps NoRoute to a 422 DirectionsError', async () => {
    const client = createDirectionsClient({
      accessToken: 'pk.test',
      fetchImpl: async () => new Response(JSON.stringify({ code: 'NoRoute' }), { status: 200 }),
    });
    await assert.rejects(client.route([0, 0], [1, 1]), { name: 'DirectionsError', code: 'no_route', httpStatus: 422 });
  });
});

const ROW = (metadata) => ({
  id: 7,
  nipost_code: 'FC02SIMBP88',
  metadata,
  polygon: { type: 'Polygon', coordinates: [[[7.4853, 9.0675], [7.4853, 9.0677], [7.4856, 9.0677], [7.4856, 9.0675], [7.4853, 9.0675]]] },
  center: { type: 'Point', coordinates: [7.4854694, 9.0675872] },
  bbox: [7.4853, 9.0675, 7.4856, 9.0677],
});

describe('GET /api/v1/navigate/:code/route', () => {
  const calls = [];
  const directions = {
    async route(from, to, profile) {
      calls.push({ from, to, profile });
      if (from[0] === 0) throw new DirectionsError('no_route', 'No road route found between these points.', 422);
      return {
        geometry: MAPBOX_OK.routes[0].geometry,
        distance_m: 4005,
        duration_s: 491,
        steps: [],
        snappedDestination: { point: [7.4857, 9.0678], offset_m: 42 },
      };
    },
  };
  const db = {
    async query(_sql, [code]) {
      if (code === 'FC02SIMBP88') return { rows: [ROW({ name: 'Silverbird' })] };
      if (code === 'FC02SIMAA01') return { rows: [ROW({ gate: { lng: 7.4854, lat: 9.0675 } })] };
      return { rows: [] };
    },
  };

  let server;
  let base;
  before(async () => {
    server = createApp(db, { directions }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}/api/v1/navigate`;
  });
  after(() => server.close());

  it('routes to the building center with an on-foot last mile', async () => {
    const res = await fetch(`${base}/fc-02-sim-bp-88/route?from=7.47,9.07`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(calls.at(-1), { from: [7.47, 9.07], to: [7.4854694, 9.0675872], profile: 'driving' });
    assert.deepEqual(body.destination, { point: [7.4854694, 9.0675872], kind: 'center' });
    assert.equal(body.route.distance_m, 4005);
    assert.equal(body.route.snappedDestination, undefined);
    assert.deepEqual(body.lastMile.geometry.coordinates, [[7.4857, 9.0678], [7.4854694, 9.0675872]]);
    assert.ok(body.lastMile.distance_m > 30 && body.lastMile.distance_m < 50);
    assert.equal(body.building.properties.name, 'Silverbird');
  });

  it('routes to the gate when one is mapped', async () => {
    const body = await (await fetch(`${base}/FC02SIMAA01/route?from=7.47,9.07&profile=cycling`)).json();
    assert.deepEqual(body.destination, { point: [7.4854, 9.0675], kind: 'gate' });
    assert.equal(calls.at(-1).profile, 'cycling');
  });

  it('validates input', async () => {
    assert.equal((await fetch(`${base}/FC02SIMBP88/route`)).status, 400);
    assert.equal((await fetch(`${base}/FC02SIMBP88/route?from=abc`)).status, 400);
    assert.equal((await fetch(`${base}/FC02SIMBP88/route?from=7.47,9.07&profile=flying`)).status, 400);
    assert.equal((await fetch(`${base}/FC02SIMZZ99/route?from=7.47,9.07`)).status, 404);
  });

  it('passes through routing failures', async () => {
    const res = await fetch(`${base}/FC02SIMBP88/route?from=0,0`);
    assert.equal(res.status, 422);
    assert.equal((await res.json()).error, 'NO_ROUTE');
  });
});

describe('route endpoint without routing configured', () => {
  it('returns 503', async () => {
    const server = createApp({ query: async () => ({ rows: [] }) }).listen(0);
    await new Promise((r) => server.once('listening', r));
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/navigate/FC02SIMBP88/route?from=7.47,9.07`);
    server.close();
    assert.equal(res.status, 503);
  });
});
