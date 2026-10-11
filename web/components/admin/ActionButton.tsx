'use client';
// A confirm-then-call button for admin actions (revoke, remove), refreshing
// the server-rendered page afterwards.
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ActionButton({
  url,
  method = 'DELETE',
  label,
  confirmText,
  ariaLabel,
}: {
  url: string;
  method?: 'DELETE' | 'POST';
  label: string;
  confirmText: string;
  ariaLabel?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (!confirm(confirmText)) return;
    setBusy(true);
    setError(null);
    const res = await fetch(url, { method }).catch(() => null);
    setBusy(false);
    if (!res || !res.ok) {
      const body = await res?.json().catch(() => null);
      setError(body?.message ?? 'Failed. Try again.');
      return;
    }
    router.refresh();
  }

  return (
    <span className="inline-flex flex-col items-end">
      <button
        type="button"
        onClick={run}
        disabled={busy}
        aria-label={ariaLabel}
        className="rounded-md border border-red-400/30 px-2 py-0.5 text-xs text-red-300 hover:bg-red-400/10 disabled:opacity-50"
      >
        {busy ? '…' : label}
      </button>
      {error && (
        <span role="alert" className="mt-1 text-xs text-red-300">
          {error}
        </span>
      )}
    </span>
  );
}
