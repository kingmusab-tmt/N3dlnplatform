// Small presentational pieces shared by the admin pages (server-safe).
import Link from 'next/link';

export function PageTitle({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      {children}
    </div>
  );
}

/** Stat tile: label · value · optional note. */
export function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <p className="text-xs text-slate-400">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
      {note && <p className="mt-0.5 text-xs text-slate-500">{note}</p>}
    </div>
  );
}

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="min-w-0 rounded-xl border border-white/10 bg-slate-900/60 p-4">
      <h2 className="font-semibold text-white">{title}</h2>
      {subtitle && <p className="text-xs text-slate-400">{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Ranked list with a proportional bar behind each count (one hue, no legend needed). */
export function RankedList({
  rows,
  countLabel,
  empty = 'No data yet.',
}: {
  rows: { label: string; count: number; note?: string }[];
  countLabel: string;
  empty?: string;
}) {
  if (rows.length === 0) return <p className="text-sm text-slate-500">{empty}</p>;
  const max = Math.max(...rows.map((r) => r.count));
  return (
    <table className="w-full text-sm">
      <thead className="sr-only">
        <tr>
          <th>Item</th>
          <th>{countLabel}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label}>
            <td className="relative py-1 pr-3">
              <span
                aria-hidden
                className="absolute inset-y-0.5 left-0 rounded-r bg-[#0284c7]/25"
                style={{ width: `${Math.max(2, (r.count / max) * 100)}%` }}
              />
              <span className="relative block truncate px-2 text-slate-200">{r.label}</span>
            </td>
            <td className="w-16 py-1 text-right tabular-nums text-slate-300">
              {r.count.toLocaleString('en-NG')}
              {r.note && <span className="block text-[11px] text-slate-500">{r.note}</span>}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SearchForm({ action, defaultValue, placeholder }: { action: string; defaultValue: string; placeholder: string }) {
  return (
    <form action={action} className="flex gap-2" role="search">
      <label htmlFor="admin-search" className="sr-only">
        Search
      </label>
      <input
        id="admin-search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="w-56 rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-[#39FF14]"
      />
      <button type="submit" className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-slate-200 hover:bg-white/5">
        Search
      </button>
      {defaultValue && (
        <Link href={action} className="self-center text-xs text-slate-400 underline">
          Clear
        </Link>
      )}
    </form>
  );
}

export function Table({ head, children, empty }: { head: string[]; children: React.ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-slate-900 text-xs text-slate-400">
          <tr>
            {head.map((h) => (
              <th key={h} className="whitespace-nowrap px-3 py-2 font-medium">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-slate-300">{children}</tbody>
      </table>
      {empty && <p className="px-3 py-6 text-center text-sm text-slate-500">Nothing here yet.</p>}
    </div>
  );
}

export function Badge({ tone, children }: { tone: 'green' | 'amber' | 'slate' | 'red' | 'sky'; children: React.ReactNode }) {
  const tones = {
    green: 'bg-emerald-500/15 text-emerald-300 ring-emerald-400/30',
    amber: 'bg-amber-500/15 text-amber-300 ring-amber-400/30',
    slate: 'bg-slate-500/15 text-slate-300 ring-slate-400/30',
    red: 'bg-red-500/15 text-red-300 ring-red-400/30',
    sky: 'bg-sky-500/15 text-sky-300 ring-sky-400/30',
  };
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ring-1 ${tones[tone]}`}>{children}</span>;
}
