import { createHash, randomBytes } from 'node:crypto';
import type { Db } from './db';

const KEY_PREFIX = 'n3d_live_';
const KEY_PATTERN = /^n3d_live_[A-Za-z0-9_-]{32}$/;

export type ApiKeyRecord = { id: number; name: string; rate_limit_per_min: number };

export function hashKey(key: string) {
  return createHash('sha256').update(key).digest('hex');
}

/** New partner key: 24 random bytes as base64url (32 chars) after the prefix. */
export function generateKey() {
  const key = `${KEY_PREFIX}${randomBytes(24).toString('base64url')}`;
  return { key, hash: hashKey(key), displayPrefix: key.slice(0, KEY_PREFIX.length + 6) };
}

export function isWellFormedKey(key: string) {
  return KEY_PATTERN.test(key);
}

const LOOKUP_SQL = `
  SELECT id, name, rate_limit_per_min
  FROM api_keys
  WHERE key_hash = $1 AND revoked_at IS NULL
`;
const TOUCH_SQL = 'UPDATE api_keys SET last_used_at = now() WHERE id = $1';

export type KeyStore = { find: (key: string) => Promise<ApiKeyRecord | null> };

/**
 * Looks keys up by hash. Results are cached per instance for `cacheTtlMs`, so
 * a revoked key keeps working for at most that long; last_used_at is written
 * at most once a minute per key per instance.
 */
export function createKeyStore(db: Db, { cacheTtlMs = 60_000 } = {}): KeyStore {
  const cache = new Map<string, { record: ApiKeyRecord | null; expires: number }>();
  const lastTouched = new Map<number, number>();

  return {
    async find(key) {
      if (!isWellFormedKey(key)) return null;
      const hash = hashKey(key);
      const hit = cache.get(hash);
      let record: ApiKeyRecord | null;
      if (hit && hit.expires > Date.now()) {
        record = hit.record;
      } else {
        const { rows } = await db.query(LOOKUP_SQL, [hash]);
        record = rows[0] ?? null;
        if (cache.size > 5_000) cache.clear();
        cache.set(hash, { record, expires: Date.now() + cacheTtlMs });
      }

      if (record && (lastTouched.get(record.id) ?? 0) < Date.now() - 60_000) {
        lastTouched.set(record.id, Date.now());
        db.query(TOUCH_SQL, [record.id]).catch((err) => console.warn('api_keys last_used_at update failed:', err.message));
      }
      return record;
    },
  };
}
