import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import TrackingView, { type Tracking } from '@/components/TrackingView';
import { getDeps } from '@/lib/server/deps';
import { getTracking } from '@/lib/server/runs';

type Props = { params: Promise<{ token: string }> };

// generateMetadata and the page both need the delivery; one query.
const load = cache(async (token: string) => (await getTracking(getDeps().db, token)) as Tracking | null);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const tracking = await load((await params).token);
  const name = tracking?.building?.properties.name;
  return {
    title: tracking ? `Delivery to ${typeof name === 'string' ? name : tracking.formatted} · TMTechEasy Gate` : 'Tracking link not found',
    // Personal delivery details: keep tracking pages out of search engines.
    robots: { index: false, follow: false },
  };
}

export default async function TrackingPage({ params }: Props) {
  const { token } = await params;
  const tracking = await load(token);
  if (!tracking) notFound();
  return (
    <main className="h-dvh w-full">
      <TrackingView token={token} initial={tracking} />
    </main>
  );
}
