// Manage API keys.
//
//   npm run keys -- create "Jumia Logistics" [--limit 120]
//   npm run keys -- create "Web app" --first-party
//   npm run keys -- list
//   npm run keys -- revoke n3d_live_AbC123
//
// The plaintext key is printed once at creation and never stored.
import 'dotenv/config';
import { parseArgs } from 'node:util';
import { pool } from '../src/db.js';
import { generateKey } from '../src/lib/apiKeys.js';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    limit: { type: 'string', default: '120' },
    'first-party': { type: 'boolean', default: false },
  },
});
const [command, arg] = positionals;

async function create(name) {
  if (!name) throw new Error('Usage: keys create "<partner name>" [--limit N] [--first-party]');
  const limit = Number(values.limit);
  if (!Number.isInteger(limit) || limit <= 0) throw new Error('--limit must be a positive integer (requests per minute)');
  const kind = values['first-party'] ? 'first_party' : 'partner';

  const { key, hash, displayPrefix } = generateKey(kind);
  const { rows } = await pool.query(
    `INSERT INTO api_keys (name, kind, key_prefix, key_hash, rate_limit_per_min)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, kind, displayPrefix, hash, limit],
  );
  console.log(`Created ${kind} key #${rows[0].id} for "${name}" (${kind === 'first_party' ? '60/min per end-user IP' : `${limit}/min`}).`);
  console.log('\nAPI key (shown once, store it securely):\n');
  console.log(`  ${key}\n`);
}

async function list() {
  const { rows } = await pool.query(
    `SELECT id, name, kind, key_prefix, rate_limit_per_min, created_at, last_used_at, revoked_at
     FROM api_keys ORDER BY id`,
  );
  if (rows.length === 0) return console.log('No API keys yet.');
  console.table(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      kind: r.kind,
      key: `${r.key_prefix}…`,
      'limit/min': r.kind === 'first_party' ? '60 per IP' : r.rate_limit_per_min,
      'last used': r.last_used_at?.toISOString().slice(0, 16) ?? 'never',
      status: r.revoked_at ? `revoked ${r.revoked_at.toISOString().slice(0, 10)}` : 'active',
    })),
  );
}

async function revoke(prefix) {
  if (!prefix) throw new Error('Usage: keys revoke <key prefix as shown by "keys list">');
  const { rows } = await pool.query(
    `UPDATE api_keys SET revoked_at = now()
     WHERE key_prefix = $1 AND revoked_at IS NULL RETURNING id, name`,
    [prefix.replace(/…$/, '')],
  );
  if (rows.length === 0) return console.log(`No active key with prefix ${prefix}.`);
  console.log(`Revoked key #${rows[0].id} (${rows[0].name}). Running servers stop accepting it within 60 seconds.`);
}

const commands = { create: () => create(arg), list, revoke: () => revoke(arg) };

(commands[command] ?? (() => Promise.reject(new Error('Commands: create, list, revoke'))))()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
