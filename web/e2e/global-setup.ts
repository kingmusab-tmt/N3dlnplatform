// Loads the E2E test buildings into the (local) database before the browser tests.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import pg from 'pg';

export default async function globalSetup() {
  const url = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
  if (!/@(127\.0\.0\.1|localhost):/.test(url)) {
    throw new Error('Browser tests only run against a local database; DATABASE_URL points elsewhere.');
  }
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query(readFileSync(path.join(__dirname, 'fixtures.sql'), 'utf8'));
  } finally {
    await client.end();
  }
}
