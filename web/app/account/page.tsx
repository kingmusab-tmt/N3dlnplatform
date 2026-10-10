import type { Metadata } from 'next';
import MyPlaces from '@/components/MyPlaces';

export const metadata: Metadata = { title: 'My places · NIPOST 3D Navigator', robots: { index: false } };

export default function AccountPage() {
  return (
    <main className="flex min-h-dvh justify-center bg-[#0b0f14] px-4 py-10">
      <MyPlaces />
    </main>
  );
}
