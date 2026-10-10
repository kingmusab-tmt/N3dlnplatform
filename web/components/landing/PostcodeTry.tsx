'use client';

import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';
import { normalizePostcode } from '@/lib/postcode';

/** "Try a postcode" box: validates the format here, then opens the map on it. */
export default function PostcodeTry({ example }: { example: string }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const code = normalizePostcode(value || example);
    if (!code) {
      setError('That isn’t a NIPOST postcode. They look like FC 02 SIM BP 87.');
      return;
    }
    router.push(`/map?code=${code}`);
  }

  return (
    <form onSubmit={submit} className="w-full max-w-md">
      <div className="flex gap-2 rounded-2xl border border-white/15 bg-slate-950/70 p-2 shadow-2xl backdrop-blur">
        <label htmlFor="try-code" className="sr-only">
          NIPOST postcode
        </label>
        <input
          id="try-code"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder={example}
          autoComplete="off"
          spellCheck={false}
          maxLength={24}
          className="min-w-0 flex-1 rounded-xl bg-slate-800/80 px-4 py-3 font-mono text-base uppercase tracking-wider text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
        />
        <button
          type="submit"
          className="rounded-xl bg-[#39FF14] px-5 py-3 font-semibold text-slate-950 transition hover:brightness-110"
        >
          Find it
        </button>
      </div>
      <p className={`mt-2 text-sm ${error ? 'text-red-300' : 'text-slate-400'}`} role={error ? 'alert' : undefined}>
        {error ?? `Try the example: press Find it to fly to ${example} in 3D.`}
      </p>
    </form>
  );
}
