// Who is signed in on this website, from the Supabase Auth session cookie.
import { createServerClient } from '@supabase/ssr';

export type SessionUser = { id: string; email: string | null; phone: string | null };
export type AuthReader = {
  /** False when Supabase Auth isn't set up on this server: accounts are then unavailable. */
  configured: boolean;
  getUser: (req: Request) => Promise<SessionUser | null>;
};

export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
export const SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Cookies from a request's Cookie header, in the shape @supabase/ssr expects. */
export function parseCookies(header: string | null) {
  if (!header) return [];
  return header.split(';').flatMap((part) => {
    const i = part.indexOf('=');
    if (i < 0) return [];
    const name = part.slice(0, i).trim();
    const value = part.slice(i + 1).trim();
    return name ? [{ name, value: decodeURIComponent(value) }] : [];
  });
}

/**
 * Reads the session from the request's cookies and verifies its JWT. With
 * Supabase's asymmetric (ES256) signing keys, getClaims() verifies locally
 * against the cached JWKS, so there's no Auth round trip per request.
 * Cookie refreshing is middleware.ts's job; this reader never writes cookies.
 */
export function createAuthReader(): AuthReader {
  return {
    configured: Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY),
    async getUser(req) {
      if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) return null;
      const supabase = createServerClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
        cookies: { getAll: () => parseCookies(req.headers.get('cookie')), setAll: () => {} },
      });
      const { data, error } = await supabase.auth.getClaims();
      const claims = data?.claims;
      if (error || !claims?.sub) return null;
      return {
        id: claims.sub,
        email: (claims.email as string | undefined) || null,
        phone: (claims.phone as string | undefined) || null,
      };
    },
  };
}
