import pg from 'pg';

/** The slice of pg.Pool the API uses, so tests can pass a fake. */
export type Db = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[]; rowCount?: number | null }> };

// One pool per server instance, kept on globalThis so Next's dev hot-reload
// doesn't open a new pool on every edit. On Vercel, point DATABASE_URL at
// Supabase's *pooler* (port 6543), since short-lived functions would
// otherwise exhaust Postgres connections.
const globalForPg = globalThis as unknown as { __nipostPool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!globalForPg.__nipostPool) {
    const pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
      max: Number(process.env.PG_POOL_MAX ?? 5),
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 5_000,
    });
    pool.on('error', (err) => console.error('Unexpected idle Postgres client error', err));
    globalForPg.__nipostPool = pool;
  }
  return globalForPg.__nipostPool;
}
