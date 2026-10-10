// Pure helpers and external-service clients: postcode format, NIPOST, Mapbox Directions.
import { describe, expect, it } from 'vitest';
import { formatPostcode, hyphenatePostcode, normalizePostcode } from '@/lib/postcode';
import { DirectionsError, createDirectionsClient } from '@/lib/server/directions';
import { NipostError, createNipostClient, parsePoint } from '@/lib/server/nipost';

describe('normalizePostcode', () => {
  it('treats spaced, dashed and compact forms the same', () => {
    for (const input of ['FC 02 A09 DB 09', 'FC-02-A09-DB-09', 'fc02a09db09', ' FC02A09DB09 ']) {
      expect(normalizePostcode(input)).toBe('FC02A09DB09');
    }
  });

  it('accepts any 3 alphanumerics in the district segment', () => {
    expect(normalizePostcode('LA-05-1B2-KD-14')).toBe('LA051B2KD14');
    expect(normalizePostcode('FC 02 SIM BP 88')).toBe('FC02SIMBP88');
  });

  it('rejects malformed codes', () => {
    for (const input of ['', 'FC02A09DB0', 'FC02A09DB091', '0C02A09DB09', 'FC00A09DB09', 'FC02A09DB00', 'FC02A09D109', null, 42]) {
      expect(normalizePostcode(input)).toBeNull();
    }
  });

  it('formats canonical codes for display and for NIPOST', () => {
    expect(formatPostcode('FC02A09DB09')).toBe('FC 02 A09 DB 09');
    expect(hyphenatePostcode('FC02A09DB09')).toBe('FC-02-A09-DB-09');
  });
});

function fakeFetch(handler: (url: URL) => { status?: number; body: unknown }) {
  const requests: { url: URL; headers: Record<string, string> }[] = [];
  const impl = (async (url: URL | string, init?: RequestInit) => {
    requests.push({ url: new URL(url), headers: init?.headers as Record<string, string> });
    const { status = 200, body } = handler(new URL(url));
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { impl, requests };
}

describe('createNipostClient', () => {
  it('refuses publishable keys', () => {
    expect(() => createNipostClient({ apiKey: 'nipost_pk_test_abc' })).toThrow(/publishable/);
  });

  it('sends the hyphenated code, level and X-API-Key header', async () => {
    const f = fakeFetch(() => ({ body: { data: { postcode: 'FC-01-A01-KP-27', valid: true } } }));
    const client = createNipostClient({ apiKey: 'nipost_test_abc', fetchImpl: f.impl });
    const result = await client.lookup('FC01A01KP27');

    expect(f.requests[0].url.pathname).toBe('/v1/lookup');
    expect(f.requests[0].url.searchParams.get('code')).toBe('FC-01-A01-KP-27');
    expect(f.requests[0].url.searchParams.get('level')).toBe('1');
    expect(f.requests[0].headers['X-API-Key']).toBe('nipost_test_abc');
    expect(result).toEqual({ valid: true, postcode: 'FC-01-A01-KP-27', level: 1, point: null, address: null, buildingUse: null });
  });

  it('detects test vs live keys from the prefix', () => {
    expect(createNipostClient({ apiKey: 'nipost_test_abc' }).environment).toBe('test');
    expect(createNipostClient({ apiKey: 'nipost_live_abc' }).environment).toBe('live');
  });

  it('caches lookups', async () => {
    const f = fakeFetch(() => ({ body: { data: { valid: true } } }));
    const client = createNipostClient({ apiKey: 'nipost_test_abc', fetchImpl: f.impl });
    await client.lookup('FC01A01KP27');
    await client.lookup('FC01A01KP27');
    expect(f.requests).toHaveLength(1);
  });

  it('treats 404 as not registered', async () => {
    const f = fakeFetch(() => ({ status: 404, body: { error: { code: 'not_found', message: 'nope' } } }));
    const client = createNipostClient({ apiKey: 'nipost_test_abc', fetchImpl: f.impl });
    expect((await client.lookup('FC01A01KP99')).valid).toBe(false);
  });

  it("surfaces auth errors as NipostError with NIPOST's error code", async () => {
    const f = fakeFetch(() => ({ status: 401, body: { error: { code: 'invalid_api_key', message: 'revoked' } } }));
    const client = createNipostClient({ apiKey: 'nipost_test_bad', fetchImpl: f.impl });
    await expect(client.lookup('FC01A01KP27')).rejects.toMatchObject({ name: 'NipostError', code: 'invalid_api_key', httpStatus: 401 });
  });

  it('wraps network failures', async () => {
    const client = createNipostClient({
      apiKey: 'nipost_test_abc',
      fetchImpl: (async () => {
        throw new TypeError('fetch failed');
      }) as typeof fetch,
    });
    await expect(client.lookup('FC01A01KP27')).rejects.toBeInstanceOf(NipostError);
  });
});

describe('parsePoint', () => {
  it('reads GeoJSON, lng/lat objects and bare pairs', () => {
    expect(parsePoint({ type: 'Point', coordinates: [7.49, 9.05] })).toEqual([7.49, 9.05]);
    expect(parsePoint({ lat: 9.05, lng: 7.49 })).toEqual([7.49, 9.05]);
    expect(parsePoint({ latitude: 9.05, longitude: 7.49 })).toEqual([7.49, 9.05]);
    expect(parsePoint([7.49, 9.05])).toEqual([7.49, 9.05]);
  });

  it('rejects missing or out-of-range values', () => {
    expect(parsePoint(null)).toBeNull();
    expect(parsePoint({})).toBeNull();
    expect(parsePoint({ lat: 91, lng: 7 })).toBeNull();
  });
});

export const MAPBOX_OK = {
  code: 'Ok',
  routes: [
    {
      geometry: { type: 'LineString', coordinates: [[7.47, 9.07], [7.48, 9.068], [7.4857, 9.0678]] },
      distance: 4005.3,
      duration: 491.2,
      legs: [
        {
          steps: [
            { distance: 220.9, name: 'Sani Abacha Way', maneuver: { instruction: 'Drive west on Sani Abacha Way.', type: 'depart', location: [7.47, 9.07] } },
            { distance: 0, name: '', maneuver: { instruction: 'You have arrived.', type: 'arrive', location: [7.4857, 9.0678] } },
          ],
        },
      ],
    },
  ],
  waypoints: [{ location: [7.47, 9.0697], distance: 31.2 }, { location: [7.4857, 9.0678], distance: 41.5 }],
};

describe('createDirectionsClient', () => {
  it('calls Mapbox with lng,lat pairs and normalises the route', async () => {
    const f = fakeFetch(() => ({ body: MAPBOX_OK }));
    const client = createDirectionsClient({ accessToken: 'pk.test', fetchImpl: f.impl });
    const route = await client.route([7.47, 9.07], [7.4854694, 9.0675872]);

    expect(f.requests[0].url.pathname).toBe('/directions/v5/mapbox/driving/7.47,9.07;7.4854694,9.0675872');
    expect(f.requests[0].url.searchParams.get('geometries')).toBe('geojson');
    expect(route.distance_m).toBe(4005);
    expect(route.duration_s).toBe(491);
    expect(route.steps[0].instruction).toBe('Drive west on Sani Abacha Way.');
    expect(route.snappedDestination).toEqual({ point: [7.4857, 9.0678], offset_m: 42 });
  });

  it('maps NoRoute to a 422 DirectionsError', async () => {
    const f = fakeFetch(() => ({ body: { code: 'NoRoute' } }));
    const client = createDirectionsClient({ accessToken: 'pk.test', fetchImpl: f.impl });
    await expect(client.route([0, 0], [1, 1])).rejects.toMatchObject({ code: 'no_route', httpStatus: 422 });
    await expect(client.route([0, 0], [1, 1])).rejects.toBeInstanceOf(DirectionsError);
  });
});
