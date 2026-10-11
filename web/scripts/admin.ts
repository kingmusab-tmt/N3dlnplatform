// Manage who can open /admin.
//
//   npm run admin -- add you@example.com      (or a phone number: 0803 123 4567)
//   npm run admin -- list
//   npm run admin -- remove you@example.com
//
// The person must have signed in on the website once, so their account exists.
// Reads DATABASE_URL from web/.env.local (see the npm script).
import { getPool } from '../lib/server/db';
import { normalizePhone } from '../lib/postcode';

const pool = getPool();
const [command, contact] = process.argv.slice(2);

async function findUser(input?: string) {
  if (!input) throw new Error(`Usage: admin ${command} <email or phone>`);
  const email = input.includes('@') ? input : null;
  const phone = email ? null : normalizePhone(input)?.replace(/^\+/, '') ?? null;
  const { rows } = await pool.query(
    `SELECT id, coalesce(email, phone) AS who FROM auth.users
     WHERE ($1::text IS NOT NULL AND lower(email) = lower($1)) OR ($2::text IS NOT NULL AND phone = $2) LIMIT 1`,
    [email, phone],
  );
  if (rows.length === 0) throw new Error(`No account for ${input}. Sign in on the website once first, then run this again.`);
  return rows[0] as { id: string; who: string };
}

async function add() {
  const user = await findUser(contact);
  await pool.query('INSERT INTO admin_users (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);
  console.log(`${user.who} is now an admin. Open /admin on the website.`);
}

async function list() {
  const { rows } = await pool.query(
    `SELECT coalesce(u.email, u.phone) AS who, a.created_at FROM admin_users a JOIN auth.users u ON u.id = a.user_id ORDER BY a.created_at`,
  );
  if (rows.length === 0) return console.log('No admins yet.');
  console.table(rows.map((r) => ({ admin: r.who, since: r.created_at.toISOString().slice(0, 10) })));
}

async function remove() {
  const user = await findUser(contact);
  const { rowCount } = await pool.query('DELETE FROM admin_users WHERE user_id = $1', [user.id]);
  console.log(rowCount ? `${user.who} is no longer an admin.` : `${user.who} wasn't an admin.`);
}

const commands: Record<string, () => Promise<unknown>> = { add, list, remove };

(commands[command] ?? (() => Promise.reject(new Error('Commands: add, list, remove'))))()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
