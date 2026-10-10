// Keeps openapi.yaml and the route handlers in sync, in both directions:
// every route file is documented, and every documented operation exists,
// enforces auth as declared, and answers its examples with a documented status.
import SwaggerParser from '@apidevtools/swagger-parser';
import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { GET as docs } from '@/app/api/v1/docs/route';
import { GET as specRoute } from '@/app/api/v1/openapi.yaml/route';
import { generateKey } from '@/lib/server/apiKeys';
import { OPENAPI_PATH } from '@/lib/server/openapi';
import { ROW, USER, call, useDeps } from './helpers';

const TEST_KEY = generateKey();
const CLAIM_ID = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
const API_DIR = path.resolve(__dirname, '../app/api/v1');
// Served for humans/tools, not part of the documented API surface.
const UNDOCUMENTED = new Set(['/api/v1/docs', '/api/v1/openapi.yaml', '/api/v1/{...rest}']);

/** app/api/v1/navigate/[code]/route/route.ts -> /api/v1/navigate/{code}/route */
function routeFiles(dir = API_DIR): { apiPath: string; file: string }[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return routeFiles(full);
    if (name !== 'route.ts') return [];
    const rel = path.relative(API_DIR, dir).split(path.sep).filter(Boolean);
    return [{ apiPath: `/api/v1/${rel.map((s) => s.replace(/^\[(.+)\]$/, '{$1}')).join('/')}`.replace(/\/$/, ''), file: full }];
  });
}

const OWNED = {
  id: CLAIM_ID, share_token: CLAIM_ID, label: 'Flat 3B', delivery_notes: null, status: 'unverified',
  created_at: '2026-10-10T00:00:00Z', gate_lng: null, gate_lat: null, nipost_code: 'FC02SIMBP88', building_name: 'Silverbird',
};

const fakeDb = {
  async query(sql: string, params: any[] = []) {
    // Owner ("My places") queries
    if (sql.includes('DELETE FROM claims')) return { rows: [], rowCount: 1 };
    if (sql.includes('c.user_id = $2') && sql.includes('ST_Distance')) return { rows: [{ distance_m: 5 }] };
    if (sql.includes('UPDATE claims c') || sql.includes('WHERE c.user_id = $1')) return { rows: [OWNED] };
    if (sql.includes('FROM api_keys')) {
      return { rows: params[0] === TEST_KEY.hash ? [{ id: 1, name: 'Test partner', rate_limit_per_min: 1000 }] : [] };
    }
    if (sql.includes('UPDATE api_keys')) return { rows: [] };
    if (sql.includes('INSERT INTO claims')) {
      return { rows: [{ id: CLAIM_ID, label: 'Flat 3B', delivery_notes: null, status: 'unverified', created_at: new Date().toISOString() }] };
    }
    if (sql.includes('FROM claims c')) {
      return { rows: [{ ...ROW, share_token: CLAIM_ID, label: 'Flat 3B', delivery_notes: null, status: 'unverified', created_at: '2026-10-10T00:00:00Z' }] };
    }
    return { rows: [ROW] };
  },
};
const fakeDirections = {
  async route(from: [number, number], to: [number, number]) {
    return { geometry: { type: 'LineString' as const, coordinates: [from, to] }, distance_m: 100, duration_s: 30, steps: [], snappedDestination: { point: to, offset_m: 0 } };
  },
};

function sampleFor(schema: any = {}): unknown {
  if (schema.example !== undefined) return schema.example;
  if (schema.format === 'uuid') return CLAIM_ID;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum) return schema.enum[0];
  return schema.type === 'number' || schema.type === 'integer' ? 1 : 'x';
}

describe('OpenAPI spec', () => {
  let spec: any;
  beforeAll(async () => {
    spec = await SwaggerParser.validate(OPENAPI_PATH); // throws on an invalid spec; resolves $refs
  });

  it('is a valid OpenAPI 3.0 document', () => {
    expect(spec.openapi).toBe('3.0.3');
  });

  it('documents every API route file', () => {
    const documented = new Set(Object.keys(spec.paths));
    const missing = routeFiles().map((r) => r.apiPath).filter((p) => !UNDOCUMENTED.has(p) && !documented.has(p));
    expect(missing).toEqual([]);
  });

  it('every documented operation exists, enforces auth, and answers with a documented status', async () => {
    const files = new Map(routeFiles().map((r) => [r.apiPath, r.file]));
    for (const [apiPath, item] of Object.entries<any>(spec.paths)) {
      const file = files.get(apiPath);
      expect(file, `${apiPath} has no route file`).toBeTruthy();
      const mod = await import(file!);

      for (const [method, op] of Object.entries<any>(item)) {
        const handler = mod[method.toUpperCase()];
        expect(handler, `${method.toUpperCase()} ${apiPath} is not exported`).toBeTypeOf('function');

        let url = apiPath;
        const params: Record<string, string> = {};
        const query = new URLSearchParams();
        for (const p of op.parameters ?? []) {
          const value = String(sampleFor(p.schema));
          if (p.in === 'path') {
            params[p.name] = value;
            url = url.replace(`{${p.name}}`, encodeURIComponent(value));
          }
          if (p.in === 'query' && p.required) query.set(p.name, value);
        }
        const bodySchema = op.requestBody?.content?.['application/json']?.schema;
        const body = bodySchema
          ? Object.fromEntries(Object.entries<any>(bodySchema.properties).map(([k, s]) => [k, sampleFor(s)]))
          : undefined;
        const target = `${url}${query.size ? `?${query}` : ''}`;
        const label = `${method.toUpperCase()} ${apiPath}`;

        const security: Record<string, unknown>[] = op.security ?? spec.security ?? [];
        const sessionOnly = security.some((s) => 'SessionCookie' in s);
        const secured = security.length > 0;

        useDeps({ db: fakeDb, directions: fakeDirections });
        if (secured) {
          // No key and no session: rejected.
          const anon = await call(handler, target, { method: method.toUpperCase(), params, body, web: sessionOnly });
          expect(anon.status, `${label} should require ${sessionOnly ? 'a session' : 'a key'}`).toBe(401);
          expect(op.responses['401'], `${label} should document 401`).toBeTruthy();
        }

        // Session endpoints are called as a signed-in website user; the rest with a partner key.
        useDeps({ db: fakeDb, directions: fakeDirections, user: sessionOnly ? USER : null });
        const res = await call(handler, target, {
          method: method.toUpperCase(),
          params,
          body,
          web: sessionOnly,
          headers: secured && !sessionOnly ? { 'x-api-key': TEST_KEY.key } : {},
        });
        expect(Object.keys(op.responses), `${label} returned ${res.status}`).toContain(String(res.status));
        expect(res.status, `${label} example request failed`).toBeLessThan(400);
      }
    }
  });

  it('serves the spec and the Swagger UI page', async () => {
    const yaml = await specRoute();
    expect(await yaml.text()).toMatch(/^openapi: 3\.0\.3/);
    expect(await docs().text()).toMatch(/SwaggerUIBundle/);
  });
});
