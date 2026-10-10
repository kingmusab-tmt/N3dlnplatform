import Link from 'next/link';
import { EMERGENCY_NUMBER, EMERGENCY_PURPOSES, navigatorHref } from '@/lib/purpose';

/** Navigator links for ambulance, fire and police crews heading to a building. */
export default function EmergencyLinks({ code, claim, callout = false }: { code: string; claim?: string | null; callout?: boolean }) {
  return (
    <div className="rounded-lg bg-red-950/40 p-2.5 ring-1 ring-red-400/25">
      {callout && (
        <p className="mb-2 text-xs text-red-100">
          Emergency? Call{' '}
          <a href={`tel:${EMERGENCY_NUMBER}`} className="font-semibold underline">
            {EMERGENCY_NUMBER}
          </a>{' '}
          first, then send this link to the responders so they find the right gate.
        </p>
      )}
      <p className="text-xs text-slate-400">Directions for responders</p>
      <div className="mt-1.5 grid grid-cols-3 gap-1.5">
        {EMERGENCY_PURPOSES.map((p) => (
          <Link
            key={p.id}
            href={navigatorHref(code, { claim, purpose: p.id })}
            className="rounded-md border border-red-400/30 px-1 py-1.5 text-center text-xs font-medium text-red-100 hover:bg-red-400/10"
          >
            <span aria-hidden>{p.icon}</span> {p.label}
          </Link>
        ))}
      </div>
    </div>
  );
}
