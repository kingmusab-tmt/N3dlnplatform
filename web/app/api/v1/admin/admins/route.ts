// POST /api/v1/admin/admins — make an existing account an admin, by email or phone.
import { adminRoute } from '@/lib/server/admin';
import { jsonError } from '@/lib/server/http';
import { normalizePhone } from '@/lib/postcode';

export const POST = adminRoute(async (req, { deps, admin }) => {
  const body = await req.json().catch(() => null);
  const contact = typeof body?.contact === 'string' ? body.contact.trim() : '';
  if (!contact) return jsonError(400, 'INVALID_CONTACT', 'Enter the email address or phone number they sign in with.');
  const phone = contact.includes('@') ? null : normalizePhone(contact);
  const { rows } = await deps.db.query(
    `SELECT id FROM auth.users WHERE ($1::text IS NOT NULL AND lower(email) = lower($1)) OR ($2::text IS NOT NULL AND phone = $2) LIMIT 1`,
    [contact.includes('@') ? contact : null, phone?.replace(/^\+/, '') ?? null],
  );
  if (rows.length === 0) {
    return jsonError(404, 'USER_NOT_FOUND', 'No account with that email or phone. They need to sign in once first.');
  }
  await deps.db.query(
    'INSERT INTO admin_users (user_id, added_by) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING',
    [rows[0].id, admin.id],
  );
  return Response.json({ user_id: rows[0].id }, { status: 201 });
});
