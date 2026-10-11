// Who may use the admin area (/admin and /api/v1/admin/*): signed-in users
// listed in admin_users. Everyone else gets "not found", so the admin area
// doesn't advertise itself.
import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL, type SessionUser } from './auth';
import type { Db } from './db';
import { getDeps, type Deps } from './deps';
import { apiRoute, jsonError, sessionUser, type Caller } from './http';

export async function isAdmin(db: Db, userId: string) {
  const { rows } = await db.query('SELECT 1 FROM admin_users WHERE user_id = $1', [userId]);
  return rows.length > 0;
}

/** The signed-in user in a server component (cookies are read-only there). */
async function pageUser(): Promise<SessionUser | null> {
  if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
  const store = await cookies();
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    cookies: { getAll: () => store.getAll(), setAll: () => {} },
  });
  const { data, error } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (error || !claims?.sub) return null;
  return { id: claims.sub, email: (claims.email as string) || null, phone: (claims.phone as string) || null };
}

/** For admin pages: signed out -> sign in first; signed in but not an admin -> 404. */
export async function requireAdminPage(): Promise<SessionUser> {
  const user = await pageUser();
  if (!user) redirect('/login?next=/admin');
  if (!(await isAdmin(getDeps().db, user.id))) notFound();
  return user;
}

type AdminHandler<P> = (req: Request, ctx: { params: P; deps: Deps; caller: Caller; admin: SessionUser }) => Promise<Response>;

/**
 * Admin API: only from this website's pages (never with a partner API key),
 * with an admin's session. The same-origin requirement also stops other
 * sites from submitting forms here on an admin's behalf.
 */
export function adminRoute<P = Record<string, never>>(handler: AdminHandler<P>) {
  return apiRoute<P>(async (req, ctx) => {
    const user = await sessionUser(req, ctx.deps, ctx.caller);
    if (!user || !(await isAdmin(ctx.deps.db, user.id))) return jsonError(404, 'NOT_FOUND', 'Not found.');
    const res = await handler(req, { ...ctx, admin: user });
    res.headers.set('Cache-Control', 'private, no-store');
    return res;
  });
}
