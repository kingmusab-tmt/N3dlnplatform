'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useEffect, useRef, useState } from 'react';
import type { Claim } from '@/lib/postcode';
import { getSupabase, useUser, userLabel } from '@/lib/supabase/client';

type Load = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; claims: Claim[] };

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) throw new Error(body?.message ?? `Request failed (HTTP ${res.status}).`);
  return body as T;
}

/** "My places": the signed-in user's claims, with edit, re-share and delete. */
export default function MyPlaces() {
  const router = useRouter();
  const user = useUser();
  const [load, setLoad] = useState<Load>({ kind: 'loading' });
  // Signing out also flips user to null; don't treat that as "please sign in".
  const signingOut = useRef(false);

  useEffect(() => {
    if (user === null && !signingOut.current) router.replace('/login?next=/account');
    if (!user) return;
    api<{ claims: Claim[] }>('/api/v1/me/claims')
      .then(({ claims }) => setLoad({ kind: 'ready', claims }))
      .catch((err) => setLoad({ kind: 'error', message: err.message }));
  }, [user, router]);

  const replace = (updated: Claim) =>
    setLoad((l) => (l.kind === 'ready' ? { ...l, claims: l.claims.map((c) => (c.id === updated.id ? updated : c)) } : l));
  const remove = (id: string) =>
    setLoad((l) => (l.kind === 'ready' ? { ...l, claims: l.claims.filter((c) => c.id !== id) } : l));

  async function signOut() {
    signingOut.current = true;
    await getSupabase()?.auth.signOut();
    router.replace('/');
    router.refresh();
  }

  if (!user) return <p className="text-slate-400">Loading…</p>;

  return (
    <div className="w-full max-w-2xl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-100">My places</h1>
          <p className="text-sm text-slate-400">Signed in as {userLabel(user)}</p>
        </div>
        <div className="flex gap-2">
          <Link href="/" className="rounded-lg bg-[#39FF14] px-3 py-2 text-sm font-semibold text-slate-950 hover:brightness-110">
            Claim a place
          </Link>
          <button type="button" onClick={signOut} className="rounded-lg border border-white/15 px-3 py-2 text-sm text-slate-200 hover:bg-white/5">
            Sign out
          </button>
        </div>
      </header>

      {load.kind === 'loading' && <p className="mt-6 text-slate-400">Loading your places…</p>}
      {load.kind === 'error' && (
        <p role="alert" className="mt-6 rounded-lg bg-red-950/90 px-3 py-2 text-red-200">
          {load.message}
        </p>
      )}
      {load.kind === 'ready' && load.claims.length === 0 && (
        <p className="mt-6 rounded-xl border border-white/10 bg-slate-900/80 p-6 text-slate-300">
          No places yet. Find your building on the map, then choose <span className="text-[#39FF14]">This is my place</span>.
        </p>
      )}
      {load.kind === 'ready' && (
        <ul className="mt-6 space-y-3">
          {load.claims.map((claim) => (
            <PlaceCard key={claim.id} claim={claim} onChange={replace} onDelete={remove} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlaceCard({ claim, onChange, onDelete }: { claim: Claim; onChange: (c: Claim) => void; onDelete: (id: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [label, setLabel] = useState(claim.label);
  const [notes, setNotes] = useState(claim.delivery_notes ?? '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const shareUrl = typeof window === 'undefined' ? '' : `${window.location.origin}/h/${claim.share_id}`;
  const path = `/api/v1/me/claims/${claim.id}`;

  async function run(action: () => Promise<void>, ok?: string) {
    setBusy(true);
    setMessage(null);
    try {
      await action();
      if (ok) setMessage({ kind: 'ok', text: ok });
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof Error ? err.message : 'Something went wrong.' });
    } finally {
      setBusy(false);
    }
  }

  const save = (e: FormEvent) => {
    e.preventDefault();
    void run(async () => {
      onChange(await api<Claim>(path, { method: 'PATCH', body: JSON.stringify({ label, delivery_notes: notes }) }));
      setEditing(false);
    }, 'Saved.');
  };

  const removeGate = () =>
    run(async () => onChange(await api<Claim>(path, { method: 'PATCH', body: JSON.stringify({ gate: null }) })), 'Gate removed.');

  const newLink = () => {
    if (!confirm('Replace the share link? Anyone with the old link will lose access.')) return;
    void run(async () => onChange(await api<Claim>(`${path}/share-link`, { method: 'POST' })), 'New link created. The old one no longer works.');
  };

  const del = () => {
    if (!confirm(`Delete "${claim.label}"? Its share link will stop working.`)) return;
    void run(async () => {
      await api(path, { method: 'DELETE' });
      onDelete(claim.id);
    });
  };

  const copy = () =>
    run(async () => {
      await navigator.clipboard.writeText(shareUrl);
    }, 'Link copied.');

  return (
    <li className="rounded-xl border border-white/10 bg-slate-900/80 p-4 text-sm shadow-xl">
      {editing ? (
        <form onSubmit={save} className="space-y-2">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            maxLength={80}
            aria-label="Name for this place"
            className="w-full rounded-lg bg-slate-800 px-3 py-2 text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Delivery notes for riders"
            aria-label="Delivery notes"
            className="w-full resize-none rounded-lg bg-slate-800 px-3 py-2 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
          />
          <div className="flex gap-2">
            <button type="submit" disabled={busy} className="rounded-lg bg-[#39FF14] px-3 py-1.5 font-semibold text-slate-950 disabled:opacity-60">
              Save
            </button>
            <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 text-slate-400 hover:text-slate-200">
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-base font-semibold text-slate-100">{claim.label}</p>
            <p className="font-mono tracking-widest text-[#39FF14]">{claim.formatted}</p>
          </div>
          {claim.building_name && <p className="text-slate-400">{claim.building_name}</p>}
          {claim.delivery_notes && <p className="mt-2 whitespace-pre-line text-slate-300">{claim.delivery_notes}</p>}
          <p className="mt-2 text-xs text-slate-500">
            {claim.gate ? (
              <span className="text-amber-300">
                <span className="mr-1 inline-grid h-4 w-4 place-items-center rounded bg-amber-400 text-[10px] font-bold text-slate-950">G</span>
                Gate marked: riders are routed to it.
              </span>
            ) : (
              'No gate marked: riders go to the building center.'
            )}
          </p>
        </>
      )}

      {!editing && (
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <a href={`/h/${claim.share_id}`} target="_blank" rel="noopener" className="rounded-md border border-white/15 px-2.5 py-1.5 text-slate-200 hover:bg-white/5">
            Open link
          </a>
          <button type="button" onClick={copy} disabled={busy} className="rounded-md border border-white/15 px-2.5 py-1.5 text-slate-200 hover:bg-white/5">
            Copy link
          </button>
          <button type="button" onClick={() => setEditing(true)} disabled={busy} className="rounded-md border border-white/15 px-2.5 py-1.5 text-slate-200 hover:bg-white/5">
            Edit
          </button>
          <Link
            href={`/?code=${claim.code}&gate=${claim.id}`}
            className="rounded-md border border-amber-400/30 px-2.5 py-1.5 text-amber-300 hover:bg-amber-400/10"
          >
            {claim.gate ? 'Change gate' : 'Mark gate'}
          </Link>
          {claim.gate && (
            <button type="button" onClick={removeGate} disabled={busy} className="rounded-md border border-white/15 px-2.5 py-1.5 text-slate-200 hover:bg-white/5">
              Remove gate
            </button>
          )}
          <button type="button" onClick={newLink} disabled={busy} className="rounded-md border border-amber-400/30 px-2.5 py-1.5 text-amber-300 hover:bg-amber-400/10">
            New link
          </button>
          <button type="button" onClick={del} disabled={busy} className="rounded-md border border-red-400/30 px-2.5 py-1.5 text-red-300 hover:bg-red-400/10">
            Delete
          </button>
        </div>
      )}

      {message && (
        <p role={message.kind === 'error' ? 'alert' : 'status'} className={`mt-2 text-xs ${message.kind === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>
          {message.text}
        </p>
      )}
    </li>
  );
}
