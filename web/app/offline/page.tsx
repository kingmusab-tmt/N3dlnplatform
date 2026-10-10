import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Offline · TMTechEASY Delivery' };

// Shown by the service worker when a page isn't cached and there's no connection.
export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-[#0b0f14] p-6 text-center text-slate-200">
      <div className="max-w-sm">
        <h1 className="text-2xl font-semibold text-white">You’re offline</h1>
        <p className="mt-3 text-slate-300">
          This page isn’t saved on your phone yet. The Rider View works offline once you’ve opened it with a connection: an
          active delivery keeps navigating, and your updates are sent when you’re back online.
        </p>
        <Link href="/rider" className="mt-6 inline-block rounded-lg bg-[#39FF14] px-5 py-2.5 font-semibold text-slate-950">
          Open the Rider View
        </Link>
      </div>
    </main>
  );
}
