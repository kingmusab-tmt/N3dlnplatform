import { describe, expect, it } from 'vitest';
import { POST as createKey } from '@/app/api/v1/admin/keys/route';
import { DELETE as removePlace } from '@/app/api/v1/admin/places/[id]/route';
import { DELETE as removeAdmin } from '@/app/api/v1/admin/admins/[userId]/route';
import { POST as analytics } from '@/app/api/v1/analytics/route';
import { deviceOf, isBot, isTrackedPath, normalizePath, parseEvent, referrerHost } from '@/lib/server/analytics';
import { USER, call, useDeps } from './helpers';

const VISITOR = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const SESSION = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CHROME = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

/** A fake database that records queries; `admins` are the user ids in admin_users. */
function recordingDb(admins: string[] = []) {
  const queries: { sql: string; params: unknown[] }[] = [];
  return {
    queries,
    async query(sql: string, params: unknown[] = []) {
      queries.push({ sql, params });
      if (sql.includes('FROM admin_users WHERE user_id = $1')) return { rows: admins.includes(params[0] as string) ? [{}] : [] };
      if (sql.includes('INSERT INTO api_keys')) return { rows: [{ id: 9 }] };
      return { rows: [] };
    },
  };
}

describe('analytics events', () => {
  it('normalises paths and hides private tokens', () => {
    expect(normalizePath('/map?code=FC02SIMBP87')).toBe('/map');
    expect(normalizePath('/t/3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c')).toBe('/t/[token]');
    expect(normalizePath('/h/abc/opengraph-image#x')).toBe('/h/[id]/opengraph-image');
    expect(normalizePath('/rider/')).toBe('/rider');
    expect(normalizePath('')).toBe('/');
  });

  it('keeps only valid events and clips visible time', () => {
    const base = { v: VISITOR, s: SESSION, t: 'ping', p: '/map' };
    expect(parseEvent({ ...base, a: 15 })).toMatchObject({ type: 'ping', active: 15, path: '/map' });
    expect(parseEvent({ ...base, a: 9999 })?.active).toBe(30);
    expect(parseEvent({ ...base, a: -5 })?.active).toBe(0);
    expect(parseEvent({ ...base, v: 'not-a-uuid' })).toBeNull();
    expect(parseEvent({ ...base, t: 'click' })).toBeNull();
    expect(parseEvent(null)).toBeNull();
  });

  it('records only the referring host, and not internal navigation', () => {
    expect(referrerHost('https://www.google.com/search?q=secret')).toBe('google.com');
    expect(referrerHost('https://n3dlnplatform.vercel.app/map', 'n3dlnplatform.vercel.app')).toBeNull();
    expect(referrerHost('nonsense')).toBeNull();
  });

  it('classifies devices and bots, and skips the admin area', () => {
    expect(deviceOf('Mozilla/5.0 (Linux; Android 14; Pixel 8) Mobile Safari')).toBe('mobile');
    expect(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)')).toBe('tablet');
    expect(deviceOf(CHROME)).toBe('desktop');
    expect(isBot('Googlebot/2.1')).toBe(true);
    expect(isBot(CHROME)).toBe(false);
    expect(isTrackedPath('/admin/users')).toBe(false);
    expect(isTrackedPath('/map')).toBe(true);
  });
});

describe('POST /api/v1/analytics', () => {
  const view = { v: VISITOR, s: SESSION, t: 'view', p: '/map?code=X', a: 0 };

  it('records a page view from this website', async () => {
    const db = recordingDb();
    useDeps({ db });
    const res = await call(analytics, '/api/v1/analytics', { method: 'POST', body: view, headers: { 'user-agent': CHROME } });
    expect(res.status).toBe(204);
    const insert = db.queries.find((q) => q.sql.includes('INSERT INTO analytics_sessions'));
    expect(insert?.params.slice(0, 3)).toEqual([SESSION, VISITOR, '/map']);
  });

  it('refuses other sites, and ignores bots and admin pages', async () => {
    const db = recordingDb();
    useDeps({ db });
    expect((await call(analytics, '/api/v1/analytics', { method: 'POST', body: view, web: false, headers: { 'user-agent': CHROME } })).status).toBe(403);
    await call(analytics, '/api/v1/analytics', { method: 'POST', body: view, headers: { 'user-agent': 'Googlebot/2.1' } });
    await call(analytics, '/api/v1/analytics', { method: 'POST', body: { ...view, p: '/admin' }, headers: { 'user-agent': CHROME } });
    expect(db.queries.some((q) => q.sql.includes('analytics_sessions'))).toBe(false);
  });
});

describe('admin API', () => {
  it('is "not found" for visitors who are signed out or not admins', async () => {
    useDeps({ db: recordingDb(), user: null });
    expect((await call(createKey, '/api/v1/admin/keys', { method: 'POST', body: { name: 'Partner' } })).status).toBe(404);
    useDeps({ db: recordingDb(), user: USER });
    expect((await call(createKey, '/api/v1/admin/keys', { method: 'POST', body: { name: 'Partner' } })).status).toBe(404);
  });

  it('never accepts calls from other sites or scripts without the website session', async () => {
    useDeps({ db: recordingDb([USER.id]), user: USER });
    const res = await call(createKey, '/api/v1/admin/keys', { method: 'POST', body: { name: 'Partner' }, web: false });
    expect(res.status).toBe(401);
  });

  it('lets an admin create a key, shown once', async () => {
    const db = recordingDb([USER.id]);
    useDeps({ db, user: USER });
    const res = await call(createKey, '/api/v1/admin/keys', { method: 'POST', body: { name: 'Jumia Logistics', rate_limit_per_min: 300 } });
    expect(res.status).toBe(201);
    expect(res.headers.get('cache-control')).toContain('no-store');
    const body = await res.json();
    expect(body.key).toMatch(/^n3d_live_/);
    // Only the hash is stored.
    const insert = db.queries.find((q) => q.sql.includes('INSERT INTO api_keys'))!;
    expect(insert.params).not.toContain(body.key);
    expect((await call(createKey, '/api/v1/admin/keys', { method: 'POST', body: { name: 'x' } })).status).toBe(400);
  });

  it('validates ids before touching the database', async () => {
    useDeps({ db: recordingDb([USER.id]), user: USER });
    expect((await call(removePlace, '/api/v1/admin/places/nope', { method: 'DELETE', params: { id: 'nope' } })).status).toBe(400);
    expect((await call(removeAdmin, '/api/v1/admin/admins/nope', { method: 'DELETE', params: { userId: 'nope' } })).status).toBe(400);
  });
});

describe('visit data: CSV and clean-up', () => {
  it('writes CSV that spreadsheets read safely', async () => {
    const { csvCell, toCsv } = await import('@/lib/server/csv');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell(-5)).toBe('-5'); // numbers are left alone
    expect(csvCell(null)).toBe('');
    expect(toCsv([['a', 1]]).startsWith('\uFEFFa,1')).toBe(true);
  });

  it('only cleans up with an allowed age, and reports what was deleted', async () => {
    const { DELETE: cleanUp } = await import('@/app/api/v1/admin/analytics/route');
    const db = recordingDb([USER.id]);
    const query = db.query.bind(db);
    db.query = async (sql: string, params: unknown[] = []) =>
      sql.includes('DELETE FROM analytics_sessions') ? (db.queries.push({ sql, params }), { rows: [{ visits: 3, pageviews: 7 }] }) : query(sql, params);
    useDeps({ db, user: USER });
    expect((await call(cleanUp, '/api/v1/admin/analytics?older_than_days=7', { method: 'DELETE' })).status).toBe(400);
    const res = await call(cleanUp, '/api/v1/admin/analytics?older_than_days=90', { method: 'DELETE' });
    expect(await res.json()).toEqual({ deleted_visits: 3, deleted_pageviews: 7 });
    expect(db.queries.find((q) => q.sql.includes('DELETE FROM analytics_sessions'))?.params).toEqual([90]);

    useDeps({ db: recordingDb(), user: USER }); // not an admin
    expect((await call(cleanUp, '/api/v1/admin/analytics?older_than_days=0', { method: 'DELETE' })).status).toBe(404);
  });
});
