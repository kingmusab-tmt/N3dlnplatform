'use client';

import ShareButtons from '@/components/ShareButtons';
import type { RunState } from '@/lib/rider/run';

const STATUS_LABEL: Record<string, string> = {
  pending: 'Waiting',
  en_route: 'On the way',
  arrived: 'Arrived',
  delivered: 'Delivered ✓',
  failed: 'Not delivered',
};

/** Each stop's customer tracking link, ready to send. */
export default function CustomerLinks({ run }: { run: RunState }) {
  const done = run.stops.filter((s) => s.status === 'delivered').length;
  return (
    <details className="mt-3 rounded-lg bg-slate-800/60 p-3" open={done === 0}>
      <summary className="cursor-pointer text-slate-200">
        Customer tracking links · {done}/{run.stops.length} delivered
      </summary>
      <p className="mt-1 text-xs text-slate-400">Send each customer their link so they can watch you arrive.</p>
      <ol className="mt-2 space-y-3">
        {run.stops.map((s) => (
          <li key={s.stop_index} className={s.stop_index === run.current ? 'rounded-md ring-1 ring-[#39FF14]/40 p-2' : 'p-2'}>
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="mr-1 text-slate-400">{s.stop_index + 1}.</span>
                <span className="font-mono text-[#39FF14]">{s.formatted}</span>
                {s.building_name && <span className="text-slate-400"> · {s.building_name}</span>}
              </span>
              <span className="shrink-0 text-xs text-slate-400">{STATUS_LABEL[s.status ?? 'pending']}</span>
            </div>
            {s.status !== 'delivered' && s.status !== 'failed' && (
              <div className="mt-2">
                <ShareButtons url={s.tracking_url} text={`Track your delivery to ${s.formatted}`} />
              </div>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
