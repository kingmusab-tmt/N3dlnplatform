// "My places": only the signed-in owner can list, edit, delete or re-share a claim.
import { describe, expect, it } from 'vitest';
import { GET as listMine } from '@/app/api/v1/me/claims/route';
import { DELETE as deleteMine, PATCH as editMine } from '@/app/api/v1/me/claims/[id]/route';
import { POST as rotateLink } from '@/app/api/v1/me/claims/[id]/share-link/route';
import { generateKey } from '@/lib/server/apiKeys';
import { USER, call, useDeps } from './helpers';

const MINE = '22222222-2222-4222-8222-222222222222';
const THEIRS = '33333333-3333-4333-8333-333333333333';
const STRANGER = '44444444-4444-4444-8444-444444444444';

/** An in-memory claims table that honours the owner checks in the SQL parameters. */
function claimsTable() {
  const rows = new Map<string, any>([
    [MINE, { id: MINE, user_id: USER.id, share_token: MINE, label: 'Home', delivery_notes: null, gate: null }],
    [THEIRS, { id: THEIRS, user_id: STRANGER, share_token: THEIRS, label: 'Shop', delivery_notes: null, gate: null }],
  ]);
  const view = (r: any) => ({
    ...r, status: 'unverified', created_at: '2026-10-10T00:00:00Z', nipost_code: 'FC02SIMBP88', building_name: 'Silverbird',
    gate_lng: r.gate?.[0] ?? null, gate_lat: r.gate?.[1] ?? null,
  });
  const owned = (id: string, userId: string) => (rows.get(id)?.user_id === userId ? rows.get(id) : null);
  return {
    rows,
    async query(sql: string, p: any[] = []) {
      if (sql.includes('WHERE c.user_id = $1')) return { rows: [...rows.values()].filter((r) => r.user_id === p[0]).map(view) };
      if (sql.includes('ST_Distance')) {
        // Footprint near (7.4855, 9.0676): distance in metres from there.
        return owned(p[0], p[1]) ? { rows: [{ distance_m: Math.hypot(p[2] - 7.4855, p[3] - 9.0676) * 111_000 }] } : { rows: [] };
      }
      if (sql.includes('DELETE FROM claims')) {
        const r = owned(p[0], p[1]);
        if (r) rows.delete(p[0]);
        return { rows: [], rowCount: r ? 1 : 0 };
      }
      if (sql.includes('gen_random_uuid()')) {
        const r = owned(p[0], p[1]);
        if (!r) return { rows: [] };
        r.share_token = crypto.randomUUID();
        return { rows: [view(r)] };
      }
      if (sql.includes('UPDATE claims c')) {
        const r = owned(p[0], p[1]);
        if (!r) return { rows: [] };
        if (p[2] != null) r.label = p[2];
        if (p[3]) r.delivery_notes = p[4];
        if (p[5]) r.gate = p[6] == null ? null : [p[6], p[7]];
        return { rows: [view(r)] };
      }
      return { rows: [] };
    },
  };
}

const at = (id: string) => `/api/v1/me/claims/${id}`;

describe('My places', () => {
  it('requires a signed-in website user; partner API keys cannot use it', async () => {
    const key = generateKey();
    const db = claimsTable();
    useDeps({
      db: {
        query: async (sql: string, p: any[] = []) =>
          sql.includes('FROM api_keys') ? { rows: p[0] === key.hash ? [{ id: 1, name: 'P', rate_limit_per_min: 100 }] : [] } : db.query(sql, p),
      },
    });
    expect((await call(listMine, '/api/v1/me/claims')).status).toBe(401); // website, signed out
    const partner = await call(listMine, '/api/v1/me/claims', { web: false, headers: { 'x-api-key': key.key } });
    expect(partner.status).toBe(401);
    expect((await partner.json()).error).toBe('SIGN_IN_REQUIRED');
  });

  it("lists only the signed-in user's claims", async () => {
    useDeps({ db: claimsTable(), user: USER });
    const { claims } = await (await call(listMine, '/api/v1/me/claims')).json();
    expect(claims.map((c: any) => c.id)).toEqual([MINE]);
    expect(claims[0]).toMatchObject({ share_id: MINE, formatted: 'FC 02 SIM BP 88', label: 'Home' });
  });

  it('edits only the fields sent, and treats other people’s claims as not found', async () => {
    const db = claimsTable();
    useDeps({ db, user: USER });
    const res = await call(editMine, at(MINE), { method: 'PATCH', params: { id: MINE }, body: { delivery_notes: 'Ring twice' } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ label: 'Home', delivery_notes: 'Ring twice' });

    const theirs = await call(editMine, at(THEIRS), { method: 'PATCH', params: { id: THEIRS }, body: { label: 'Mine now' } });
    expect(theirs.status).toBe(404);
    expect(db.rows.get(THEIRS).label).toBe('Shop');
  });

  it('sets, validates and removes the gate', async () => {
    const db = claimsTable();
    useDeps({ db, user: USER });
    const near = await call(editMine, at(MINE), { method: 'PATCH', params: { id: MINE }, body: { gate: { lng: 7.48555, lat: 9.06762 } } });
    expect((await near.json()).gate).toEqual({ lng: 7.48555, lat: 9.06762 });

    const far = await call(editMine, at(MINE), { method: 'PATCH', params: { id: MINE }, body: { gate: { lng: 7.49, lat: 9.0676 } } });
    expect(far.status).toBe(400);
    expect((await far.json()).error).toBe('GATE_TOO_FAR');

    const removed = await call(editMine, at(MINE), { method: 'PATCH', params: { id: MINE }, body: { gate: null } });
    expect((await removed.json()).gate).toBeNull();
    expect((await call(editMine, at(MINE), { method: 'PATCH', params: { id: MINE }, body: { label: '' } })).status).toBe(400);
  });

  it('revokes a share link by issuing a new one', async () => {
    const db = claimsTable();
    useDeps({ db, user: USER });
    const res = await call(rotateLink, `${at(MINE)}/share-link`, { method: 'POST', params: { id: MINE } });
    expect(res.status).toBe(200);
    const { share_id } = await res.json();
    expect(share_id).not.toBe(MINE);
    expect(db.rows.get(MINE).share_token).toBe(share_id);
    expect((await call(rotateLink, `${at(THEIRS)}/share-link`, { method: 'POST', params: { id: THEIRS } })).status).toBe(404);
  });

  it('deletes only your own claims', async () => {
    const db = claimsTable();
    useDeps({ db, user: USER });
    expect((await call(deleteMine, at(THEIRS), { method: 'DELETE', params: { id: THEIRS } })).status).toBe(404);
    expect((await call(deleteMine, at(MINE), { method: 'DELETE', params: { id: MINE } })).status).toBe(204);
    expect(db.rows.has(MINE)).toBe(false);
    expect(db.rows.has(THEIRS)).toBe(true);
    expect((await call(deleteMine, at('not-a-uuid'), { method: 'DELETE', params: { id: 'not-a-uuid' } })).status).toBe(404);
  });
});
