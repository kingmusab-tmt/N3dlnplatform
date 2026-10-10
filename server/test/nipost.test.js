import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { NipostError, createNipostClient, parsePoint } from '../src/lib/nipost.js';

function fakeFetch(handler) {
  const requests = [];
  const impl = async (url, init) => {
    requests.push({ url: new URL(url), headers: init.headers });
    const { status = 200, body } = handler(new URL(url));
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  };
  return { impl, requests };
}

describe('createNipostClient', () => {
  it('refuses publishable keys', () => {
    assert.throws(() => createNipostClient({ apiKey: 'nipost_pk_test_abc' }), /publishable/);
  });

  it('sends the hyphenated code, level and X-API-Key header', async () => {
    const f = fakeFetch(() => ({ body: { data: { postcode: 'FC-01-A01-KP-27', valid: true } } }));
    const client = createNipostClient({ apiKey: 'nipost_test_abc', level: 1, fetchImpl: f.impl });

    const result = await client.lookup('FC01A01KP27');

    assert.equal(f.requests[0].url.origin + f.requests[0].url.pathname, 'https://api.postcode.gov.ng/v1/lookup');
    assert.equal(f.requests[0].url.searchParams.get('code'), 'FC-01-A01-KP-27');
    assert.equal(f.requests[0].url.searchParams.get('level'), '1');
    assert.equal(f.requests[0].headers['X-API-Key'], 'nipost_test_abc');
    assert.deepEqual(result, {
      valid: true, postcode: 'FC-01-A01-KP-27', level: 1, point: null, address: null, buildingUse: null,
    });
  });

  it('detects test vs live keys from the prefix', () => {
    assert.equal(createNipostClient({ apiKey: 'nipost_test_abc' }).environment, 'test');
    assert.equal(createNipostClient({ apiKey: 'nipost_live_abc' }).environment, 'live');
  });

  it('caches lookups', async () => {
    const f = fakeFetch(() => ({ body: { data: { valid: true } } }));
    const client = createNipostClient({ apiKey: 'nipost_test_abc', fetchImpl: f.impl });
    await client.lookup('FC01A01KP27');
    await client.lookup('FC01A01KP27');
    assert.equal(f.requests.length, 1);
  });

  it('treats 404 as not registered', async () => {
    const f = fakeFetch(() => ({ status: 404, body: { error: { code: 'not_found', message: 'nope' } } }));
    const client = createNipostClient({ apiKey: 'nipost_test_abc', fetchImpl: f.impl });
    assert.equal((await client.lookup('FC01A01KP99')).valid, false);
  });

  it('surfaces auth errors as NipostError with NIPOST\'s error code', async () => {
    const f = fakeFetch(() => ({
      status: 401,
      body: { error: { code: 'invalid_api_key', message: 'the provided API key is invalid or revoked' } },
    }));
    const client = createNipostClient({ apiKey: 'nipost_test_bad', fetchImpl: f.impl });
    await assert.rejects(client.lookup('FC01A01KP27'), (err) => {
      assert.ok(err instanceof NipostError);
      assert.equal(err.code, 'invalid_api_key');
      assert.equal(err.httpStatus, 401);
      return true;
    });
  });

  it('wraps network failures', async () => {
    const client = createNipostClient({
      apiKey: 'nipost_test_abc',
      fetchImpl: async () => { throw new TypeError('fetch failed'); },
    });
    await assert.rejects(client.lookup('FC01A01KP27'), { name: 'NipostError', code: 'network_error' });
  });
});

describe('parsePoint', () => {
  it('reads GeoJSON, lng/lat objects and bare pairs', () => {
    assert.deepEqual(parsePoint({ type: 'Point', coordinates: [7.49, 9.05] }), [7.49, 9.05]);
    assert.deepEqual(parsePoint({ lat: 9.05, lng: 7.49 }), [7.49, 9.05]);
    assert.deepEqual(parsePoint({ latitude: 9.05, longitude: 7.49 }), [7.49, 9.05]);
    assert.deepEqual(parsePoint([7.49, 9.05]), [7.49, 9.05]);
  });

  it('rejects missing or out-of-range values', () => {
    assert.equal(parsePoint(null), null);
    assert.equal(parsePoint({}), null);
    assert.equal(parsePoint({ lat: 91, lng: 7 }), null);
  });
});
