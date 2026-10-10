import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { NipostError } from '../src/lib/nipost.js';
import { formatPostcode, hyphenatePostcode, normalizePostcode } from '../src/lib/postcode.js';

describe('normalizePostcode', () => {
  it('treats spaced, dashed and compact forms the same', () => {
    for (const input of ['FC 02 A09 DB 09', 'FC-02-A09-DB-09', 'fc02a09db09', ' FC02A09DB09 ']) {
      assert.equal(normalizePostcode(input), 'FC02A09DB09');
    }
    assert.equal(normalizePostcode('EK 01 A03 FK 01'), 'EK01A03FK01');
  });

  it('accepts any 3 alphanumerics in the district segment', () => {
    assert.equal(normalizePostcode('LA-05-1B2-KD-14'), 'LA051B2KD14');
    assert.equal(normalizePostcode('LA 05 ABC KD 14'), 'LA05ABCKD14');
  });

  it('rejects malformed codes', () => {
    for (const input of ['', 'FC02A09DB0', 'FC02A09DB091', '0C02A09DB09', 'FC00A09DB09', 'FC02A09DB00', 'FC02A09D109', null, 42]) {
      assert.equal(normalizePostcode(input), null, String(input));
    }
  });

  it('formats canonical codes for display and for NIPOST', () => {
    assert.equal(formatPostcode('FC02A09DB09'), 'FC 02 A09 DB 09');
    assert.equal(hyphenatePostcode('FC02A09DB09'), 'FC-02-A09-DB-09');
  });
});

const square = (lng, lat) => ({
  type: 'Polygon',
  coordinates: [[[lng, lat], [lng, lat + 0.0002], [lng + 0.0002, lat + 0.0002], [lng + 0.0002, lat], [lng, lat]]],
});

const ROW = {
  id: 1,
  nipost_code: 'FC02A09DB09',
  metadata: { building_type: 'mixed_use', height_m: 18 },
  polygon: square(7.4787, 9.0773),
  center: { type: 'Point', coordinates: [7.4789, 9.07745] },
  bbox: [7.4787, 9.0773, 7.4789, 9.0775],
};

function createFakeDb() {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push(params);
      if (sql.includes('nipost_code = $1')) return { rows: params[0] === 'FC02A09DB09' ? [ROW] : [] };
      // point lookup: only a point near ROW matches
      const [lng, lat] = params;
      return { rows: Math.abs(lng - 7.4788) < 0.001 && Math.abs(lat - 9.0774) < 0.001 ? [{ ...ROW, distance_m: 0 }] : [] };
    },
  };
}

/** Fake NIPOST: `registry` maps canonical code -> point (or null for a valid L1 code). */
function createFakeNipost(registry, { level = 1, environment = 'live', failWith = null } = {}) {
  return {
    level,
    environment,
    async lookup(code) {
      if (failWith) throw failWith;
      const known = Object.hasOwn(registry, code);
      return {
        valid: known,
        postcode: hyphenatePostcode(code),
        level,
        point: known ? registry[code] : null,
        address: null,
        buildingUse: null,
      };
    },
  };
}

async function startServer(db, opts) {
  const server = createApp(db, { auth: false, ...opts }).listen(0);
  await new Promise((r) => server.once('listening', r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

describe('GET /api/v1/navigate/:code without NIPOST configured', () => {
  const db = createFakeDb();
  let server, base;
  before(async () => ({ server, base } = await startServer(db)));
  after(() => server.close());

  it('returns GeoJSON for a dashed code and marks verification not_configured', async () => {
    const res = await fetch(`${base}/api/v1/navigate/fc-02-a09-db-09`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(db.calls.at(-1)[0], 'FC02A09DB09');
    assert.equal(body.formatted, 'FC 02 A09 DB 09');
    assert.deepEqual(body.center, [7.4789, 9.07745]);
    assert.equal(body.building.geometry.type, 'Polygon');
    assert.equal(body.building.properties.height_m, 18);
    assert.equal(body.source, 'platform');
    assert.equal(body.verification.status, 'not_configured');
  });

  it('accepts URL-encoded spaces', async () => {
    const res = await fetch(`${base}/api/v1/navigate/${encodeURIComponent('FC 02 A09 DB 09')}`);
    assert.equal(res.status, 200);
  });

  it('400s on malformed codes without touching the DB', async () => {
    const before = db.calls.length;
    const res = await fetch(`${base}/api/v1/navigate/not-a-code`);
    assert.equal(res.status, 400);
    assert.equal((await res.json()).error, 'INVALID_POSTCODE');
    assert.equal(db.calls.length, before);
  });

  it('404s on unknown codes', async () => {
    const res = await fetch(`${base}/api/v1/navigate/EK01A03FK99`);
    assert.equal(res.status, 404);
    assert.equal((await res.json()).error, 'POSTCODE_NOT_FOUND');
  });
});

describe('GET /api/v1/navigate/:code with NIPOST level 1', () => {
  let server, base;
  before(async () => {
    const nipost = createFakeNipost({ FC02A09DB09: null, FC01A01KP27: null });
    ({ server, base } = await startServer(createFakeDb(), { nipost }));
  });
  after(() => server.close());

  it('marks a mapped, NIPOST-registered code as verified', async () => {
    const body = await (await fetch(`${base}/api/v1/navigate/FC02A09DB09`)).json();
    assert.equal(body.verification.status, 'verified');
    assert.equal(body.verification.level, 1);
  });

  it('reports a valid NIPOST code with no footprint as POSTCODE_NOT_MAPPED', async () => {
    const res = await fetch(`${base}/api/v1/navigate/FC-01-A01-KP-27`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'POSTCODE_NOT_MAPPED');
    assert.equal(body.verification.status, 'verified');
  });

  it('reports an unknown code as unregistered with NIPOST', async () => {
    const res = await fetch(`${base}/api/v1/navigate/EK01A03FK99`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.error, 'POSTCODE_NOT_FOUND');
    assert.equal(body.verification.status, 'unregistered');
    assert.match(body.message, /not a registered NIPOST postcode/);
  });
});

describe('GET /api/v1/navigate/:code when NIPOST is down', () => {
  let server, base;
  before(async () => {
    const nipost = createFakeNipost({}, { failWith: new NipostError('network_error', 'boom', 0) });
    ({ server, base } = await startServer(createFakeDb(), { nipost }));
  });
  after(() => server.close());

  it('still serves mapped buildings, flagged as unverified', async () => {
    const res = await fetch(`${base}/api/v1/navigate/FC02A09DB09`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.verification.status, 'unavailable');
    assert.equal(body.verification.reason, 'network_error');
  });
});

describe('GET /api/v1/navigate/:code with NIPOST level 5', () => {
  let server, base;
  before(async () => {
    const nipost = createFakeNipost(
      { LA05ABCKD14: [7.4788, 9.0774], LA05ABCKD15: [3.35, 6.6] },
      { level: 5 },
    );
    ({ server, base } = await startServer(createFakeDb(), { nipost }));
  });
  after(() => server.close());

  it('snaps a NIPOST point to the footprint under it', async () => {
    const res = await fetch(`${base}/api/v1/navigate/LA05ABCKD14`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, 'nipost');
    assert.equal(body.code, 'LA05ABCKD14');
    assert.equal(body.building.properties.nipost_code, 'LA05ABCKD14');
    assert.deepEqual(body.nipostPoint, [7.4788, 9.0774]);
    assert.equal(body.footprintMatch.distance_m, 0);
  });

  it("returns NIPOST's point with no building when no footprint is mapped there", async () => {
    const res = await fetch(`${base}/api/v1/navigate/LA05ABCKD15`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.building, null);
    assert.deepEqual(body.center, [3.35, 6.6]);
  });
});

describe('GET /api/v1/navigate/:code with a NIPOST test key', () => {
  let server, base;
  before(async () => {
    const nipost = createFakeNipost({ FC01A01KP27: null }, { environment: 'test' });
    ({ server, base } = await startServer(createFakeDb(), { nipost }));
  });
  after(() => server.close());

  it("doesn't claim a real code is unregistered when only the sandbox was checked", async () => {
    const res = await fetch(`${base}/api/v1/navigate/OS30A09ED02`);
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.equal(body.verification.status, 'not_in_sandbox');
    assert.equal(body.verification.environment, 'test');
    assert.doesNotMatch(body.message, /not a registered NIPOST postcode/);
    assert.match(body.message, /test sandbox/);
  });

  it('still verifies sandbox codes', async () => {
    const body = await (await fetch(`${base}/api/v1/navigate/FC01A01KP27`)).json();
    assert.equal(body.verification.status, 'verified');
  });
});
