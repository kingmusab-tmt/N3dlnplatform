import SwaggerParser from '@apidevtools/swagger-parser';
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createApp } from '../src/app.js';
import { OPENAPI_PATH } from '../src/routes/docs.js';

const CLAIM_ID = '3f2b8c1e-9a4d-4e7b-8c2a-1d5e6f7a8b9c';
const ROW = {
  id: 7,
  nipost_code: 'FC02SIMBP88',
  metadata: { name: 'Silverbird' },
  polygon: { type: 'Polygon', coordinates: [[[7.4853, 9.0675], [7.4853, 9.0677], [7.4856, 9.0677], [7.4856, 9.0675], [7.4853, 9.0675]]] },
  center: { type: 'Point', coordinates: [7.4854694, 9.0675872] },
  bbox: [7.4853, 9.0675, 7.4856, 9.0677],
  distance_m: 0,
};

// Answers every query the app makes with the one building above.
const fakeDb = {
  async query(sql) {
    if (sql.includes('INSERT INTO claims')) {
      return { rows: [{ id: CLAIM_ID, label: 'Flat 3B', delivery_notes: null, status: 'unverified', created_at: new Date().toISOString() }] };
    }
    if (sql.includes('FROM claims c')) {
      return { rows: [{ ...ROW, claim_id: CLAIM_ID, label: 'Flat 3B', delivery_notes: null, status: 'unverified', created_at: '2026-10-10T00:00:00Z' }] };
    }
    return { rows: [ROW] };
  },
};
const fakeDirections = {
  async route(from, to) {
    return {
      geometry: { type: 'LineString', coordinates: [from, to] },
      distance_m: 100,
      duration_s: 30,
      steps: [],
      snappedDestination: { point: to, offset_m: 0 },
    };
  },
};

/** A value for a parameter: its example, or a sensible default for its type. */
function sampleFor(schema = {}) {
  if (schema.example !== undefined) return schema.example;
  if (schema.format === 'uuid') return CLAIM_ID;
  if (schema.default !== undefined) return schema.default;
  if (schema.enum) return schema.enum[0];
  return schema.type === 'number' || schema.type === 'integer' ? 1 : 'x';
}

describe('OpenAPI spec', () => {
  let spec;
  let server;
  let base;

  before(async () => {
    spec = await SwaggerParser.validate(OPENAPI_PATH); // throws on an invalid spec; resolves $refs
    server = createApp(fakeDb, { directions: fakeDirections }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  after(() => server.close());

  it('is a valid OpenAPI document', () => {
    assert.equal(spec.openapi, '3.0.3');
    assert.ok(Object.keys(spec.paths).length >= 6);
  });

  it('every documented operation exists and answers with a documented status', async () => {
    for (const [path, item] of Object.entries(spec.paths)) {
      for (const [method, op] of Object.entries(item)) {
        const params = op.parameters ?? [];
        let url = path;
        const query = new URLSearchParams();
        for (const p of params) {
          const value = String(sampleFor(p.schema));
          if (p.in === 'path') url = url.replace(`{${p.name}}`, encodeURIComponent(value));
          if (p.in === 'query' && p.required) query.set(p.name, value);
        }
        const bodySchema = op.requestBody?.content?.['application/json']?.schema;
        const body = bodySchema
          ? JSON.stringify(Object.fromEntries(Object.entries(bodySchema.properties).map(([k, s]) => [k, sampleFor(s)])))
          : undefined;

        const res = await fetch(`${base}${url}${query.size ? `?${query}` : ''}`, {
          method: method.toUpperCase(),
          headers: body ? { 'Content-Type': 'application/json' } : {},
          body,
        });
        const documented = Object.keys(op.responses);
        assert.ok(
          documented.includes(String(res.status)),
          `${method.toUpperCase()} ${path} returned ${res.status}; documented: ${documented.join(', ')}`,
        );
        assert.ok(res.status < 400, `${method.toUpperCase()} ${path} example request failed with ${res.status}`);
      }
    }
  });

  it('serves the spec and the Swagger UI page', async () => {
    const yaml = await fetch(`${base}/api/v1/openapi.yaml`);
    assert.equal(yaml.status, 200);
    assert.match(await yaml.text(), /^openapi: 3\.0\.3/);
    const docs = await fetch(`${base}/api/v1/docs`);
    assert.equal(docs.status, 200);
    assert.match(await docs.text(), /SwaggerUIBundle/);
  });
});
