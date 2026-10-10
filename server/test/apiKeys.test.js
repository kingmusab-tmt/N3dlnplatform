import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { generateKey, hashKey } from '../src/lib/apiKeys.js';

const PARTNER = generateKey('partner');
const WEB = generateKey('first_party');
const REVOKED = generateKey('partner');

function createFakeDb() {
  const keys = {
    [PARTNER.hash]: { id: 1, name: 'Partner', kind: 'partner', rate_limit_per_min: 3 },
    [WEB.hash]: { id: 2, name: 'Web', kind: 'first_party', rate_limit_per_min: 120 },
  };
  const db = {
    lookups: 0,
    touches: 0,
    async query(sql, params) {
      if (sql.includes('FROM api_keys')) {
        db.lookups++;
        return { rows: keys[params[0]] ? [keys[params[0]]] : [] }; // revoked keys aren't returned
      }
      if (sql.includes('UPDATE api_keys')) {
        db.touches++;
        return { rows: [] };
      }
      return { rows: [] }; // no buildings: data routes answer 404
    },
  };
  return db;
}

describe('generateKey', () => {
  it('makes prefixed, high-entropy keys and hashes them', () => {
    assert.match(PARTNER.key, /^n3d_live_[A-Za-z0-9_-]{32}$/);
    assert.match(WEB.key, /^n3d_web_[A-Za-z0-9_-]{32}$/);
    assert.equal(PARTNER.hash, hashKey(PARTNER.key));
    assert.notEqual(generateKey().key, generateKey().key);
    assert.equal(PARTNER.displayPrefix, PARTNER.key.slice(0, 15));
  });
});

describe('apiKeyAuth', () => {
  const db = createFakeDb();
  let server;
  let base;
  before(async () => {
    server = createApp(db).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  const get = (path, headers = {}) => fetch(`${base}${path}`, { headers });
  const lookup = '/api/v1/navigate/FC02SIMBP88';

  it('leaves health and docs public', async () => {
    assert.equal((await get('/api/v1/health')).status, 200);
    assert.equal((await get('/api/v1/docs')).status, 200);
    assert.equal((await get('/api/v1/openapi.yaml')).status, 200);
  });

  it('rejects missing, malformed, unknown and revoked keys', async () => {
    const missing = await get(lookup);
    assert.equal(missing.status, 401);
    assert.equal((await missing.json()).error, 'API_KEY_REQUIRED');
    for (const key of ['nope', 'n3d_live_short', REVOKED.key]) {
      const res = await get(lookup, { 'X-API-Key': key });
      assert.equal(res.status, 401, key);
      assert.equal((await res.json()).error, 'INVALID_API_KEY');
    }
  });

  it('lets a valid key through with rate-limit headers, then limits it', async () => {
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const res = await get(lookup, { 'X-API-Key': PARTNER.key });
      statuses.push(res.status);
      if (i === 0) {
        assert.equal(res.headers.get('x-ratelimit-limit'), '3');
        assert.equal(res.headers.get('x-ratelimit-remaining'), '2');
      }
    }
    assert.deepEqual(statuses, [404, 404, 404, 429]); // 404 = authenticated, no such building
  });

  it('caches key lookups and throttles last_used_at writes', () => {
    // Partner key once (then cached) + the revoked key; malformed keys never reach the DB.
    assert.equal(db.lookups, 2);
    assert.equal(db.touches, 1);
  });

  it('limits first-party traffic per forwarded end-user IP', async () => {
    const asUser = (ip) => get(lookup, { 'X-API-Key': WEB.key, 'X-Forwarded-For': ip });
    const results = [];
    for (let i = 0; i < 61; i++) results.push((await asUser('203.0.113.7')).status);
    assert.equal(results.at(-2), 404);
    assert.equal(results.at(-1), 429); // 61st request from one user
    assert.equal((await asUser('198.51.100.9')).status, 404); // another user is unaffected
  });

  it('ignores X-Forwarded-For on partner keys', async () => {
    // The partner key is already over its limit; a spoofed IP must not reset it.
    const res = await get(lookup, { 'X-API-Key': PARTNER.key, 'X-Forwarded-For': '192.0.2.1' });
    assert.equal(res.status, 429);
  });
});
