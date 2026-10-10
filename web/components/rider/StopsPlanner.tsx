'use client';

import { FormEvent, useState } from 'react';
import { normalizePostcode } from '@/lib/postcode';

export type PlannedStop = { code: string; formatted: string; name: string | null };

/** Extra stops for a multi-stop run, added before starting. */
export default function StopsPlanner({
  first,
  extras,
  onAdd,
  onRemove,
  optimize,
  onOptimize,
  disabled,
}: {
  first: PlannedStop | null;
  extras: PlannedStop[];
  onAdd: (stop: PlannedStop) => void;
  onRemove: (code: string) => void;
  optimize: boolean;
  onOptimize: (value: boolean) => void;
  disabled: boolean;
}) {
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const all = first ? [first, ...extras] : extras;

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const code = normalizePostcode(input);
    if (!code) return setError('Enter an 11-character NIPOST code.');
    if (all.some((s) => s.code === code)) return setError('That stop is already on the list.');
    setChecking(true);
    try {
      const res = await fetch(`/api/v1/navigate/${code}`);
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.building) throw new Error(body?.message ?? 'No mapped building for that code.');
      onAdd({ code, formatted: body.formatted, name: typeof body.building.properties.name === 'string' ? body.building.properties.name : null });
      setInput('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add that stop.');
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="mt-3 rounded-lg bg-slate-800/60 p-3">
      <p className="text-xs uppercase tracking-wider text-slate-400">Stops ({all.length})</p>
      {all.length > 0 && (
        <ol className="mt-2 space-y-1">
          {all.map((s, i) => (
            <li key={s.code} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-slate-200">
                <span className="mr-2 inline-grid h-5 w-5 place-items-center rounded-full bg-slate-600 text-[11px] font-bold">{i + 1}</span>
                <span className="font-mono text-[#39FF14]">{s.formatted}</span>
                {s.name && <span className="ml-1 text-slate-400">· {s.name}</span>}
              </span>
              {i > 0 && !disabled && (
                <button type="button" onClick={() => onRemove(s.code)} className="shrink-0 text-xs text-slate-400 hover:text-red-300" aria-label={`Remove stop ${s.formatted}`}>
                  Remove
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
      {!disabled && first && (
        <form onSubmit={add} className="mt-2 flex gap-2">
          <label htmlFor="add-stop" className="sr-only">
            Add a stop
          </label>
          <input
            id="add-stop"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add a stop: FC 02 SIM AV 70"
            autoComplete="off"
            spellCheck={false}
            maxLength={24}
            className="min-w-0 flex-1 rounded-md bg-slate-900 px-2 py-1.5 font-mono text-xs uppercase text-slate-100 placeholder:normal-case placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
          />
          <button type="submit" disabled={checking} className="rounded-md border border-white/15 px-2.5 py-1.5 text-xs text-slate-200 hover:bg-white/5 disabled:opacity-50">
            {checking ? 'Checking…' : 'Add'}
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-300">
          {error}
        </p>
      )}
      {all.length > 1 && !disabled && (
        <label className="mt-2 flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" checked={optimize} onChange={(e) => onOptimize(e.target.checked)} className="accent-[#39FF14]" />
          Best order: reorder stops for the shortest route
        </label>
      )}
    </div>
  );
}
