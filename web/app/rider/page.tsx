import type { Metadata } from 'next';
import RiderView from '@/components/RiderView';

export const metadata: Metadata = {
  title: 'Rider View · NIPOST 3D Navigator',
  description: 'Sandbox showing how a dispatch rider app routes to a NIPOST-coded building.',
};

export default async function RiderPage({ searchParams }: { searchParams: Promise<{ code?: string; claim?: string }> }) {
  const { code, claim } = await searchParams;
  return (
    <main className="h-dvh w-full">
      <RiderView
        initialCode={typeof code === 'string' ? code : undefined}
        claimId={typeof claim === 'string' ? claim : undefined}
      />
    </main>
  );
}
