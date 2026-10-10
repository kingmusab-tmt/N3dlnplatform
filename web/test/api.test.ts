// Endpoint behaviour, called as same-origin website requests (auth is covered in auth.test.ts).
import { describe, expect, it } from 'vitest';
import { POST as createClaim } from '@/app/api/v1/buildings/[code]/claims/route';
import { GET as buildingAt } from '@/app/api/v1/buildings/at/route';
import { GET as getClaim } from '@/app/api/v1/claims/[id]/route';
import { GET as navigate } from '@/app/api/v1/navigate/[code]/route';
import { GET as routeTo } from '@/app/api/v1/navigate/[code]/route/route';
import { GET as tile } from '@/app/api/v1/tiles/buildings/[z]/[x]/[y]/route';
import { hyphenatePostcode } from '@/lib/postcode';
import { DirectionsError } from '@/lib/server/directions';
import { NipostError, type NipostClient } from '@/lib/server/nipost';
import { ROW, call, useDeps } from './helpers';

const square = (lng: number, lat: number) => ({
  type: 'Polygon',
  coordinates: [[[lng, lat], [lng, lat + 0.0002], [lng + 0.0002, lat + 0.0002], [lng + 0.0002, lat], [lng, lat]]],
});

/** Fake DB: ROW is the only building; point lookups hit it near (7.4855, 9.0676). */
function buildingsDb() {
  const calls: unknown[][] = [];
  return {
    calls,
    async query(sql: string, params: any[] = []) {
      calls.push(params);
      if (sql.includes('nipost_code = $1')) return { rows: params[0] === ROW.nipost_code ? [ROW] : [] };
      if (sql.includes('ST_MakePoint')) {
        const [lng, lat] = params;
        const hit = Math.abs(lng - 7.4855) < 0.001 && Math.abs(lat - 9.0676) < 0.001;
        return { rows: hit ? [ROW] : [] };
      }
      return { rows: [] };
    },
  };
}

/** Fake NIPOST: `registry` maps canonical code -> point (null for an L1-only valid code). */
function fakeNipost(
  registry: Record<string, [number, number] | null>,
  { level = 1, environment = 'live' as 'test' | 'live', failWith = null as Error | null } = {},
): NipostClient {
  return {
    level,
    environment,
    async lookup(code) {
      if (failWith) throw failWith;
      const known = Object.hasOwn(registry, code);
      return { valid: known, postcode: hyphenatePostcode(code), level, point: known ? registry[code] : null, address: null, buildingUse: null };
    },
  };
}

const nav = (code: string) => call(navigate, `/api/v1/navigate/${code}`, { params: { code } });

describe('GET /api/v1/navigate/:code', () => {
  it('returns GeoJSON for a dashed code, unverified without NIPOST', async () => {
    const db = buildingsDb();
    useDeps({ db });
    const res = await nav('fc-02-sim-bp-88');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(db.calls[0]).toEqual(['FC02SIMBP88']);
    expect(body).toMatchObject({ code: 'FC02SIMBP88', formatted: 'FC 02 SIM BP 88', source: 'platform' });
    expect(body.center).toEqual([7.4854694, 9.0675872]);
    expect(body.building.geometry.type).toBe('Polygon');
    expect(body.building.properties.height_m).toBe(12.8);
    expect(body.verification.status).toBe('not_configured');
  });

  it('400s on malformed codes without touching the DB', async () => {
    const db = buildingsDb();
    useDeps({ db });
    const res = await nav('not-a-code');
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('INVALID_POSTCODE');
    expect(db.calls).toHaveLength(0);
  });

  it('marks a mapped, NIPOST-registered code as verified', async () => {
    useDeps({ db: buildingsDb(), nipost: fakeNipost({ FC02SIMBP88: null }) });
    expect((await (await nav('FC02SIMBP88')).json()).verification).toMatchObject({ status: 'verified', level: 1 });
  });

  it('reports a valid but unmapped NIPOST code as POSTCODE_NOT_MAPPED', async () => {
    useDeps({ db: buildingsDb(), nipost: fakeNipost({ FC01A01KP27: null }) });
    const res = await nav('FC-01-A01-KP-27');
    expect(res.status).toBe(404);
    expect(await res.json()).toMatchObject({ error: 'POSTCODE_NOT_MAPPED', verification: { status: 'verified' } });
  });

  it('reports unknown codes as unregistered under a live key', async () => {
    useDeps({ db: buildingsDb(), nipost: fakeNipost({}) });
    const body = await (await nav('EK01A03FK99')).json();
    expect(body).toMatchObject({ error: 'POSTCODE_NOT_FOUND', verification: { status: 'unregistered' } });
    expect(body.message).toMatch(/not a registered NIPOST postcode/);
  });

  it("doesn't claim a code is unregistered when only NIPOST's sandbox was checked", async () => {
    useDeps({ db: buildingsDb(), nipost: fakeNipost({}, { environment: 'test' }) });
    const body = await (await nav('OS30A09ED02')).json();
    expect(body.verification).toMatchObject({ status: 'not_in_sandbox', environment: 'test' });
    expect(body.message).toMatch(/test sandbox/);
  });

  it('still serves mapped buildings when NIPOST is down', async () => {
    useDeps({ db: buildingsDb(), nipost: fakeNipost({}, { failWith: new NipostError('network_error', 'boom', 0) }) });
    const res = await nav('FC02SIMBP88');
    expect(res.status).toBe(200);
    expect((await res.json()).verification).toMatchObject({ status: 'unavailable', reason: 'network_error' });
  });

  it("snaps a NIPOST level-5 point to the footprint under it, or returns the bare point", async () => {
    useDeps({ db: buildingsDb(), nipost: fakeNipost({ LA05ABCKD14: [7.4855, 9.0676], LA05ABCKD15: [3.35, 6.6] }, { level: 5 }) });
    const snapped = await (await nav('LA05ABCKD14')).json();
    expect(snapped).toMatchObject({ source: 'nipost', code: 'LA05ABCKD14', nipostPoint: [7.4855, 9.0676], footprintMatch: { distance_m: 0 } });
    expect(snapped.building.properties.nipost_code).toBe('LA05ABCKD14');

    const bare = await (await nav('LA05ABCKD15')).json();
    expect(bare.building).toBeNull();
    expect(bare.center).toEqual([3.35, 6.6]);
  });
});

describe('GET /api/v1/navigate/:code/route', () => {
  const directionsCalls: unknown[] = [];
  const directions = {
    async route(from: [number, number], to: [number, number], profile = 'driving') {
      directionsCalls.push({ from, to, profile });
      if (from[0] === 0) throw new DirectionsError('no_route', 'No road route found between these points.', 422);
      return {
        geometry: { type: 'LineString' as const, coordinates: [from, to] },
        distance_m: 4005,
        duration_s: 491,
        steps: [],
        snappedDestination: { point: [7.4857, 9.0678] as [number, number], offset_m: 42 },
      };
    },
  };
  const routeFor = (code: string, query: string) =>
    call(routeTo, `/api/v1/navigate/${code}/route${query}`, { params: { code } });

  it('routes to the building center with an on-foot last mile', async () => {
    useDeps({ db: buildingsDb(), directions });
    const res = await routeFor('fc-02-sim-bp-88', '?from=7.47,9.07');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(directionsCalls.at(-1)).toEqual({ from: [7.47, 9.07], to: [7.4854694, 9.0675872], profile: 'driving' });
    expect(body.destination).toEqual({ point: [7.4854694, 9.0675872], kind: 'center' });
    expect(body.route.distance_m).toBe(4005);
    expect(body.route.snappedDestination).toBeUndefined();
    expect(body.lastMile.geometry.coordinates).toEqual([[7.4857, 9.0678], [7.4854694, 9.0675872]]);
    expect(body.lastMile.distance_m).toBeGreaterThan(30);
  });

  it('routes to the gate when one is mapped', async () => {
    const gated = { ...ROW, metadata: { gate: { lng: 7.4854, lat: 9.0675 } } };
    useDeps({ db: { query: async () => ({ rows: [gated] }) }, directions });
    const body = await (await routeFor('FC02SIMBP88', '?from=7.47,9.07&profile=cycling')).json();
    expect(body.destination).toEqual({ point: [7.4854, 9.0675], kind: 'gate' });
    expect(directionsCalls.at(-1)).toMatchObject({ profile: 'cycling' });
  });

  it('validates input and reports routing failures', async () => {
    useDeps({ db: buildingsDb(), directions });
    expect((await routeFor('FC02SIMBP88', '')).status).toBe(400);
    expect((await routeFor('FC02SIMBP88', '?from=abc')).status).toBe(400);
    expect((await routeFor('FC02SIMBP88', '?from=7.47,9.07&profile=flying')).status).toBe(400);
    expect((await routeFor('FC02SIMZZ99', '?from=7.47,9.07')).status).toBe(404);
    const failed = await routeFor('FC02SIMBP88', '?from=0,0');
    expect(failed.status).toBe(422);
    expect((await failed.json()).error).toBe('NO_ROUTE');
  });

  it('returns 503 when routing is not configured', async () => {
    useDeps({ db: buildingsDb() });
    expect((await routeFor('FC02SIMBP88', '?from=7.47,9.07')).status).toBe(503);
  });
});

describe('GET /api/v1/buildings/at', () => {
  it('returns the building under the pin with its own code', async () => {
    useDeps({ db: buildingsDb() });
    const res = await call(buildingAt, '/api/v1/buildings/at?lng=7.4855&lat=9.0676');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ code: 'FC02SIMBP88', formatted: 'FC 02 SIM BP 88', pin: { lng: 7.4855, lat: 9.0676, distance_m: 0 } });
  });

  it('404s on empty ground and 400s on bad coordinates', async () => {
    useDeps({ db: buildingsDb() });
    const empty = await call(buildingAt, '/api/v1/buildings/at?lng=7.40&lat=9.00');
    expect(empty.status).toBe(404);
    expect((await empty.json()).error).toBe('NO_BUILDING_HERE');
    for (const q of ['lng=abc&lat=9', 'lng=7', 'lng=200&lat=9']) {
      expect((await call(buildingAt, `/api/v1/buildings/at?${q}`)).status).toBe(400);
    }
  });
});

describe('claims', () => {
  const CLAIM_ID = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
  function claimsDb() {
    const inserted: unknown[][] = [];
    return {
      inserted,
      async query(sql: string, params: any[] = []) {
        if (sql.includes('INSERT INTO claims')) {
          inserted.push(params);
          if (params[0] !== ROW.nipost_code) return { rows: [] };
          return { rows: [{ id: CLAIM_ID, label: params[1], delivery_notes: params[2], status: 'unverified', created_at: '2026-10-10T00:00:00Z' }] };
        }
        if (sql.includes('FROM claims c')) {
          return params[0] === CLAIM_ID
            ? { rows: [{ ...ROW, claim_id: CLAIM_ID, label: 'Home', delivery_notes: 'Blue gate', status: 'unverified', created_at: '2026-10-10T00:00:00Z' }] }
            : { rows: [] };
        }
        return { rows: [] };
      },
    };
  }
  const claim = (code: string, body: unknown) =>
    call(createClaim, `/api/v1/buildings/${code}/claims`, { method: 'POST', params: { code }, body });

  it('creates an unverified claim, trimming input and accepting any code spelling', async () => {
    useDeps({ db: claimsDb() });
    const res = await claim('fc-02-sim-bp-88', { label: '  Musa’s office ', delivery_notes: 'Gate 3, ask for Tunde' });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ id: CLAIM_ID, code: 'FC02SIMBP88', label: 'Musa’s office', delivery_notes: 'Gate 3, ask for Tunde', status: 'unverified' });
  });

  it('rejects bad input, unknown codes, and too many claims per hour', async () => {
    useDeps({ db: claimsDb() });
    expect((await claim('FC02SIMBP88', {})).status).toBe(400);
    expect((await claim('FC02SIMBP88', { label: 'x'.repeat(81) })).status).toBe(400);
    expect((await claim('FC02SIMBP88', 'not json')).status).toBe(400);
    expect((await claim('FC02SIMZZ01', { label: 'Home' })).status).toBe(404);
    for (let i = 4; i < 20; i++) await claim('FC02SIMBP88', { label: 'Home' });
    const limited = await claim('FC02SIMBP88', { label: 'Home' }); // 21st attempt this hour
    expect(limited.status).toBe(429);
    expect(limited.headers.get('retry-after')).toBeTruthy();
  });

  it('serves a shared place by id, uncached', async () => {
    useDeps({ db: claimsDb() });
    const res = await call(getClaim, `/api/v1/claims/${CLAIM_ID}`, { params: { id: CLAIM_ID } });
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    const body = await res.json();
    expect(body.formatted).toBe('FC 02 SIM BP 88');
    expect(body.claim).toMatchObject({ id: CLAIM_ID, label: 'Home', delivery_notes: 'Blue gate' });
  });

  it('404s for unknown and malformed ids', async () => {
    useDeps({ db: claimsDb() });
    for (const id of ['00000000-0000-0000-0000-000000000000', 'not-a-uuid']) {
      expect((await call(getClaim, `/api/v1/claims/${id}`, { params: { id } })).status).toBe(404);
    }
  });
});

describe('GET /api/v1/tiles/buildings/:z/:x/:y', () => {
  const MVT = Buffer.from([0x1a, 0x02, 0x08, 0x01]);
  const tileFor = (z: number, x: number, y: string) =>
    call(tile, `/api/v1/tiles/buildings/${z}/${x}/${y}`, { params: { z: String(z), x: String(x), y }, web: false });

  it('serves a cacheable vector tile without an API key', async () => {
    const queries: unknown[][] = [];
    useDeps({ db: { query: async (_sql, params = []) => (queries.push(params), { rows: [{ mvt: MVT }] }) } });
    const res = await tileFor(15, 17065, '15555.mvt');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/vnd.mapbox-vector-tile');
    expect(res.headers.get('cache-control')).toMatch(/public/);
    expect(Buffer.from(await res.arrayBuffer())).toEqual(MVT);
    expect(queries[0]).toEqual([15, 17065, 15555]);
  });

  it('returns 204 for empty tiles and low zooms without querying', async () => {
    const queries: unknown[] = [];
    useDeps({ db: { query: async (sql) => (queries.push(sql), { rows: [{ mvt: Buffer.alloc(0) }] }) } });
    expect((await tileFor(15, 17065, '15555')).status).toBe(204);
    expect((await tileFor(10, 533, '486.mvt')).status).toBe(204);
    expect(queries).toHaveLength(1);
  });

  it('rejects out-of-range tile coordinates', async () => {
    useDeps({ db: { query: async () => ({ rows: [] }) } });
    for (const [z, x, y] of [[15, 99999, '1'], [15, 1, '-1'], [23, 0, '0'], [15, 1, 'abc']] as const) {
      expect((await tileFor(z, x, y)).status).toBe(400);
    }
  });
});
