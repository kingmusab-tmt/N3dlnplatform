import { afterEach } from 'vitest';
import { createKeyStore } from '@/lib/server/apiKeys';
import type { SessionUser } from '@/lib/server/auth';
import type { Db } from '@/lib/server/db';
import { setDepsForTesting, type Deps } from '@/lib/server/deps';
import { createMemoryLimiter } from '@/lib/server/rateLimit';

export const ORIGIN = 'http://localhost:3000';

/** A building row as Postgres returns it (Silverbird Cinemas, Wuse 2). */
export const ROW = {
  id: 7,
  nipost_code: 'FC02SIMBP88',
  metadata: { name: 'Silverbird Cinemas', building_type: 'commercial', height_m: 12.8 },
  polygon: {
    type: 'Polygon',
    coordinates: [[[7.4853, 9.0675], [7.4853, 9.0677], [7.4856, 9.0677], [7.4856, 9.0675], [7.4853, 9.0675]]],
  },
  center: { type: 'Point', coordinates: [7.4854694, 9.0675872] },
  bbox: [7.4853, 9.0675, 7.4856, 9.0677],
  distance_m: 0,
};

export const USER: SessionUser = { id: '11111111-1111-4111-8111-111111111111', email: 'owner@example.com', phone: null };

/**
 * Installs fake dependencies for the route handlers; reset after each test.
 * `user` is who's signed in on the website (default: nobody).
 */
export function useDeps({ user = null, ...overrides }: Partial<Deps> & { db: Db; user?: SessionUser | null }): Deps {
  const deps: Deps = {
    nipost: null,
    directions: null,
    limiter: createMemoryLimiter(),
    keys: createKeyStore(overrides.db),
    auth: { configured: true, getUser: async () => user },
    ...overrides,
  };
  setDepsForTesting(deps);
  return deps;
}
afterEach(() => setDepsForTesting(null));

type RouteHandler = (req: Request, ctx: { params: Promise<any> }) => Promise<Response>;

/**
 * Calls a route handler like Next would. By default the request looks like it
 * came from this website (same-origin); pass `web: false` for a bare API call.
 */
export function call(
  handler: RouteHandler,
  path: string,
  {
    method = 'GET',
    params = {},
    headers = {},
    body,
    web = true,
  }: { method?: string; params?: Record<string, unknown>; headers?: Record<string, string>; body?: unknown; web?: boolean } = {},
) {
  const req = new Request(`${ORIGIN}${path}`, {
    method,
    headers: {
      ...(web && { 'sec-fetch-site': 'same-origin' }),
      ...(body !== undefined && { 'content-type': 'application/json' }),
      ...headers,
    },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  return handler(req, { params: Promise.resolve(params) });
}
