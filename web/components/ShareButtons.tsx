'use client';

import { useState } from 'react';

/** Copy-link and WhatsApp buttons for a shared place. */
export default function ShareButtons({ url, text }: { url: string; text: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', url);
    }
  }

  return (
    <div className="flex gap-2">
      <button
        type="button"
        onClick={copy}
        className="flex-1 rounded-lg border border-white/15 px-3 py-2 font-medium text-slate-200 transition hover:bg-white/5"
      >
        {copied ? 'Copied ✓' : 'Copy link'}
      </button>
      <a
        href={`https://wa.me/?text=${encodeURIComponent(`${text}\n${url}`)}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex-1 rounded-lg bg-[#25D366] px-3 py-2 text-center font-semibold text-slate-950 transition hover:brightness-110"
      >
        WhatsApp
      </a>
    </div>
  );
}
