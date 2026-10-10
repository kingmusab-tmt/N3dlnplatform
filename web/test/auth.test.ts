import { describe, expect, it } from 'vitest';
import { GET as health } from '@/app/api/v1/health/route';
import { GET as navigate } from '@/app/api/v1/navigate/[code]/route';
import { generateKey, hashKey } from '@/lib/server/apiKeys';
import { WEB_LIMIT_PER_MIN } from '@/lib/server/http';
import { call, useDeps } from './helpers';

const PARTNER = generateKey();
const REVOKED = generateKey();

function keysDb() {
  const db = {
    lookups: 0,
    touches: 0,
    async query(sql: string, params: any[] = []) {
      if (sql.includes('FROM api_keys')) {
        db.lookups++;
        // Revoked keys are filtered out by the query, so they come back empty.
        return { rows: params[0] === PARTNER.hash ? [{ id: 1, name: 'Partner', rate_limit_per_min: 3 }] : [] };
      }
      if (sql.includes('UPDATE api_keys')) {
        db.touches++;
        return { rows: [] };
      }
      return { rows: [] }; // no buildings: authenticated lookups answer 404
    },
  };
  return db;
}

const lookup = (opts: Parameters<typeof call>[2] = {}) =>
  call(navigate, '/api/v1/navigate/FC02SIMBP88', { params: { code: 'FC02SIMBP88' }, ...opts });

describe('generateKey', () => {
  it('makes prefixed, high-entropy keys and hashes them', () => {
    expect(PARTNER.key).toMatch(/^n3d_live_[A-Za-z0-9_-]{32}$/);
    expect(PARTNER.hash).toBe(hashKey(PARTNER.key));
    expect(generateKey().key).not.toBe(generateKey().key);
    expect(PARTNER.displayPrefix).toBe(PARTNER.key.slice(0, 15));
  });
});

describe('API authentication', () => {
  it('keeps health public', async () => {
    useDeps({ db: keysDb() });
    expect((await call(health, '/api/v1/health', { web: false })).status).toBe(200);
  });

  it('rejects keyless calls from outside the website', async () => {
    useDeps({ db: keysDb() });
    const bare = await lookup({ web: false });
    expect(bare.status).toBe(401);
    expect((await bare.json()).error).toBe('API_KEY_REQUIRED');
    const crossSite = await lookup({ web: false, headers: { 'sec-fetch-site': 'cross-site' } });
    expect(crossSite.status).toBe(401);
    const otherOrigin = await lookup({ web: false, headers: { origin: 'https://evil.example' } });
    expect(otherOrigin.status).toBe(401);
  });

  it('accepts same-origin website requests, by Sec-Fetch-Site, Origin or Referer', async () => {
    useDeps({ db: keysDb() });
    expect((await lookup()).status).toBe(404); // 404 = authenticated, no such building
    expect((await lookup({ web: false, headers: { origin: 'http://localhost:3000' } })).status).toBe(404);
    expect((await lookup({ web: false, headers: { referer: 'http://localhost:3000/rider' } })).status).toBe(404);
  });

  it('rejects malformed, unknown and revoked keys', async () => {
    useDeps({ db: keysDb() });
    for (const key of ['nope', 'n3d_live_short', REVOKED.key]) {
      const res = await lookup({ web: false, headers: { 'x-api-key': key } });
      expect(res.status).toBe(401);
      expect((await res.json()).error).toBe('INVALID_API_KEY');
    }
  });

  it('a key wins over same-origin: a bad key from the website is still rejected', async () => {
    useDeps({ db: keysDb() });
    expect((await lookup({ headers: { 'x-api-key': REVOKED.key } })).status).toBe(401);
  });

  it('limits partners per key with rate-limit headers, ignoring forwarded IPs', async () => {
    const db = keysDb();
    useDeps({ db });
    const statuses = [];
    for (let i = 0; i < 4; i++) {
      const res = await lookup({ web: false, headers: { 'x-api-key': PARTNER.key, 'x-forwarded-for': `192.0.2.${i}` } });
      statuses.push(res.status);
      if (i === 0) {
        expect(res.headers.get('x-ratelimit-limit')).toBe('3');
        expect(res.headers.get('x-ratelimit-remaining')).toBe('2');
      }
    }
    expect(statuses).toEqual([404, 404, 404, 429]);
    expect(db.lookups).toBe(1); // cached after the first request
    expect(db.touches).toBe(1); // last_used_at written once
  });

  it('limits website visitors per IP', async () => {
    useDeps({ db: keysDb() });
    const asVisitor = (ip: string) => lookup({ headers: { 'x-forwarded-for': ip } });
    let last = 0;
    for (let i = 0; i <= WEB_LIMIT_PER_MIN; i++) last = (await asVisitor('203.0.113.7')).status;
    expect(last).toBe(429);
    expect((await asVisitor('198.51.100.9')).status).toBe(404); // another visitor is unaffected
  });
});
