import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { cache } from 'react';
import SharedPlaceView from '@/components/SharedPlaceView';
import { fetchSharedPlace } from '@/lib/api';

type Props = { params: Promise<{ id: string }> };

// generateMetadata and the page both need the place; dedupe to one API call.
const getPlace = cache(fetchSharedPlace);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const place = await getPlace((await params).id);
  if (!place) return { title: 'Link not found · TMTechEASY Delivery' };

  const title = `${place.claim.label} · ${place.formatted}`;
  const description = place.claim.delivery_notes ?? 'Exact 3D location and gate, for deliveries and emergency responders, on TMTechEASY Delivery.';
  return {
    title,
    description,
    // Personal delivery details: keep share pages out of search engines.
    robots: { index: false, follow: false },
    openGraph: { title, description, type: 'website' },
    twitter: { card: 'summary_large_image', title, description },
  };
}

export default async function SharedPlacePage({ params }: Props) {
  const place = await getPlace((await params).id);
  if (!place) notFound();

  return (
    <main className="h-dvh w-full">
      <SharedPlaceView place={place} />
    </main>
  );
}
