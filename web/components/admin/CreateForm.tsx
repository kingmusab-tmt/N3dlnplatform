'use client';
// Admin forms that POST JSON and refresh the page: new API key, new admin.
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

export function CreateKeyForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [limit, setLimit] = useState('120');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/v1/admin/keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, rate_limit_per_min: Number(limit) }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) return setError(body?.message ?? 'Could not create the key.');
    setCreated({ name: body.name, key: body.key });
    setCopied(false);
    setName('');
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <h2 className="font-semibold text-white">New partner key</h2>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs text-slate-400">
          Partner name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            minLength={2}
            maxLength={80}
            placeholder="e.g. Jumia Logistics"
            className="mt-1 w-60 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
          />
        </label>
        <label className="flex flex-col text-xs text-slate-400">
          Requests / minute
          <input
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            inputMode="numeric"
            required
            className="mt-1 w-28 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-100 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[#39FF14] px-4 py-1.5 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
        >
          {busy ? 'Creating…' : 'Create key'}
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-300">
          {error}
        </p>
      )}
      {created && (
        <div role="status" className="mt-3 rounded-lg bg-emerald-500/10 p-3 ring-1 ring-emerald-400/30">
          <p className="text-sm text-emerald-200">
            Key for <strong>{created.name}</strong>. Copy it now: it is shown only once and can’t be recovered.
          </p>
          <div className="mt-2 flex gap-2">
            <code className="min-w-0 flex-1 break-all rounded bg-slate-950 px-2 py-1.5 text-xs text-slate-100">{created.key}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard.writeText(created.key).then(() => setCopied(true))}
              className="shrink-0 rounded-md border border-white/15 px-2.5 text-xs text-slate-200 hover:bg-white/5"
            >
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function AddAdminForm() {
  const router = useRouter();
  const [contact, setContact] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const res = await fetch('/api/v1/admin/admins', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contact }),
    }).catch(() => null);
    const body = await res?.json().catch(() => null);
    setBusy(false);
    if (!res?.ok) return setMessage({ ok: false, text: body?.message ?? 'Could not add the admin.' });
    setMessage({ ok: true, text: `${contact} is now an admin.` });
    setContact('');
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <h2 className="font-semibold text-white">Add an admin</h2>
      <p className="text-xs text-slate-400">They must have signed in on the website once.</p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap gap-2">
        <label htmlFor="admin-contact" className="sr-only">
          Email or phone
        </label>
        <input
          id="admin-contact"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          required
          placeholder="Email or phone number"
          className="w-64 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
        />
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-[#39FF14] px-4 py-1.5 text-sm font-semibold text-slate-950 hover:brightness-110 disabled:opacity-60"
        >
          {busy ? 'Adding…' : 'Add admin'}
        </button>
      </form>
      {message && (
        <p role={message.ok ? 'status' : 'alert'} className={`mt-2 text-sm ${message.ok ? 'text-emerald-300' : 'text-red-300'}`}>
          {message.text}
        </p>
      )}
    </div>
  );
}
