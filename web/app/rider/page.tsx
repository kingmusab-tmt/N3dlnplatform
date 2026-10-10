import type { Metadata } from 'next';
import RiderView from '@/components/RiderView';
import { parsePurpose } from '@/lib/purpose';

export const metadata: Metadata = {
  title: 'Navigator · TMTechEasy Gate',
  description: 'Turn-by-turn directions to the gate of a NIPOST-coded building, for delivery riders and emergency responders.',
};

export default async function RiderPage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string; claim?: string; for?: string }>;
}) {
  const { code, claim, for: purpose } = await searchParams;
  return (
    <main className="h-dvh w-full">
      <RiderView
        initialCode={typeof code === 'string' ? code : undefined}
        claimId={typeof claim === 'string' ? claim : undefined}
        initialPurpose={parsePurpose(purpose)}
      />
    </main>
  );
}
