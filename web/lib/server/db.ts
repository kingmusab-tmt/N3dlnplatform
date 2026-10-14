import pg from 'pg';
import { SUPABASE_ROOT_CA } from './supabaseCa';

/** The slice of pg.Pool the API uses, so tests can pass a fake. */
export type Db = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

// One pool per server instance, kept on globalThis so Next's dev hot-reload
// doesn't open a new pool on every edit. On Vercel, point DATABASE_URL at
// Supabase's *pooler* (port 6543), since short-lived functions would
// otherwise exhaust Postgres connections.
const globalForPg = globalThis as unknown as { __nipostPool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!globalForPg.__nipostPool) {
    const connectionString = process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';
    const pool = new pg.Pool({
      connectionString,
      ssl: sslFor(connectionString),
      max: Number(process.env.PG_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      // Scripts on slow links (e.g. imports) can raise this with PG_CONNECT_TIMEOUT_MS.
      connectionTimeoutMillis: Number(process.env.PG_CONNECT_TIMEOUT_MS ?? 5_000),
    });
    pool.on('error', (err) => console.error('Unexpected idle Postgres client error', err));
    globalForPg.__nipostPool = pool;
  }
  return globalForPg.__nipostPool;
}

/**
 * Local Supabase runs without TLS. Anything else gets verified TLS: Supabase's
 * own root CA by default, or DATABASE_CA_CERT (PEM) for another provider.
 * Don't put sslmode in DATABASE_URL; it would override this.
 */
export function sslFor(connectionString: string): pg.PoolConfig['ssl'] {
  const host = new URL(connectionString).hostname;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return false;
  return { ca: process.env.DATABASE_CA_CERT || SUPABASE_ROOT_CA, rejectUnauthorized: true };
}
